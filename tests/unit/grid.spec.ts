import { describe, expect, it } from 'vitest';
import { evenColumns } from '../../src/lib/grid';

describe('evenColumns', () => {
  it('prefers the widest choice that fills its rows', () => {
    expect(evenColumns(10, [5, 4])).toBe(5);
    expect(evenColumns(12, [5, 4])).toBe(4);
    expect(evenColumns(9, [4, 3])).toBe(3);
  });

  it('accepts a last row that is at least half full', () => {
    expect(evenColumns(10, [4, 3])).toBe(4); // 4 + 4 + 2, not 3 + 3 + 3 + 1
    expect(evenColumns(7, [5, 4])).toBe(4); // 4 + 3, not 5 + 2
    expect(evenColumns(11, [5, 4])).toBe(4); // 4 + 4 + 3, not 5 + 5 + 1
  });

  it('otherwise takes the choice whose last row is fullest', () => {
    expect(evenColumns(16, [5, 3])).toBe(3); // one left over either way: a third of a row beats a fifth
  });

  it('never uses more columns than there are tiles', () => {
    expect(evenColumns(3, [5, 4])).toBe(3);
    expect(evenColumns(2, [4, 3])).toBe(2);
    expect(evenColumns(1, [4, 3])).toBe(1);
    expect(evenColumns(0, [4, 3])).toBe(1);
  });

  it('does not care about the order of the choices', () => {
    expect(evenColumns(10, [4, 5])).toBe(5);
  });
});
