import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, readableTextToken, relativeLuminance } from '../../src/lib/color';

describe('colour maths', () => {
  it('parses short and long hex', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#D29A84')).toEqual([210, 154, 132]);
    expect(() => hexToRgb('peach')).toThrow();
  });

  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('picks a readable label colour for a swatch', () => {
    expect(readableTextToken('#030303')).toBe('var(--paper)');
    expect(readableTextToken('#2e231e')).toBe('var(--paper)');
    expect(readableTextToken('#fef0e4')).toBe('var(--ink-strong)');
    expect(readableTextToken('#e1a892')).toBe('var(--ink-strong)');
  });
});
