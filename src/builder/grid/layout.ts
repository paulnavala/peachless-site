/**
 * The arithmetic of a custom section: where a drag lands, and what makes way.
 * Pure, because this is where a mistake would quietly wreck someone's layout.
 */
import { ELEMENT_MIN_WIDTH, GRID_COLUMNS, GRID_MAX_ROW, type ElementType } from '../../lib/content-schema';

export interface Cell {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface Placed extends Cell {
  id: string;
  type: ElementType;
}

/** A column or row on the page, in the frame's pixels. */
export interface Track {
  start: number;
  size: number;
}

export const overlaps = (a: Cell, b: Cell): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

/** Keeps a cell on the grid and wide enough for what it holds. */
export function clampCell(cell: Cell, type: ElementType): Cell {
  const w = Math.min(GRID_COLUMNS, Math.max(ELEMENT_MIN_WIDTH[type], cell.w));
  const h = Math.min(GRID_MAX_ROW, Math.max(1, cell.h));
  return {
    w,
    h,
    col: Math.min(GRID_COLUMNS - w + 1, Math.max(1, cell.col)),
    row: Math.min(GRID_MAX_ROW - h + 1, Math.max(1, cell.row)),
  };
}

/**
 * Makes room for the element that just moved: whatever it landed on moves down
 * until it's clear, and so on down the column. Nothing moves up, because empty
 * rows are the editor's own spacing.
 */
export function makeRoom<T extends Placed>(elements: readonly T[], movedId: string): T[] {
  const moved = elements.find((element) => element.id === movedId);
  if (!moved) return [...elements];
  const others = elements
    .filter((element) => element.id !== movedId)
    .sort((a, b) => a.row - b.row || a.col - b.col);

  const settled: T[] = [moved];
  for (const element of others) {
    let row = element.row;
    for (let clash = settled.find((s) => overlaps({ ...element, row }, s)); clash; clash = settled.find((s) => overlaps({ ...element, row }, s))) {
      row = clash.row + clash.h;
    }
    settled.push(row === element.row ? element : { ...element, row });
  }
  // The order they came in, so a list on screen doesn't reshuffle.
  return elements.map((element) => settled.find((s) => s.id === element.id)!);
}

/** The first row below everything. */
export const nextFreeRow = (elements: readonly Cell[]): number => Math.max(0, ...elements.map((e) => e.row + e.h - 1)) + 1;

/** Where a new element goes: the first gap that fits, or under everything. */
export function firstFit(elements: readonly Cell[], w: number, h: number): Cell {
  const bottom = nextFreeRow(elements);
  for (let row = 1; row <= bottom; row++) {
    for (let col = 1; col <= GRID_COLUMNS - w + 1; col++) {
      const cell = { col, row, w, h };
      if (!elements.some((e) => overlaps(cell, e))) return cell;
    }
  }
  return { col: 1, row: bottom, w, h };
}

/** Tracks from a grid's computed sizes. */
export function tracksFrom(sizes: readonly number[], gap: number, origin = 0): Track[] {
  let start = origin;
  return sizes.map((size) => {
    const track = { start, size };
    start += size + gap;
    return track;
  });
}

/** The 1-based track nearest a position. Past the last, it carries on at `pitch`. */
export function nearestTrack(tracks: readonly Track[], position: number, pitch = 0): number {
  const last = tracks.at(-1);
  if (last && pitch > 0 && position > last.start + last.size) {
    return tracks.length + Math.max(1, Math.round((position - last.start) / pitch));
  }
  let best = 0;
  let distance = Infinity;
  tracks.forEach((track, i) => {
    const d = Math.abs(track.start - position);
    if (d < distance) {
      distance = d;
      best = i;
    }
  });
  return best + 1;
}

/** A track's far edge is the near edge of a span, so resizing needs the track it ends on. */
export function nearestEnd(tracks: readonly Track[], position: number, pitch = 0): number {
  const last = tracks.at(-1);
  if (last && pitch > 0 && position > last.start + last.size) {
    return tracks.length + Math.max(0, Math.round((position - last.start - last.size) / pitch));
  }
  let best = 0;
  let distance = Infinity;
  tracks.forEach((track, i) => {
    const d = Math.abs(track.start + track.size - position);
    if (d < distance) {
      distance = d;
      best = i;
    }
  });
  return best + 1;
}

export type Edge = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** A cell after dragging one edge to a track. The opposite edge stays put. */
export function resizeTo(cell: Cell, edge: Edge, col: number, row: number, type: ElementType): Cell {
  let { col: left, row: top } = cell;
  let right = cell.col + cell.w - 1;
  let bottom = cell.row + cell.h - 1;
  const minW = ELEMENT_MIN_WIDTH[type];

  if (edge.includes('e')) right = Math.max(left + minW - 1, Math.min(GRID_COLUMNS, col));
  if (edge.includes('w')) left = Math.min(right - minW + 1, Math.max(1, col));
  if (edge.includes('s')) bottom = Math.max(top, Math.min(GRID_MAX_ROW, row));
  if (edge.includes('n')) top = Math.min(bottom, Math.max(1, row));

  return { col: left, row: top, w: right - left + 1, h: bottom - top + 1 };
}
