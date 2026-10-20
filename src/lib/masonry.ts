/** Photos placed by exhaustive search at the end (at most cols^TAIL layouts). */
const TAIL = 7;

/**
 * Deal items into masonry columns so the columns end as level as possible.
 * `heights` are in any common unit (for photos: height ÷ width plus a caption
 * allowance, since every column is the same width).
 *
 * The first row is in order; each later item goes to the shortest column,
 * except the last few, which are placed by trying every layout. Items keep
 * their order within a column. Returns item indices, column by column.
 */
export function dealColumns(heights: number[], cols: number): number[][] {
  const columns: number[][] = Array.from({ length: Math.max(1, cols) }, () => []);
  const sums = columns.map(() => 0);
  const place = (item: number, column: number) => {
    columns[column].push(item);
    sums[column] += heights[item];
  };

  const tailStart = Math.max(columns.length, heights.length - TAIL);
  for (let i = 0; i < Math.min(tailStart, heights.length); i++) {
    place(i, i < columns.length ? i : sums.indexOf(Math.min(...sums)));
  }

  // Layout `code` puts tail item k in column digit k of `code` (base cols).
  const tail = heights.length - tailStart;
  const columnOf = (code: number, k: number) => Math.floor(code / columns.length ** k) % columns.length;
  let best = { spread: Infinity, code: 0 };
  for (let code = 0; tail > 0 && code < columns.length ** tail; code++) {
    const ends = [...sums];
    for (let k = 0; k < tail; k++) ends[columnOf(code, k)] += heights[tailStart + k];
    const spread = Math.max(...ends) - Math.min(...ends);
    if (spread < best.spread) best = { spread, code };
  }
  for (let k = 0; k < tail; k++) place(tailStart + k, columnOf(best.code, k));

  return columns;
}
