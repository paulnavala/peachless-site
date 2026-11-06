/**
 * The working copy of the site, and every way it can change. The panels and the
 * canvas read this and call these actions; nothing else writes to a page.
 *
 * Pages are kept as raw documents, the way their files hold them, not as the
 * schema parses them: saving a parsed page would write its defaults into the file.
 */
import { computed, reactive } from 'vue';
import { GRID_COLUMNS, type ElementType, type SectionType } from '../lib/content-schema';
import { checkPage, type PageProblem } from '../lib/page-rules';
import { definitionOf, PAGE_IDS, type BlockType } from '../lib/section-catalogue';
import { BLOCK_SAMPLES, SAMPLES } from '../lib/section-samples';
import { clampCell, firstFit, makeRoom, type Cell, type Placed } from './grid/layout';

export type RawElement = Placed & Record<string, unknown>;
export type RawSection = { id: string; type: SectionType | BlockType; hidden?: boolean; elements?: RawElement[] } & Record<string, unknown>;
export interface RawPage {
  title: string;
  hidden?: boolean;
  seo?: { description?: string };
  sections: RawSection[];
  /** A case study: its sections are story blocks, and they sit in .story. */
  story?: boolean;
}

/** site.yaml, as far as the builder cares. */
export interface RawSite {
  nav: { label: string; href: string; cta?: boolean }[];
  [key: string]: unknown;
}

export interface PageEntry {
  id: string;
  /** The page's file, relative to the repo. */
  path: string;
  raw: RawPage;
  /** The document as last saved, to tell what changed. */
  saved: string;
  /** A case study's whole file. The builder only touches its blocks. */
  project?: Record<string, unknown>;
}

export const DEVICES = { desktop: 1440, tablet: 768, phone: 390 } as const;
export type Device = keyof typeof DEVICES;

export type Panel = 'pages' | 'add' | 'layers' | 'checks';

export interface Selection {
  section: string;
  element?: string;
}

/** Case studies sit beside pages, under ids no page can have. */
export const PROJECT = 'project/';
export const isProject = (id: string): boolean => id.startsWith(PROJECT);

/** Where a page's built version lives. */
export const pageUrl = (id: string): string =>
  id === 'home' ? '/' : id === 'work' ? '/projects/' : id.startsWith(PROJECT) ? `/projects/${id.slice(PROJECT.length)}/` : `/${id}/`;

export const pagePath = (id: string): string => `src/content/pages/${id}/index.yaml`;

export const state = reactive({
  pages: {} as Record<string, PageEntry>,
  site: null as { path: string; raw: RawSite; saved: string } | null,
  pageId: 'home',
  selection: null as Selection | null,
  hover: null as Selection | null,
  device: 'desktop' as Device,
  panel: 'add' as Panel,
  /** The field being edited in place on the canvas. */
  editing: null as { section: string; element?: string; key: string } | null,
  /** The inspector field to bring into view, after a double-click on the canvas. */
  focusField: null as string | null,
  /** Where the next section goes, when an editor chose a spot on the canvas. */
  insertAt: null as number | null,
  /** Goes up on every change, so the canvas knows to catch up. */
  revision: 0,
});

interface History {
  past: string[];
  future: string[];
}

const LIMIT = 100;
const histories = new Map<string, History>();
let lastKey: string | null = null;
let lastAt = 0;

const historyOf = (id: string): History => {
  if (!histories.has(id)) histories.set(id, { past: [], future: [] });
  return histories.get(id)!;
};

export const page = computed(() => state.pages[state.pageId]);
export const sections = computed(() => page.value?.raw.sections ?? []);
export const problems = computed<PageProblem[]>(() => {
  void state.revision;
  if (!page.value) return [];
  if (page.value.raw.story) return sections.value.length ? [] : [{ rule: 'required', message: 'A case study needs at least one block.' }];
  // Raw elements carry everything these rules read, without the schema's defaults.
  return checkPage(page.value.id, sections.value as unknown as Parameters<typeof checkPage>[1]);
});
export const dirtyPages = computed(() => Object.values(state.pages).filter((entry) => JSON.stringify(entry.raw) !== entry.saved));
export const dirtySite = computed(() => !!state.site && JSON.stringify(state.site.raw) !== state.site.saved);

export const selectedSection = computed(() => sections.value.find((s) => s.id === state.selection?.section) ?? null);
export const selectedElement = computed(
  () => selectedSection.value?.elements?.find((e) => e.id === state.selection?.element) ?? null
);

/** Replaces the working copy, as after a load. */
export function loadPages(entries: { id: string; path: string; raw: RawPage; project?: Record<string, unknown> }[]): void {
  state.pages = Object.fromEntries(entries.map((e) => [e.id, { ...e, saved: JSON.stringify(e.raw) }]));
  histories.clear();
  lastKey = null;
  state.revision++;
}

export function loadSite(path: string, raw: RawSite): void {
  state.site = { path, raw, saved: JSON.stringify(raw) };
}

export function markSaved(): void {
  for (const entry of Object.values(state.pages)) entry.saved = JSON.stringify(entry.raw);
  if (state.site) state.site.saved = JSON.stringify(state.site.raw);
}

export function pageIds(): string[] {
  const builtIn = PAGE_IDS.filter((id) => state.pages[id]);
  const custom = Object.keys(state.pages).filter((id) => !(PAGE_IDS as readonly string[]).includes(id) && !isProject(id));
  return [...builtIn, ...custom.sort()];
}

export const projectIds = (): string[] => Object.keys(state.pages).filter(isProject).sort();

/**
 * Every change goes through here, so undo sees it. A `key` folds a run of the
 * same small edit, such as typing in one field, into a single step.
 */
export function change(fn: (raw: RawPage) => void, key?: string, holding = false): void {
  const entry = page.value;
  if (!entry) return;
  const history = historyOf(entry.id);
  const now = Date.now();
  // A drag stays one step however long it takes; typing folds while it keeps going.
  const continuing = key !== undefined && key === lastKey && (holding || now - lastAt < 800);
  if (!continuing) {
    history.past.push(JSON.stringify(entry.raw));
    if (history.past.length > LIMIT) history.past.shift();
  }
  history.future = [];
  lastKey = key ?? null;
  lastAt = now;
  fn(entry.raw);
  state.revision++;
}

export const canUndo = computed(() => {
  void state.revision;
  return page.value ? historyOf(page.value.id).past.length > 0 : false;
});
export const canRedo = computed(() => {
  void state.revision;
  return page.value ? historyOf(page.value.id).future.length > 0 : false;
});

function step(from: 'past' | 'future', to: 'past' | 'future'): void {
  const entry = page.value;
  if (!entry) return;
  const history = historyOf(entry.id);
  const snapshot = history[from].pop();
  if (!snapshot) return;
  history[to].push(JSON.stringify(entry.raw));
  entry.raw = JSON.parse(snapshot);
  lastKey = null;
  // What was selected may be gone now.
  const section = entry.raw.sections.find((s) => s.id === state.selection?.section);
  if (!section) state.selection = null;
  else if (state.selection?.element && !section.elements?.some((e) => e.id === state.selection?.element)) {
    state.selection = { section: section.id };
  }
  state.revision++;
}

export const undo = (): void => step('past', 'future');
export const redo = (): void => step('future', 'past');

// Dotted paths into a section: `primary.label`, `links.0.link`.

export function getPath(source: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], source);
}

export function setPath(target: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  const last = parts.pop()!;
  let node = target;
  for (const [i, part] of parts.entries()) {
    if (node[part] === undefined || node[part] === null) node[part] = /^\d+$/.test(parts[i + 1] ?? last) ? [] : {};
    node = node[part] as Record<string, unknown>;
  }
  if (value === undefined || value === '') {
    if (Array.isArray(node)) node[Number(last)] = value;
    else delete node[last];
  } else {
    node[last] = value;
  }
}

const shortId = (): string => Math.random().toString(36).slice(2, 8).replace(/^\d+/, 'x') || 'x';

function freshId(prefix: string, taken: readonly string[]): string {
  if (!taken.includes(prefix)) return prefix;
  for (;;) {
    const id = `${prefix}-${shortId()}`;
    if (!taken.includes(id)) return id;
  }
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const select = (selection: Selection | null): void => {
  state.selection = selection;
  state.editing = null;
};

export function openPage(id: string): void {
  if (!state.pages[id] || id === state.pageId) return;
  state.pageId = id;
  state.selection = null;
  state.hover = null;
  state.editing = null;
  lastKey = null;
  state.revision++;
}

export function addSection(type: SectionType, index: number): void {
  const id = freshId(type, sections.value.map((s) => s.id));
  change((raw) => raw.sections.splice(index, 0, { id, ...copy(SAMPLES[type]) } as RawSection));
  select({ section: id });
}

/** Adds a story block to a case study. */
export function addBlock(type: string, index: number): void {
  const id = freshId(`new-${type}`, sections.value.map((s) => s.id));
  change((raw) => raw.sections.splice(index, 0, { id, ...copy(BLOCK_SAMPLES[type]) } as RawSection));
  select({ section: id });
}

/** A case study's blocks as its file holds them, without the ids the builder gave them. */
export const blocksOf = (raw: RawPage): Record<string, unknown>[] => raw.sections.map(({ id: _id, ...block }) => block);

export function moveSection(id: string, to: number): void {
  change((raw) => {
    const from = raw.sections.findIndex((s) => s.id === id);
    if (from === -1) return;
    const [section] = raw.sections.splice(from, 1);
    raw.sections.splice(Math.max(0, Math.min(raw.sections.length, to)), 0, section);
  });
}

export function duplicateSection(id: string): void {
  const index = sections.value.findIndex((s) => s.id === id);
  const source = sections.value[index];
  if (!source || definitionOf(source.type).once) return;
  const newId = freshId(source.type, sections.value.map((s) => s.id));
  change((raw) => raw.sections.splice(index + 1, 0, { ...copy(source), id: newId }));
  select({ section: newId });
}

export function removeSection(id: string): void {
  change((raw) => {
    raw.sections = raw.sections.filter((s) => s.id !== id);
  });
  if (state.selection?.section === id) select(null);
}

export function toggleHidden(id: string): void {
  change((raw) => {
    const section = raw.sections.find((s) => s.id === id);
    if (!section) return;
    if (section.hidden) delete section.hidden;
    else section.hidden = true;
  });
}

export function setField(sectionId: string, key: string, value: unknown): void {
  change((raw) => {
    const section = raw.sections.find((s) => s.id === sectionId);
    if (section) setPath(section, key, value);
  }, `${sectionId}:${key}`);
}

// Elements in a custom section.

const ELEMENT_SIZE: Record<ElementType, Pick<Cell, 'w' | 'h'>> = {
  heading: { w: 6, h: 2 },
  text: { w: 6, h: 3 },
  image: { w: 6, h: 6 },
  button: { w: 3, h: 1 },
  quote: { w: 6, h: 3 },
  divider: { w: GRID_COLUMNS, h: 1 },
};

const ELEMENT_START: Record<ElementType, Record<string, unknown>> = {
  heading: { text: 'A new heading', style: 'h2' },
  text: { body: 'Write something here.' },
  image: { alt: '' },
  button: { label: 'A button', link: '/contact/', style: 'primary' },
  quote: { quote: 'Kind words from someone you’ve worked with.' },
  divider: {},
};

function sectionOf(raw: RawPage, id: string): RawSection | undefined {
  return raw.sections.find((s) => s.id === id);
}

export function addElement(sectionId: string, type: ElementType, extra: Record<string, unknown> = {}): string | null {
  const section = sectionOf(page.value.raw, sectionId);
  if (!section) return null;
  const elements = section.elements ?? [];
  const id = freshId(type, elements.map((e) => e.id));
  const { w, h } = ELEMENT_SIZE[type];
  const cell = firstFit(elements, w, h);
  change((raw) => {
    const target = sectionOf(raw, sectionId)!;
    target.elements = [...(target.elements ?? []), { id, type, ...cell, ...copy(ELEMENT_START[type]), ...extra } as RawElement];
  });
  select({ section: sectionId, element: id });
  return id;
}

/** Puts an element in a new cell, and moves down whatever was there. */
export function placeElement(sectionId: string, elementId: string, cell: Cell): void {
  const section = sectionOf(page.value.raw, sectionId);
  if (section?.elements) dragElement(sectionId, elementId, cell, copy(section.elements), `place:${elementId}`, false);
}

/**
 * One step of a drag. It starts from `base`, the elements as they were when the
 * drag began, so whatever gets pushed aside comes back as the element moves on.
 */
export function dragElement(sectionId: string, elementId: string, cell: Cell, base: RawElement[], key = `drag:${elementId}`, holding = true): void {
  change(
    (raw) => {
      const section = sectionOf(raw, sectionId);
      const elements = copy(base);
      const element = elements.find((e) => e.id === elementId);
      if (!section || !element) return;
      Object.assign(element, clampCell(cell, element.type));
      section.elements = makeRoom(elements, elementId);
    },
    key,
    holding
  );
}

/** Ends a drag, so the next change is a step of its own. */
export function endGesture(): void {
  lastKey = null;
}

export function setElementField(sectionId: string, elementId: string, key: string, value: unknown): void {
  change((raw) => {
    const element = sectionOf(raw, sectionId)?.elements?.find((e) => e.id === elementId);
    if (element) setPath(element, key, value);
  }, `${elementId}:${key}`);
}

export function duplicateElement(sectionId: string, elementId: string): void {
  const section = sectionOf(page.value.raw, sectionId);
  const source = section?.elements?.find((e) => e.id === elementId);
  if (!section || !source) return;
  const id = freshId(source.type, section.elements!.map((e) => e.id));
  const cell = firstFit(section.elements!, source.w, source.h);
  change((raw) => {
    const target = sectionOf(raw, sectionId)!;
    target.elements!.push({ ...copy(source), ...cell, id });
  });
  select({ section: sectionId, element: id });
}

export function removeElement(sectionId: string, elementId: string): void {
  change((raw) => {
    const section = sectionOf(raw, sectionId);
    if (section) section.elements = section.elements?.filter((e) => e.id !== elementId);
  });
  select({ section: sectionId });
}

/** The menu has room for this many: site.yaml's schema stops there. */
export const MENU_LIMIT = 6;

export const inMenu = (id: string): boolean => !!state.site?.raw.nav.some((item) => item.href === pageUrl(id));

/** Adds a page to the menu, or takes it out. The header, mobile menu and footer all follow it. */
export function setInMenu(id: string, on: boolean): void {
  const site = state.site;
  if (!site) return;
  const href = pageUrl(id);
  if (!on) site.raw.nav = site.raw.nav.filter((item) => item.href !== href);
  else if (!inMenu(id) && site.raw.nav.length < MENU_LIMIT) {
    // The last item is the button, so a new page goes in before it.
    const button = site.raw.nav.findIndex((item) => item.cta);
    const at = button === -1 ? site.raw.nav.length : button;
    site.raw.nav.splice(at, 0, { label: state.pages[id].raw.title, href, cta: false });
  }
  state.revision++;
}

/** A new page: a title and somewhere to go next, which the page rules ask for. */
export function addPage(id: string, title: string): void {
  const raw: RawPage = {
    title,
    sections: [
      { id: 'header', ...copy(SAMPLES['page-header']), heading: title } as RawSection,
      { id: 'next-step', ...copy(SAMPLES['cta-band']) } as RawSection,
    ],
  };
  state.pages[id] = { id, path: pagePath(id), raw, saved: '' };
  openPage(id);
}
