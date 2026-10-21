import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToOklab, hexToOklch, projectTint, TINT_RECIPE } from '../../src/lib/color';
import { projectTheme } from '../../src/lib/project-theme';
import { TINT_PALETTE } from '../../src/lib/tokens';

/**
 * Any accent Patricia picks in the CMS must give readable pages: every colour
 * that sits on a tint keeps its contrast, logos keep a panel that body text
 * reads on, and the project ink reads on every surface it can land on.
 */
const PROJECTS = join(__dirname, '..', '..', 'src', 'content', 'projects');
const contentAccents = readdirSync(PROJECTS)
  .filter((id) => existsSync(join(PROJECTS, id, 'index.yaml')))
  .map((id) => (parse(readFileSync(join(PROJECTS, id, 'index.yaml'), 'utf8')) as { accent?: string }).accent)
  .filter((a): a is string => Boolean(a));

// Deterministic pseudo-random colours (mulberry32), so a failure reproduces.
function seeded(count: number, seed = 0x9e3779b9): string[] {
  let t = seed;
  const next = () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from(
    { length: count },
    () => '#' + Array.from({ length: 3 }, () => Math.floor(next() * 256).toString(16).padStart(2, '0')).join('')
  );
}

// Hex values as plain strings in a test are fine (src/ is what the style guard covers).
const EXTREMES = ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];
const KNOWN = ['#e1a892', '#d29a84', '#58433b', '#0b2443', '#0071bc', '#18b3b3', '#3f7823', '#da5d18', '#ab75bf', '#909ca8'];
const ACCENTS = [...new Set([...contentAccents.map((a) => a.toLowerCase()), ...KNOWN, ...EXTREMES, ...seeded(400)])];

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
};

describe('project tints', () => {
  it('read their palette from tokens.css', () => {
    const colours = [TINT_PALETTE.surface, TINT_PALETTE.ink, ...TINT_PALETTE.canvases, ...TINT_PALETTE.text.map(([c]) => c)];
    for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('can always retreat to paper: paper passes every rule', () => {
    for (const [fg, min] of TINT_PALETTE.text) expect(contrastRatio(fg, TINT_PALETTE.surface)).toBeGreaterThanOrEqual(min);
  });

  for (const accent of ACCENTS) {
    it(`${accent} gives a readable tint, a logo panel and a project ink`, () => {
      const { tint, deep, ink } = projectTint(accent, TINT_PALETTE);
      for (const c of [tint, deep, ink]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      for (const [fg, min] of TINT_PALETTE.text) {
        expect(contrastRatio(fg, tint), `${fg} on tint ${tint}`).toBeGreaterThanOrEqual(min);
      }
      expect(contrastRatio(TINT_PALETTE.ink, deep), `body text on deep ${deep}`).toBeGreaterThanOrEqual(TINT_RECIPE.inkOnDeep);
      expect(hexToOklab(deep)[0], 'the logo panel is never lighter than the band').toBeLessThanOrEqual(hexToOklab(tint)[0] + 1e-9);
      const need = Math.min(TINT_RECIPE.separation, contrastRatio(accent, tint));
      expect(contrastRatio(accent, deep), 'a brand-coloured logo stays apart from its panel').toBeGreaterThanOrEqual(need - 1e-9);
      for (const bg of [...TINT_PALETTE.canvases, tint]) {
        expect(contrastRatio(ink, bg), `project ink ${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('are deterministic', () => {
    for (const accent of KNOWN) expect(projectTint(accent, TINT_PALETTE)).toEqual(projectTint(accent, TINT_PALETTE));
  });

  it('keep the brand hue of colourful accents', () => {
    for (const accent of [...KNOWN, ...seeded(200, 7)]) {
      const brand = hexToOklch(accent);
      if (brand.C < 0.06) continue;
      const tint = hexToOklch(projectTint(accent, TINT_PALETTE).tint);
      if (tint.C < 0.01) continue; // retreated all the way to paper: no hue left to compare
      expect(hueDistance(brand.h, tint.h), accent).toBeLessThanOrEqual((12 * Math.PI) / 180);
    }
  });

  it('turn black, white and grey into warm paper tones, never cold grey', () => {
    const paper = hexToOklch(TINT_PALETTE.surface);
    for (const accent of ['#000000', '#ffffff', '#808080', '#3d3d3d']) {
      const tint = hexToOklch(projectTint(accent, TINT_PALETTE).tint);
      expect(tint.C, accent).toBeLessThanOrEqual(0.012);
      expect(hueDistance(tint.h, paper.h), accent).toBeLessThanOrEqual((25 * Math.PI) / 180);
    }
  });

  it('fall back to the site’s peach tones without an accent, and always set all three properties', () => {
    expect(projectTheme(undefined)).toEqual({
      '--project-tint': 'var(--blush)',
      '--project-tint-deep': 'var(--clay-light)',
      '--project-ink': 'var(--color-accent-text)',
    });
    expect(Object.keys(projectTheme('#0071BC'))).toEqual(['--project-tint', '--project-tint-deep', '--project-ink']);
  });
});
