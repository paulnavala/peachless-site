/**
 * A custom section, from its elements to its HTML. Pure and browser-safe: the
 * site's GridSection.astro and the builder's canvas both build from this, so what
 * an editor sees is what gets built. The one difference is an image's markup,
 * which needs Astro's pipeline at build time.
 *
 * Sizes come from the design tokens by name, in CSS (GridSection.astro). Here
 * there is only arithmetic and text.
 */
import { ELEMENT_MIN_WIDTH, GRID_COLUMNS, type ElementOf, type GridElement } from './content-schema';
import { escapeHtml } from './formatters';
import { renderMarkdown } from './markdown';

export interface GridOptions {
  /** This section opens the page, so its first heading is the page's h1. */
  opener?: boolean;
  /** On the first screen: nothing here may wait for a reveal. */
  aboveFold?: boolean;
}

export interface PlannedElement {
  element: GridElement;
  attrs: Record<string, string>;
  /** Only headings have one. Set by position, so the outline stays sequential. */
  level?: 1 | 2 | 3;
  /** What the browser should fetch for an image at this column span. */
  sizes: string;
}

/** Reading order: top to bottom, then left to right. It is the DOM order too. */
export const readingOrder = <T extends { row: number; col: number }>(elements: readonly T[]): T[] =>
  [...elements].sort((a, b) => a.row - b.row || a.col - b.col);

// Rough cell sizes at full width, only for an image's shape on a phone, where it
// no longer has rows to fill.
const COLUMN = 84;
const ROW = 36;
const GAP = 18;

/** The shape an element has on the desktop grid, as width over height. */
export function cellRatio({ w, h }: { w: number; h: number }): number {
  const width = w * COLUMN + (w - 1) * GAP;
  const height = h * ROW + (h - 1) * GAP;
  return Math.round((width / height) * 100) / 100;
}

/** `sizes` for an image spanning `w` columns. Phones show it full width or half. */
export function imageSizes(w: number, span: 'full' | 'half' = 'full'): string {
  const share = Math.round((w / GRID_COLUMNS) * 100);
  return `(min-width: 64em) ${Math.round((w / GRID_COLUMNS) * 75)}rem, (min-width: 48em) ${share}vw, ${span === 'half' ? 50 : 100}vw`;
}

export function planGrid(elements: readonly GridElement[], { opener = false, aboveFold = false }: GridOptions = {}): PlannedElement[] {
  let headings = 0;
  return readingOrder(elements).map((element, i) => {
    const { id, type, col, row, w, h, align, valign, phone } = element;
    const style = [`--col:${col}`, `--row:${row}`, `--w:${w}`, `--h:${h}`];
    if (type === 'image') style.push(`--ratio:${cellRatio(element)}`);
    // Only images and dividers move on a phone: see content-schema.ts.
    if ((type === 'image' || type === 'divider') && phone.order !== undefined) style.push(`--phone-order:${phone.order}`);
    if (!aboveFold) style.push(`--reveal-index:${i % 4}`);

    const attrs: Record<string, string> = {
      class: `grid-item grid-item--${type}`,
      'data-element': id,
      'data-element-type': type,
      style: style.join(';'),
      ...(align !== 'start' ? { 'data-align': align } : {}),
      ...(valign !== 'start' ? { 'data-valign': valign } : {}),
      ...(phone.hidden ? { 'data-phone-hidden': '' } : {}),
      ...(phone.span === 'half' ? { 'data-phone-span': 'half' } : {}),
      ...(aboveFold ? {} : { 'data-reveal': '' }),
    };

    const planned: PlannedElement = { element, attrs, sizes: imageSizes(w, phone.span) };
    if (type === 'heading') {
      // The first heading leads the section; any later one sits under it.
      const lead = opener ? 1 : 2;
      planned.level = (headings === 0 ? lead : lead + 1) as 1 | 2 | 3;
      headings++;
    }
    return planned;
  });
}

export const attrsHtml = (attrs: Record<string, string>): string =>
  Object.entries(attrs)
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`))
    .join('');

/** An element's contents. Not for images: the caller knows how to make those. */
export function elementHtml({ element, level }: PlannedElement): string {
  switch (element.type) {
    case 'heading': {
      const tag = `h${level ?? 2}`;
      return `<${tag} class="grid-heading" data-style="${element.style}" data-field="text">${escapeHtml(element.text)}</${tag}>`;
    }
    case 'text':
      return `<div class="grid-text flow" data-size="${element.size}" data-field="body">${renderMarkdown(element.body)}</div>`;
    case 'button': {
      const kind = element.style === 'secondary' ? 'btn btn--secondary' : 'btn';
      return `<a class="${kind}" href="${escapeHtml(element.link)}" data-field="label">${escapeHtml(element.label)}</a>`;
    }
    case 'quote': {
      const by = element.attribution ? `<footer class="grid-quote__by" data-field="attribution">${escapeHtml(element.attribution)}</footer>` : '';
      return `<blockquote class="grid-quote"><p class="t-quote" data-field="quote">${escapeHtml(element.quote)}</p>${by}</blockquote>`;
    }
    case 'divider':
      return '<hr class="grid-divider" />';
    default:
      return '';
  }
}

/** A planned element with its wrapper. `imageHtml` supplies an image's markup. */
export function itemHtml(planned: PlannedElement, imageHtml: (element: ElementOf<'image'>, sizes: string) => string): string {
  const { element, attrs, sizes } = planned;
  const inner = element.type === 'image' ? imageHtml(element, sizes) : elementHtml(planned);
  return `<div${attrsHtml(attrs)}>${inner}</div>`;
}

/** Elements too narrow for their words at tablet width. */
export const tooNarrow = (elements: readonly GridElement[]): GridElement[] => elements.filter((e) => e.w < ELEMENT_MIN_WIDTH[e.type]);

const overlaps = (a: GridElement, b: GridElement) =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

/** Every pair of elements that share a cell. */
export function overlapping(elements: readonly GridElement[]): [GridElement, GridElement][] {
  const pairs: [GridElement, GridElement][] = [];
  elements.forEach((a, i) => elements.slice(i + 1).forEach((b) => overlaps(a, b) && pairs.push([a, b])));
  return pairs;
}

/** Elements running past the grid's right edge. */
export const offGrid = (elements: readonly GridElement[]): GridElement[] => elements.filter((e) => e.col + e.w - 1 > GRID_COLUMNS);
