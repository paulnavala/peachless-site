import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexToOklab,
  hexToOklch,
  hexToRgb,
  mixOklab,
  oklabToHex,
  oklchToHex,
  readableTextToken,
  relativeLuminance,
} from '../../src/lib/color';

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

  it('only promises large text on a swatch: the chosen label stays above 3:1', () => {
    const label = { 'var(--paper)': '#faf6f2', 'var(--ink-strong)': '#3d2e28' }; // test copies of the two tokens
    for (let i = 0; i < 2000; i++) {
      const hex = '#' + [i * 7, i * 13 + 5, i * 29 + 11].map((n) => (n % 256).toString(16).padStart(2, '0')).join('');
      expect(contrastRatio(label[readableTextToken(hex)], hex), hex).toBeGreaterThanOrEqual(3);
    }
  });

  it('round-trips hex through OKLab within one 8-bit step', () => {
    for (let i = 0; i < 500; i++) {
      const hex = '#' + [i * 37, i * 91 + 13, i * 53 + 101].map((n) => (n % 256).toString(16).padStart(2, '0')).join('');
      const back = hexToRgb(oklabToHex(hexToOklab(hex)));
      hexToRgb(hex).forEach((c, k) => expect(Math.abs(c - back[k]), hex).toBeLessThanOrEqual(1));
    }
  });

  it('puts white and black at the ends of OKLab lightness', () => {
    expect(hexToOklch('#ffffff').L).toBeCloseTo(1, 3);
    expect(hexToOklch('#ffffff').C).toBeCloseTo(0, 3);
    expect(hexToOklch('#000000').L).toBeCloseTo(0, 6);
  });

  it('mixes in OKLab with exact endpoints', () => {
    expect(mixOklab('#D29A84', '#2E231E', 0)).toBe('#d29a84');
    expect(mixOklab('#D29A84', '#2E231E', 1)).toBe('#2e231e');
    const mid = hexToOklab(mixOklab('#ffffff', '#000000', 0.5))[0];
    expect(mid).toBeGreaterThan(0.45);
    expect(mid).toBeLessThan(0.55);
  });

  it('brings out-of-gamut OKLCH into sRGB by lowering chroma only', () => {
    const hex = oklchToHex(0.85, 0.4, 2.5); // far too vivid for sRGB at this lightness
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(hexToOklch(hex).L).toBeCloseTo(0.85, 2);
  });
});
