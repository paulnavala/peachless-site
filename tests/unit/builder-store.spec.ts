import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store only touches the canvas through images, which the store doesn't import.
import {
  addElement,
  addPage,
  addSection,
  canRedo,
  canUndo,
  change,
  dirtyPages,
  dragElement,
  duplicateSection,
  endGesture,
  getPath,
  loadPages,
  markSaved,
  moveSection,
  openPage,
  page,
  placeElement,
  problems,
  redo,
  removeElement,
  removeSection,
  sections,
  select,
  setElementField,
  setField,
  setPath,
  state,
  toggleHidden,
  undo,
  type RawElement,
  type RawPage,
} from '../../src/builder/store';

const start = (): RawPage => ({
  title: 'Test',
  sections: [
    { id: 'header', type: 'page-header', heading: 'A page' },
    { id: 'grid', type: 'grid', elements: [{ id: 'a', type: 'heading', col: 1, row: 1, w: 6, h: 2, text: 'Hi' } as RawElement] },
    { id: 'next-step', type: 'cta-band', heading: 'Next', links: [] },
  ],
});

beforeEach(() => {
  loadPages([{ id: 'new-page', path: 'src/content/pages/new-page/index.yaml', raw: start() }]);
  state.pageId = 'new-page';
  state.selection = null;
});

const ids = () => sections.value.map((s) => s.id);
const grid = () => sections.value.find((s) => s.id === 'grid')!;

describe('paths', () => {
  it('reads and writes through dots', () => {
    const target: Record<string, unknown> = {};
    setPath(target, 'primary.label', 'Go');
    expect(target).toEqual({ primary: { label: 'Go' } });
    expect(getPath(target, 'primary.label')).toBe('Go');
  });

  it('removes a key left empty, so it doesn’t reach the file', () => {
    const target: Record<string, unknown> = { intro: 'Hello' };
    setPath(target, 'intro', '');
    expect(target).toEqual({});
  });

  it('reads nothing from a missing path', () => {
    expect(getPath({}, 'a.b.c')).toBeUndefined();
  });
});

describe('undo', () => {
  it('reverses a change, and redo restores it', () => {
    setField('header', 'heading', 'Changed');
    undo();
    expect(sections.value[0].heading).toBe('A page');
    expect(canRedo.value).toBe(true);
    redo();
    expect(sections.value[0].heading).toBe('Changed');
  });

  it('folds typing in one field into one step', () => {
    setField('header', 'heading', 'A');
    setField('header', 'heading', 'Ab');
    setField('header', 'heading', 'Abc');
    undo();
    expect(sections.value[0].heading).toBe('A page');
    expect(canUndo.value).toBe(false);
  });

  it('keeps a different field as a different step', () => {
    setField('header', 'heading', 'A');
    setField('header', 'intro', 'B');
    undo();
    expect(sections.value[0].heading).toBe('A');
    expect(sections.value[0].intro).toBeUndefined();
  });

  it('starts a new step once typing has paused', () => {
    vi.useFakeTimers();
    setField('header', 'heading', 'First');
    vi.advanceTimersByTime(1000);
    setField('header', 'heading', 'Second');
    undo();
    expect(sections.value[0].heading).toBe('First');
    vi.useRealTimers();
  });

  it('forgets redo after a new change', () => {
    setField('header', 'heading', 'A');
    undo();
    setField('header', 'intro', 'B');
    expect(canRedo.value).toBe(false);
  });

  it('keeps each page’s history apart', () => {
    addPage('other', 'Other');
    setField('header', 'heading', 'On the other page');
    openPage('new-page');
    expect(canUndo.value).toBe(false);
  });

  it('clears a selection that undo took away', () => {
    addSection('manifesto', 1);
    expect(state.selection?.section).toBe('manifesto');
    undo();
    expect(state.selection).toBeNull();
  });

  it('falls back to the section when an element is undone away', () => {
    const id = addElement('grid', 'text')!;
    expect(state.selection).toEqual({ section: 'grid', element: id });
    undo();
    expect(state.selection).toEqual({ section: 'grid' });
  });
});

describe('sections', () => {
  it('adds a filled-in section where asked', () => {
    addSection('manifesto', 1);
    expect(ids()).toEqual(['header', 'manifesto', 'grid', 'next-step']);
    expect(sections.value[1].heading).toBeTruthy();
  });

  it('gives a second section of a kind its own id', () => {
    addSection('cta-band', 1);
    expect(new Set(ids()).size).toBe(4);
  });

  it('gives a duplicate its own id, and doesn’t share its data', () => {
    duplicateSection('grid');
    expect(ids()).toHaveLength(4);
    const copy = sections.value[2];
    setElementField(copy.id, 'a', 'text', 'Only the copy');
    expect(grid().elements![0].text).toBe('Hi');
  });

  it('won’t duplicate a section there can be only one of', () => {
    duplicateSection('header');
    expect(ids()).toHaveLength(3);
  });

  it('moves a section', () => {
    moveSection('next-step', 0);
    expect(ids()).toEqual(['next-step', 'header', 'grid']);
  });

  it('removes a section and its selection', () => {
    select({ section: 'grid' });
    removeSection('grid');
    expect(ids()).toEqual(['header', 'next-step']);
    expect(state.selection).toBeNull();
  });

  it('leaves no key behind when a section is shown again', () => {
    toggleHidden('grid');
    expect(grid().hidden).toBe(true);
    toggleHidden('grid');
    expect('hidden' in grid()).toBe(false);
  });
});

describe('elements', () => {
  it('puts a new element in the first gap', () => {
    addElement('grid', 'quote');
    const quote = grid().elements!.find((e) => e.type === 'quote')!;
    expect(quote).toMatchObject({ col: 7, row: 1 });
  });

  it('moves down what an element lands on', () => {
    addElement('grid', 'text');
    const text = grid().elements!.find((e) => e.type === 'text')!;
    placeElement('grid', text.id, { col: 1, row: 1, w: 6, h: 3 });
    expect(grid().elements!.find((e) => e.id === 'a')!.row).toBe(4);
  });

  it('keeps a placed element on the grid', () => {
    placeElement('grid', 'a', { col: 11, row: 1, w: 6, h: 2 });
    expect(grid().elements![0].col).toBe(7);
  });

  it('removes an element and selects its section', () => {
    select({ section: 'grid', element: 'a' });
    removeElement('grid', 'a');
    expect(grid().elements).toEqual([]);
    expect(state.selection).toEqual({ section: 'grid' });
  });
});

describe('a drag', () => {
  const base = () => JSON.parse(JSON.stringify(grid().elements)) as RawElement[];

  it('is one step of undo, however long it took', () => {
    vi.useFakeTimers();
    const from = base();
    dragElement('grid', 'a', { col: 2, row: 1, w: 6, h: 2 }, from);
    vi.advanceTimersByTime(5000);
    dragElement('grid', 'a', { col: 3, row: 1, w: 6, h: 2 }, from);
    endGesture();
    undo();
    expect(grid().elements![0].col).toBe(1);
    vi.useRealTimers();
  });

  it('starts over from the same base, so anything pushed aside comes back', () => {
    addElement('grid', 'text');
    const textId = grid().elements!.find((e) => e.type === 'text')!.id;
    placeElement('grid', textId, { col: 1, row: 3, w: 6, h: 2 });
    const from = base();

    dragElement('grid', 'a', { col: 1, row: 3, w: 6, h: 2 }, from);
    expect(grid().elements!.find((e) => e.id === textId)!.row).toBe(5);

    dragElement('grid', 'a', { col: 7, row: 1, w: 6, h: 2 }, from);
    expect(grid().elements!.find((e) => e.id === textId)!.row).toBe(3);
  });
});

describe('what’s unsaved', () => {
  it('starts clean', () => {
    expect(dirtyPages.value).toEqual([]);
  });

  it('notices a change, and clears when saved', () => {
    setField('header', 'heading', 'Changed');
    expect(dirtyPages.value.map((p) => p.id)).toEqual(['new-page']);
    markSaved();
    expect(dirtyPages.value).toEqual([]);
  });

  it('counts undoing back to the saved state as clean', () => {
    setField('header', 'heading', 'Changed');
    undo();
    expect(dirtyPages.value).toEqual([]);
  });

  it('counts a new page as unsaved', () => {
    addPage('fresh', 'Fresh');
    expect(dirtyPages.value.map((p) => p.id)).toContain('fresh');
  });
});

describe('a new page', () => {
  it('starts valid, with a title and a way on', () => {
    addPage('fresh', 'Fresh');
    expect(page.value.raw.sections.map((s) => s.type)).toEqual(['page-header', 'cta-band']);
    expect(page.value.raw.sections[0].heading).toBe('Fresh');
    expect(problems.value).toEqual([]);
  });
});

describe('problems', () => {
  it('update with the page', () => {
    expect(problems.value).toEqual([]);
    moveSection('next-step', 1);
    expect(problems.value.map((p) => p.rule)).toContain('next-step');
  });

  it('catch a change', () => {
    change((raw) => {
      raw.sections = raw.sections.slice(2);
    });
    expect(problems.value.some((p) => p.rule === 'opener')).toBe(true);
  });
});
