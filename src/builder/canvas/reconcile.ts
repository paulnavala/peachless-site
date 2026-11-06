/**
 * Makes the frame match the working page. The model is the truth and the page in
 * the frame is a projection of it, so this can run after any change, in any order,
 * and running it twice changes nothing.
 *
 * Content is written into the frame's document only. It never touches the parent
 * page, where a handler in it could run.
 */
import { z } from 'astro/zod';
import { elementSchema, type GridElement } from '../../lib/content-schema';
import { escapeHtml, litHtml, litWords, taglineHtml } from '../../lib/formatters';
import { itemHtml, planGrid } from '../../lib/grid-plan';
import { renderInline, renderMarkdown } from '../../lib/markdown';
import { definitionOf, type FieldDef } from '../../lib/section-catalogue';
import { glueDashes } from '../../lib/typography';
import type { RawPage, RawSection } from '../store';
import { getPath } from '../store';

export interface ReconcileContext {
  /** A fresh copy of a section from the specimens page, for this document. */
  specimen(section: RawSection, doc: Document): Element | null;
  /** The address of an image the site hasn't built, or null to keep what's there. */
  imageUrl(path: string): string | null;
}

/** What each field last wrote, so an unchanged field isn't rewritten. */
const written = new WeakMap<Element, unknown>();

/** Sections taken off the page, kept so an undo gets the same node back. */
const parked = new WeakMap<Document, Map<string, Element>>();

const parkedIn = (doc: Document) => {
  if (!parked.has(doc)) parked.set(doc, new Map());
  return parked.get(doc)!;
};

const isEmpty = (value: unknown) => value === undefined || value === null || value === '';

/** Spaced dashes stay with the word before, as the build's typeset step does. */
function glueText(root: Element): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const glued = glueDashes(node.textContent ?? '');
    if (glued !== node.textContent) node.textContent = glued;
  }
}

function writeField(el: Element, field: FieldDef, value: string): void {
  switch (field.kind) {
    case 'lit':
      el.innerHTML = litHtml(value);
      (el as HTMLElement).style.setProperty('--lit-n', String(litWords(value).length));
      break;
    case 'markdown':
      el.innerHTML = renderMarkdown(value);
      glueText(el);
      break;
    case 'inline-markdown':
      el.innerHTML = renderInline(value);
      glueText(el);
      break;
    default: {
      // A link's text sits inside a span next to its arrow.
      const target = el.querySelector(':scope > span:not(.sr-only)') ?? el;
      target.textContent = glueDashes(`${field.prefix ?? ''}${value}`);
    }
  }
}

function applyField(root: Element, field: FieldDef, section: RawSection): boolean {
  if (field.inspectorOnly || field.kind === 'toggle' || field.kind === 'list') return true;
  const value = getPath(section, field.key);
  const el = root.querySelector(`[data-field="${field.key}"]`);
  if (isEmpty(value)) {
    el?.remove();
    return true;
  }
  // The field's markup isn't here: a built page leaves out an empty optional.
  if (!el) return !!field.soft;
  if (written.get(el) !== value) {
    writeField(el, field, String(value));
    written.set(el, value);
  }
  return true;
}

function applyTagline(root: Element, section: RawSection): boolean {
  const heading = root.querySelector('[data-field="tagline"]');
  if (!heading) return false;
  const line1 = String(section.line1 ?? '');
  const line2 = String(section.line2 ?? '');
  const key = `${line1}\n${line2}`;
  if (written.get(heading) === key) return true;
  heading.querySelector('.sr-only')!.textContent = glueDashes(`${line1} ${line2}`);
  heading.querySelector('.tagline__visual')!.innerHTML = taglineHtml(line1, line2);
  written.set(heading, key);
  return true;
}

function applyFields(root: Element, section: RawSection): boolean {
  let complete = section.type !== 'hero' || applyTagline(root, section);
  for (const field of definitionOf(section.type).fields) {
    if (!applyField(root, field, section)) complete = false;
  }
  return complete;
}

/**
 * Repeats a list's first item to match its data. An empty list hides its whole
 * block, keeping one item to copy from later. Returns false when the data needs
 * markup the page doesn't have.
 */
function applyList(list: Element | null, length: number, fill: (item: Element, index: number) => void): boolean {
  if (!list) return length === 0;
  const block = (list.closest('.about-section') ?? list) as HTMLElement;
  block.hidden = length === 0;
  if (length === 0) return true;
  const template = list.firstElementChild;
  if (!template) return false;
  while (list.children.length > length) list.lastElementChild!.remove();
  while (list.children.length < length) list.append(template.cloneNode(true));
  [...list.children].forEach((item, i) => fill(item, i));
  return true;
}

function setText(root: Element, selector: string, value: unknown): void {
  const el = root.querySelector(selector);
  if (el) el.textContent = glueDashes(String(value ?? ''));
}

function applyLists(root: Element, section: RawSection): boolean {
  let complete = true;
  if (section.type === 'cta-band' && !section.auto) {
    const links = (section.links ?? []) as { label?: string; link?: string }[];
    complete = applyList(root.querySelector('.cta-band__actions'), links.length, (item, i) => {
      item.setAttribute('href', links[i].link ?? '#');
      setText(item, ':scope > span', links[i].label);
    });
  }
  if (section.type === 'profile') {
    const steps = (section.process ?? []) as { title?: string; body?: string }[];
    const jobs = (section.experience ?? []) as { period?: string; role?: string; place?: string }[];
    const hasSteps = applyList(root.querySelector('.about-steps'), steps.length, (item, i) => {
      setText(item, '.about-steps__num', String(i + 1).padStart(2, '0'));
      setText(item, 'h3', steps[i].title);
      setText(item, 'p', steps[i].body);
    });
    const hasJobs = applyList(root.querySelector('.about-experience'), jobs.length, (item, i) => {
      setText(item, '.about-experience__period', jobs[i].period);
      setText(item, '.about-experience__role', jobs[i].role);
      setText(item, '.about-experience__place', jobs[i].place);
    });
    complete = hasSteps && hasJobs;
  }
  return complete;
}

function setAttr(el: Element, name: string, value: string | undefined): void {
  if (value === undefined) el.removeAttribute(name);
  else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function applyRoot(el: Element, section: RawSection): void {
  const surface = section.surface as string | undefined;
  const hasSurface = surface && surface !== 'default';
  // A closing band always has a surface: blush, unless the editor chose another.
  setAttr(el, 'data-surface', hasSurface ? surface : section.type === 'cta-band' ? 'blush' : undefined);
  const top = section.spaceTop as string | undefined;
  const bottom = section.spaceBottom as string | undefined;
  setAttr(el, 'data-space-top', top && top !== 'default' ? top : undefined);
  setAttr(el, 'data-space-bottom', bottom && bottom !== 'default' ? bottom : undefined);
  if (section.type !== 'cta-band') el.classList.toggle('sheet', !!section.sheet);
}

// An image element exists before its picture does, so the canvas allows that.
const canvasElement = elementSchema(() => z.string().optional());

/** An element with its defaults, or null while it's too incomplete to show. */
function parsed(element: unknown): GridElement | null {
  const result = canvasElement.safeParse(element);
  return result.success ? (result.data as GridElement) : null;
}

function imageMarkup(element: Extract<GridElement, { type: 'image' }>, url: string | null): string {
  const caption = element.caption ? `<figcaption class="grid-figure__caption" data-field="caption">${escapeHtml(element.caption)}</figcaption>` : '';
  const fit = element.fit === 'contain' ? 'media--contain' : 'media--cover';
  const image = url ? `<img class="media ${fit}" src="${escapeHtml(url)}" alt="" />` : '';
  return `<figure class="grid-figure"><div class="grid-figure__media">${image}</div>${caption}</figure>`;
}

function applyGrid(root: Element, section: RawSection, ctx: ReconcileContext, opener: boolean, aboveFold: boolean): void {
  const grid = root.querySelector('.grid-section__grid');
  if (!grid) return;
  root.querySelector('.container')?.classList.toggle('container--wide', section.width === 'wide');

  const elements = (section.elements ?? []).map(parsed).filter((e): e is GridElement => e !== null);
  const plan = planGrid(elements, { opener, aboveFold });
  const doc = root.ownerDocument;
  const seen = new Set<Element>();

  for (const planned of plan) {
    const { element, attrs } = planned;
    const signature = JSON.stringify([element, planned.level]);
    let item = grid.querySelector(`:scope > [data-element="${element.id}"]`);

    const url = element.type === 'image' ? ctx.imageUrl(String(element.image ?? '')) : null;
    const keepBuiltImage = element.type === 'image' && item && !url && !isEmpty(element.image);

    if (!item || (written.get(item) !== signature && !keepBuiltImage)) {
      const holder = doc.createElement('div');
      holder.innerHTML = itemHtml(planned, (image) => imageMarkup(image, url));
      const fresh = holder.firstElementChild!;
      glueText(fresh);
      if (item) item.replaceWith(fresh);
      item = fresh;
    } else {
      for (const name of [...item.getAttributeNames()]) {
        if (!(name in attrs) && (name === 'style' || name.startsWith('data-'))) item.removeAttribute(name);
      }
      for (const [name, value] of Object.entries(attrs)) setAttr(item, name, value);
      if (element.type === 'image') setText(item, '.grid-figure__caption', element.caption);
    }
    written.set(item, signature);
    seen.add(item);
    grid.append(item);
  }
  for (const stale of [...grid.children]) if (!seen.has(stale)) stale.remove();
}

/** Points a section copied from the specimens page at its own id. */
function adopt(el: Element, section: RawSection): void {
  const from = el.getAttribute('data-section');
  el.setAttribute('data-section', section.id);
  if (!from) return;
  for (const node of [el, ...el.querySelectorAll('[id], [aria-labelledby]')]) {
    for (const name of ['id', 'aria-labelledby']) {
      const value = node.getAttribute(name);
      if (value?.startsWith(from)) node.setAttribute(name, section.id + value.slice(from.length));
    }
  }
}

/**
 * Names a case study's blocks. Their files give them no ids, so each is known by
 * its place in the file, which is also its place in the built page.
 */
export function stampBlocks(doc: Document, page: RawPage): void {
  const files = page.sections.filter((s) => /^block-\d+$/.test(s.id));
  const story = doc.querySelector('.story');
  if (!story) return;
  // A block can leave its script or dialog beside it, so count only the blocks.
  const blocks = [...story.children].filter((el) => !['SCRIPT', 'STYLE', 'DIALOG', 'TEMPLATE'].includes(el.tagName));
  blocks.forEach((el, i) => {
    el.setAttribute('data-section', `block-${i}`);
    const section = files.find((s) => s.id === `block-${i}`);
    if (section) el.setAttribute('data-section-type', section.type);
  });
}

/** The story's first text block opens in the serif, wherever it has moved to. */
function markLead(story: Element): void {
  const lead = story.querySelector(':scope > .text-block');
  for (const block of story.querySelectorAll(':scope > .text-block')) block.classList.toggle('text-block--lead', block === lead);
}

export function reconcile(doc: Document, page: RawPage, ctx: ReconcileContext): void {
  const main = doc.querySelector(page.story ? '.story' : 'main');
  if (!main) return;
  const store = parkedIn(doc);
  const visible = page.sections.filter((s) => !s.hidden);
  const placed = [...main.children].filter((el) => el.hasAttribute('data-section'));
  const byId = new Map(placed.map((el) => [el.getAttribute('data-section')!, el]));
  const order: Element[] = [];

  visible.forEach((section, i) => {
    const fresh = () => {
      const copy = ctx.specimen(section, doc);
      if (copy) adopt(copy, section);
      return copy;
    };
    let el = byId.get(section.id) ?? store.get(section.id) ?? fresh();
    if (!el) return;

    // A built section may lack the markup for a field that has since been filled
    // in. Specimens have every field, so swap in a whole one and fill it.
    const fieldsFit = applyFields(el, section);
    if (!applyLists(el, section) || !fieldsFit) {
      const whole = fresh();
      if (whole) {
        el.replaceWith(whole);
        el = whole;
        applyFields(el, section);
        applyLists(el, section);
      }
    }
    if (!page.story) applyRoot(el, section);
    if (section.type === 'grid') applyGrid(el, section, ctx, i === 0, i === 0);
    order.push(el);
  });

  for (const [id, el] of byId) {
    if (!order.includes(el)) {
      store.set(id, el);
      el.remove();
    }
  }

  const inPlace = order.every((el, i) => [...main.children].filter((c) => c.hasAttribute('data-section'))[i] === el);
  if (!inPlace) for (const el of order) main.append(el);
  if (page.story) markLead(main);
}
