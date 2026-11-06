import { describe, expect, it } from 'vitest';
import {
  clampCell,
  firstFit,
  makeRoom,
  nearestEnd,
  nearestTrack,
  nextFreeRow,
  overlaps,
  resizeTo,
  tracksFrom,
  type Placed,
} from '../../src/builder/grid/layout';

const el = (id: string, col: number, row: number, w: number, h: number): Placed => ({ id, type: 'text', col, row, w, h });

describe('clampCell', () => {
  it('keeps a cell on the grid', () => {
    expect(clampCell({ col: 11, row: 1, w: 6, h: 1 }, 'text')).toMatchObject({ col: 7, w: 6 });
    expect(clampCell({ col: -2, row: -2, w: 6, h: 1 }, 'text')).toMatchObject({ col: 1, row: 1 });
  });

  it('keeps an element wide enough for its words', () => {
    expect(clampCell({ col: 1, row: 1, w: 1, h: 1 }, 'text').w).toBe(3);
    expect(clampCell({ col: 1, row: 1, w: 1, h: 1 }, 'divider').w).toBe(1);
  });

  it('never makes a cell wider than the grid', () => {
    expect(clampCell({ col: 1, row: 1, w: 40, h: 1 }, 'text')).toMatchObject({ col: 1, w: 12 });
  });
});

describe('makeRoom', () => {
  it('leaves everything alone when nothing clashes', () => {
    const list = [el('a', 1, 1, 6, 2), el('b', 7, 1, 6, 2)];
    expect(makeRoom(list, 'a')).toEqual(list);
  });

  it('moves down whatever the element landed on', () => {
    const list = [el('moved', 1, 1, 6, 2), el('below', 1, 2, 6, 2)];
    expect(makeRoom(list, 'moved').find((e) => e.id === 'below')!.row).toBe(3);
  });

  it('carries the push down the column', () => {
    const list = [el('moved', 1, 1, 6, 3), el('b', 1, 3, 6, 2), el('c', 1, 5, 6, 2)];
    const result = makeRoom(list, 'moved');
    expect(result.find((e) => e.id === 'b')!.row).toBe(4);
    expect(result.find((e) => e.id === 'c')!.row).toBe(6);
  });

  it('never moves anything up, because empty rows are the editor’s spacing', () => {
    const list = [el('moved', 1, 1, 6, 1), el('far', 1, 10, 6, 1)];
    expect(makeRoom(list, 'moved').find((e) => e.id === 'far')!.row).toBe(10);
  });

  it('leaves neighbours in other columns where they are', () => {
    const list = [el('moved', 1, 1, 6, 3), el('beside', 7, 1, 6, 3)];
    expect(makeRoom(list, 'moved').find((e) => e.id === 'beside')!.row).toBe(1);
  });

  it('never leaves an overlap', () => {
    const list = [el('moved', 3, 2, 8, 4), el('a', 1, 1, 6, 2), el('b', 7, 2, 6, 3), el('c', 1, 3, 4, 4), el('d', 5, 4, 8, 2)];
    const result = makeRoom(list, 'moved');
    result.forEach((a, i) => result.slice(i + 1).forEach((b) => expect(overlaps(a, b), `${a.id} ${b.id}`).toBe(false)));
  });

  it('keeps the list’s order', () => {
    const list = [el('a', 1, 2, 6, 2), el('moved', 1, 1, 6, 2)];
    expect(makeRoom(list, 'moved').map((e) => e.id)).toEqual(['a', 'moved']);
  });

  it('ignores an id it can’t find', () => {
    const list = [el('a', 1, 1, 6, 2)];
    expect(makeRoom(list, 'nope')).toEqual(list);
  });
});

describe('finding a free spot', () => {
  it('starts at the top of an empty section', () => {
    expect(firstFit([], 6, 2)).toEqual({ col: 1, row: 1, w: 6, h: 2 });
  });

  it('uses a gap beside what’s there', () => {
    expect(firstFit([el('a', 1, 1, 6, 2)], 6, 2)).toEqual({ col: 7, row: 1, w: 6, h: 2 });
  });

  it('goes underneath when nothing fits', () => {
    expect(firstFit([el('a', 1, 1, 12, 2)], 6, 2)).toEqual({ col: 1, row: 3, w: 6, h: 2 });
  });

  it('knows where everything ends', () => {
    expect(nextFreeRow([el('a', 1, 2, 6, 3), el('b', 7, 1, 6, 1)])).toBe(5);
    expect(nextFreeRow([])).toBe(1);
  });
});

describe('snapping', () => {
  const columns = tracksFrom([80, 80, 80, 80], 20, 100);

  it('lays tracks out from their sizes and gap', () => {
    expect(columns.map((t) => t.start)).toEqual([100, 200, 300, 400]);
  });

  it('snaps a position to the nearest track’s start', () => {
    expect(nearestTrack(columns, 148)).toBe(1);
    expect(nearestTrack(columns, 152)).toBe(2);
    expect(nearestTrack(columns, -500)).toBe(1);
  });

  it('snaps an edge to the nearest track’s end', () => {
    expect(nearestEnd(columns, 185)).toBe(1);
    expect(nearestEnd(columns, 285)).toBe(2);
  });

  it('carries on past the last row, so a section can grow downwards', () => {
    expect(nearestTrack(columns, 600, 100)).toBe(6);
    expect(nearestEnd(columns, 680, 100)).toBe(6);
  });

  it('stops at the last column when there’s no pitch to carry on with', () => {
    expect(nearestTrack(columns, 5000)).toBe(4);
  });
});

describe('resizing', () => {
  const cell = { col: 3, row: 2, w: 4, h: 3 };

  it('moves only the edge being dragged', () => {
    expect(resizeTo(cell, 'e', 8, 0, 'text')).toEqual({ col: 3, row: 2, w: 6, h: 3 });
    expect(resizeTo(cell, 's', 0, 6, 'text')).toEqual({ col: 3, row: 2, w: 4, h: 5 });
  });

  it('keeps the far side still when dragging the near one', () => {
    expect(resizeTo(cell, 'w', 1, 0, 'text')).toEqual({ col: 1, row: 2, w: 6, h: 3 });
    expect(resizeTo(cell, 'n', 0, 1, 'text')).toEqual({ col: 3, row: 1, w: 4, h: 4 });
  });

  it('handles a corner', () => {
    expect(resizeTo(cell, 'se', 12, 8, 'text')).toEqual({ col: 3, row: 2, w: 10, h: 7 });
  });

  it('won’t go below the element’s minimum width, from either side', () => {
    expect(resizeTo(cell, 'e', 1, 0, 'text').w).toBe(3);
    const fromLeft = resizeTo(cell, 'w', 12, 0, 'text');
    expect(fromLeft.w).toBe(3);
    expect(fromLeft.col + fromLeft.w - 1).toBe(6);
  });

  it('won’t cross the grid’s edge', () => {
    expect(resizeTo(cell, 'e', 99, 0, 'text')).toMatchObject({ w: 10 });
  });

  it('won’t invert', () => {
    expect(resizeTo(cell, 's', 0, 1, 'text').h).toBe(1);
    expect(resizeTo(cell, 'n', 0, 40, 'text')).toEqual({ col: 3, row: 4, w: 4, h: 1 });
  });
});
