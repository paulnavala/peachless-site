import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, INK_LUMINANCE, PAPER_LUMINANCE, relativeLuminance } from '../../src/lib/color';

const css = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'tokens.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);
const rootBlock = css.match(/:root\s*{([\s\S]*?)\n}/)![1];
const tokens = new Map<string, string>(
  [...rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
);

/** Resolve a token to its literal value, following var() references. */
function resolve(name: string, seen = new Set<string>()): string {
  const v = tokens.get(name);
  if (v === undefined) throw new Error(`Unknown token ${name}`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (!ref) return v;
  if (seen.has(ref[1])) throw new Error(`Cycle at ${ref[1]}`);
  return resolve(ref[1], new Set([...seen, name]));
}

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
];

describe('design tokens', () => {
  for (const [fg, bg, min, use] of PAIRS) {
    it(`${fg} on ${bg} meets ${min}:1 (${use})`, () => {
      expect(contrastRatio(resolve(fg), resolve(bg))).toBeGreaterThanOrEqual(min);
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
