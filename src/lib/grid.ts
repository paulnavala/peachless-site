/**
 * How many columns a set of `count` equal tiles should use: the widest of
 * `choices` whose last row is at least half full, so a row never ends on a
 * lone tile (10 pages from [4, 3]: 4 + 4 + 2, never 3 + 3 + 3 + 1). Failing
 * that, the choice with the fullest last row. Never more columns than tiles.
 */
export function evenColumns(count: number, choices: number[]): number {
  const options = choices.filter((c) => c <= count).sort((a, b) => b - a);
  if (options.length === 0) return Math.max(1, count);
  const fill = (columns: number) => (count % columns === 0 ? 1 : (count % columns) / columns);
  return options.find((c) => fill(c) >= 0.5) ?? options.reduce((best, c) => (fill(c) > fill(best) ? c : best));
}
