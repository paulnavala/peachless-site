/**
 * Runs the canvas: which page is in the frame, how it is sized and scrolled, and
 * where everything on it is. The parent owns scrolling, because the frame's own
 * height has to stay a real window for `100svh` and sticky cards to behave: a tall
 * spacer scrolls, a sticky stage holds the frame still, and we scroll the frame to
 * match. Everything measured here is in stage pixels, ready for the overlay.
 */
import { reactive, watch } from 'vue';
import { DEVICES, page, pageUrl, state, type RawSection, type Selection } from '../store';
import { tracksFrom, type Track } from '../grid/layout';
import { openPage, pageExists } from './frame';
import { reconcile, stampBlocks } from './reconcile';

const MIN_FRAME_HEIGHT = 640;
const SHELL = '/admin/builder/shell/';
const SPECIMENS = '/admin/builder/specimens/';
const BLOCK_SPECIMENS: Record<string, string> = { text: '.text-block', quote: '.quote-block' };

export interface Box {
  id: string;
  type: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface GridGeometry {
  section: string;
  /** Tracks in the frame's pixels, relative to the frame's viewport. */
  columns: Track[];
  rows: Track[];
  /** The distance from one row to the next, for rows that don't exist yet. */
  pitch: number;
}

export const view = reactive({
  ready: false,
  loading: true,
  error: '',
  scale: 1,
  frameWidth: DEVICES.desktop as number,
  frameHeight: 900,
  stageLeft: 0,
  stageHeight: 900,
  contentHeight: 900,
  sections: [] as Box[],
  elements: [] as (Box & { section: string })[],
  grid: null as GridGeometry | null,
});

let frame: HTMLIFrameElement | null = null;
let scroller: HTMLElement | null = null;
let specimens: Document | null = null;
let doc: Document | null = null;
/** The page the frame really holds. */
let shownPage: string | null = null;
let raf = 0;
const images = new Map<string, string>();

export const frameDocument = (): Document | null => doc;

/** Gives the canvas an address to show for an image that isn't built yet. */
export function setImageUrl(path: string, url: string): void {
  images.set(path, url);
}

const context = {
  specimen(section: RawSection, target: Document): Element | null {
    if (!specimens) return null;
    const id = section.type === 'grid' ? 'specimen-grid-default' : `specimen-${section.type}`;
    const source = specimens.querySelector(BLOCK_SPECIMENS[section.type] ?? `[data-section="${id}"]`);
    if (!source) return null;
    const copy = target.importNode(source, true) as Element;
    copy.setAttribute('data-section-type', section.type);
    if (section.type === 'grid') copy.querySelector('.grid-section__grid')?.replaceChildren();
    return copy;
  },
  imageUrl: (path: string) => images.get(path) ?? null,
};

function layout(): void {
  if (!frame || !scroller) return;
  const width = DEVICES[state.device];
  const gutter = 32;
  const available = Math.max(320, scroller.clientWidth - gutter * 2);
  const scale = Math.min(1, available / width);
  const stageHeight = scroller.clientHeight;
  const frameHeight = Math.max(MIN_FRAME_HEIGHT, Math.round(stageHeight / scale));

  view.scale = scale;
  view.frameWidth = width;
  view.frameHeight = frameHeight;
  view.stageHeight = stageHeight;
  view.stageLeft = Math.round((scroller.clientWidth - width * scale) / 2);

  frame.style.width = `${width}px`;
  frame.style.height = `${frameHeight}px`;
  frame.style.transform = `scale(${scale})`;
  frame.style.left = `${view.stageLeft}px`;
  measure();
}

function boxOf(el: Element, id: string, type: string): Box {
  const r = el.getBoundingClientRect();
  const s = view.scale;
  return { id, type, top: r.top * s, left: r.left * s, width: r.width * s, height: r.height * s };
}

/** A grid's tracks, read from what the browser actually laid out. */
function gridGeometry(sectionId: string): GridGeometry | null {
  const grid = doc?.querySelector(`[data-section="${sectionId}"] .grid-section__grid`);
  const window = doc?.defaultView;
  if (!grid || !window) return null;
  const css = window.getComputedStyle(grid);
  const sizes = (value: string) => value.split(' ').map(parseFloat).filter(Number.isFinite);
  const columnGap = parseFloat(css.columnGap) || 0;
  const rowGap = parseFloat(css.rowGap) || 0;
  const rect = grid.getBoundingClientRect();
  const rows = sizes(css.gridTemplateRows);
  const minimum = parseFloat(window.getComputedStyle(doc!.documentElement).getPropertyValue('--space-l')) || 36;
  return {
    section: sectionId,
    columns: tracksFrom(sizes(css.gridTemplateColumns), columnGap, rect.left),
    rows: tracksFrom(rows, rowGap, rect.top),
    pitch: (rows.length ? Math.min(...rows) : minimum) + rowGap,
  };
}

export function measure(): void {
  if (!doc) return;
  const content = doc.documentElement.scrollHeight;
  if (content !== view.contentHeight) view.contentHeight = content;

  view.sections = [...doc.querySelectorAll('main > [data-section], .story > [data-section]')].map((el) =>
    boxOf(el, el.getAttribute('data-section')!, el.getAttribute('data-section-type') ?? 'grid')
  );
  const selected = state.selection?.section;
  view.elements = selected
    ? [...doc.querySelectorAll(`[data-section="${selected}"] [data-element]`)].map((el) => ({
        ...boxOf(el, el.getAttribute('data-element')!, el.getAttribute('data-element-type') ?? ''),
        section: selected,
      }))
    : [];
  view.grid = selected ? gridGeometry(selected) : null;
}

/** Catches the frame up with the model. */
export function sync(): void {
  const current = page.value;
  // While a new page loads, the frame still holds the last one.
  if (!doc || !current || shownPage !== current.id) return;
  reconcile(doc, current.raw, context);
  measure();
}

function frameScroll(): void {
  if (!frame?.contentWindow || !scroller) return;
  frame.contentWindow.scrollTo(0, scroller.scrollTop / view.scale);
  measure();
}

async function showPage(id: string): Promise<void> {
  if (!frame) return;
  view.loading = true;
  view.error = '';
  const url = pageUrl(id);
  try {
    shownPage = null;
    doc = await openPage(frame, (await pageExists(url)) ? url : SHELL);
    // The editor may have moved on while this one loaded.
    if (id !== state.pageId) return;
    shownPage = id;
    if (page.value?.raw.story) stampBlocks(doc, page.value.raw);
    // Fonts and images settle the page's height after it first loads.
    await doc.fonts.ready;
    sync();
    if (scroller) scroller.scrollTop = 0;
    frameScroll();
  } catch (error) {
    view.error = error instanceof Error ? error.message : 'This page didn’t load.';
  } finally {
    view.loading = false;
  }
}

export async function mountCanvas(frameEl: HTMLIFrameElement, specimenFrame: HTMLIFrameElement, scrollerEl: HTMLElement): Promise<void> {
  frame = frameEl;
  scroller = scrollerEl;
  scroller.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frameScroll);
  });
  new ResizeObserver(layout).observe(scroller);
  layout();

  specimens = await openPage(specimenFrame, SPECIMENS);
  await showPage(state.pageId);
  view.ready = true;

  watch(() => state.pageId, showPage);
  watch(() => state.revision, sync);
  watch(() => state.device, () => {
    layout();
    sync();
  });
  watch(() => state.selection, measure);

  // The frame can't tell us when an image or font changes its height, so we look.
  setInterval(measure, 700);
}

/** What's under a point on the stage. */
export function hitTest(stageX: number, stageY: number): (Selection & { field?: string }) | null {
  if (!doc) return null;
  const hit = doc.elementFromPoint(stageX / view.scale, stageY / view.scale);
  const section = hit?.closest('[data-section]');
  if (!section) return null;
  const element = hit?.closest('[data-element]');
  const field = hit?.closest('[data-field]')?.getAttribute('data-field') ?? undefined;
  return {
    section: section.getAttribute('data-section')!,
    element: element?.getAttribute('data-element') ?? undefined,
    field,
  };
}

/** Finds a field's element, for editing it in place. */
export function fieldElement(section: string, element: string | undefined, key: string): HTMLElement | null {
  if (!doc) return null;
  const root = element ? `[data-section="${section}"] [data-element="${element}"]` : `[data-section="${section}"]`;
  return doc.querySelector<HTMLElement>(`${root} [data-field="${key}"]`);
}

export function scrollToSection(id: string): void {
  const box = view.sections.find((s) => s.id === id);
  if (box && scroller) scroller.scrollTop += box.top - 24;
}

/** Shows the page afresh, after the site itself has changed. */
export const reloadCanvas = (): Promise<void> => showPage(state.pageId);

export function scrollBy(pixels: number): void {
  if (scroller) scroller.scrollTop += pixels;
}
