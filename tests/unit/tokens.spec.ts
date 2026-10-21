import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, INK_LUMINANCE, PAPER_LUMINANCE, relativeLuminance } from '../../src/lib/color';
import { parseRootTokens, resolveToken } from '../../src/lib/tokens-parse';

const tokens = parseRootTokens(readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'tokens.css'), 'utf8'));
const resolve = (name: string) => resolveToken(tokens, name);

// [foreground, background, minimum ratio, where it's used]
const PAIRS: [string, string, number, string][] = [
  ['--ink-strong', '--linen', 4.5, 'body text'],
  ['--ink-strong', '--paper', 4.5, 'body text on cards'],
  ['--ink-strong', '--blush', 4.5, 'body text on tinted bands'],
  ['--cacao', '--linen', 4.5, 'secondary text'],
  ['--cacao', '--paper', 4.5, 'secondary text on cards'],
  ['--stone', '--linen', 4.5, 'muted text'],
  ['--stone', '--paper', 4.5, 'muted text on cards'],
  ['--stone', '--blush', 4.5, 'muted text on tinted bands'],
  ['--terracotta', '--linen', 4.5, 'accent text, eyebrows, active nav'],
  ['--terracotta', '--paper', 4.5, 'accent text on cards'],
  ['--terracotta', '--blush', 4.5, 'accent text on tinted bands'],
  ['--linen', '--espresso', 4.5, 'text on inverse surfaces'],
  ['--linen', '--espresso-raised', 4.5, 'text on raised inverse surfaces'],
  ['--sand', '--espresso', 4.5, 'muted text on inverse'],
  ['--sand', '--espresso-raised', 4.5, 'muted text on raised inverse'],
  ['--clay', '--espresso', 4.5, 'accent text on inverse'],
  ['--espresso', '--clay', 4.5, 'accent button label'],
  ['--espresso', '--clay-deep', 4.5, 'accent button label on hover'],
  ['--paper', '--terracotta', 4.5, 'primary button hover label'],
  ['--ink-strong', '--clay-light', 4.5, 'selected text'],
  ['--danger', '--linen', 4.5, 'form errors'],
  ['--success', '--linen', 4.5, 'form success'],
  ['--taupe', '--linen', 3, 'control borders (non-text)'],
  ['--taupe', '--paper', 3, 'control borders on cards (non-text)'],
  ['--taupe', '--blush', 3, 'control borders on tinted bands (non-text)'],
  ['--terracotta', '--paper', 3, 'focus ring on cards (non-text)'],
  ['--clay', '--espresso-raised', 3, 'focus ring on raised inverse (non-text)'],
  ['--color-text-dim', '--paper', 3, 'unlit words of a scroll-lit statement (large text)'],
  ['--color-text-dim', '--linen', 3, 'unlit words of a scroll-lit statement (large text)'],
];

// Grain textures and the surface each one sits on. Every pair on that surface
// must still pass on the most-covered pixel (speck colour at peak alpha).
const GRAINS: [string, string][] = [
  ['--grain-paper', '--paper'],
  ['--grain-inverse', '--espresso'],
];

describe('design tokens', () => {
  for (const [fg, bg, min, use] of PAIRS) {
    it(`${fg} on ${bg} meets ${min}:1 (${use})`, () => {
      expect(contrastRatio(resolve(fg), resolve(bg))).toBeGreaterThanOrEqual(min);
    });
  }

  for (const [grain, surface] of GRAINS) {
    it(`${grain} keeps every pair on ${surface} readable at its strongest pixel`, () => {
      const uri = resolve(grain);
      expect(uri, 'filter colours must be sRGB, or they come out far too light').toContain(
        "color-interpolation-filters='sRGB'"
      );
      const values = uri.match(/feColorMatrix values='([^']+)'/)?.[1].trim().split(/\s+/).map(Number) ?? [];
      expect(values).toHaveLength(20);
      // Row 4 is alpha: sum of positive channel weights (noise is 0..1) plus the offset.
      const alpha = values.slice(15, 19).reduce((n, w) => n + Math.max(w, 0), 0) + values[19];
      expect(alpha).toBeGreaterThan(0);
      const speck = [values[4], values[9], values[14]].map((c) => c * 255);
      const pixel =
        '#' +
        hexToRgb(resolve(surface))
          .map((c, i) => Math.round(c * (1 - alpha) + speck[i] * alpha).toString(16).padStart(2, '0'))
          .join('');
      const pairs = PAIRS.filter(([, bg]) => bg === surface);
      expect(pairs.length).toBeGreaterThan(0);
      for (const [fg, , min, use] of pairs) {
        expect(contrastRatio(resolve(fg), pixel), `${fg} (${use}) on ${pixel}`).toBeGreaterThanOrEqual(min);
      }
    });
  }

  it('palette-label luminance constants still match --ink-strong and --paper', () => {
    expect(relativeLuminance(resolve('--ink-strong'))).toBeCloseTo(INK_LUMINANCE, 3);
    expect(relativeLuminance(resolve('--paper'))).toBeCloseTo(PAPER_LUMINANCE, 3);
  });

  it('fluid sizes stay zoomable: every clamp max is at most 2.5× its min', () => {
    for (const [name, value] of tokens) {
      const m = value.match(/^clamp\(\s*([\d.]+)rem\s*,[^,]+,\s*([\d.]+)rem\s*\)$/);
      if (!m) continue;
      expect(Number(m[2]) / Number(m[1]), name).toBeLessThanOrEqual(2.5);
    }
  });

  it('every semantic colour token resolves to a palette value', () => {
    for (const name of tokens.keys()) {
      if (!name.startsWith('--color-') || name === '--color-backdrop' || name === '--color-scrim' || name === '--color-header-bg')
        continue;
      expect(resolve(name), name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
