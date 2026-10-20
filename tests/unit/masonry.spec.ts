import { describe, expect, it } from 'vitest';
import { dealColumns } from '../../src/lib/masonry';

// Height ÷ width of the photos at the time of the v2 launch, plus the gallery's
// caption allowance.
const LAUNCH_SET = [1.333, 2.165, 1.778, 0.444, 1.526, 0.796, 0.652, 1.334].map((r) => r + 0.18);

const ends = (heights: number[], columns: number[][]) => columns.map((c) => c.reduce((sum, i) => sum + heights[i], 0));
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

const expectWellFormed = (heights: number[], columns: number[][], cols: number) => {
  expect(columns).toHaveLength(cols);
  expect(columns.flat().sort((a, b) => a - b)).toEqual(heights.map((_, i) => i));
  for (const column of columns) expect(column).toEqual([...column].sort((a, b) => a - b));
  // The first row reads in order.
  expect(columns.slice(0, Math.min(cols, heights.length)).map((c) => c[0])).toEqual(heights.slice(0, cols).map((_, i) => i));
};

describe('masonry columns', () => {
  it('keeps a single column in order', () => {
    expect(dealColumns(LAUNCH_SET, 1)).toEqual([LAUNCH_SET.map((_, i) => i)]);
  });

  for (const cols of [2, 3]) {
    it(`ends ${cols} columns level for the launch photos`, () => {
      const columns = dealColumns(LAUNCH_SET, cols);
      expectWellFormed(LAUNCH_SET, columns, cols);
      expect(spread(ends(LAUNCH_SET, columns))).toBeLessThan(0.2);
    });
  }

  it('gives each photo its own column when there are fewer photos than columns', () => {
    expect(dealColumns([1, 2], 3)).toEqual([[0], [1], []]);
  });

  it('stays quick and well formed for a large gallery', () => {
    const many = Array.from({ length: 60 }, (_, i) => 0.5 + ((i * 37) % 17) / 10);
    const started = performance.now();
    const columns = dealColumns(many, 3);
    expect(performance.now() - started).toBeLessThan(200);
    expectWellFormed(many, columns, 3);
    expect(spread(ends(many, columns))).toBeLessThan(0.5);
  });
});
