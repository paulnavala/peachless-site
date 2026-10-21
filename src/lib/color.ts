/** WCAG 2.x colour maths, used by the palette block and the token contrast test. */

/** Parse #rgb / #rrggbb into 0–255 channels. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Luminance of the two label colours the palette block can choose between
// (--ink-strong and --paper in tokens.css); kept as numbers so this file holds
// no colour literals. tokens.spec.ts checks they still match the tokens.
export const INK_LUMINANCE = 0.031;
export const PAPER_LUMINANCE = 0.9265;

/** Which token reads best on a background colour: dark ink or light paper. */
export function readableTextToken(background: string): 'var(--ink-strong)' | 'var(--paper)' {
  const l = relativeLuminance(background);
  const onInk = (l + 0.05) / (INK_LUMINANCE + 0.05);
  const onPaper = (PAPER_LUMINANCE + 0.05) / (l + 0.05);
  return onInk >= onPaper ? 'var(--ink-strong)' : 'var(--paper)';
}

// ── OKLab / OKLCH (Björn Ottosson) ─────────────────────────────────────────
// Perceptual colour space for the project tints: rebuilding a brand colour
// at a fixed OKLab lightness keeps its hue honest (mixing toward paper in
// sRGB greys out dark accents and collapses warm ones into the same blush).

type Lab = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map((c) => toLinear(c / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Linear sRGB channels for an OKLab colour; may fall outside 0–1 (out of gamut). */
function oklabToLinear([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lab: Lab) => oklabToLinear(lab).every((c) => c >= -1e-6 && c <= 1 + 1e-6);

export function oklabToHex(lab: Lab): string {
  return (
    '#' +
    oklabToLinear(lab)
      .map((c) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, c))))) * 255))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Lightness, chroma and hue (radians) of a colour. */
export function hexToOklch(hex: string): { L: number; C: number; h: number } {
  const [L, a, b] = hexToOklab(hex);
  return { L, C: Math.hypot(a, b), h: Math.atan2(b, a) };
}

/** An OKLCH colour as hex, reducing chroma (never hue or lightness) until it fits sRGB. */
export function oklchToHex(L: number, C: number, h: number): string {
  const lab = (c: number): Lab => [L, c * Math.cos(h), c * Math.sin(h)];
  if (inGamut(lab(C))) return oklabToHex(lab(C));
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(lab(mid))) lo = mid;
    else hi = mid;
  }
  return oklabToHex(lab(lo));
}

/** `t` of the way from one colour to another, in OKLab. */
export function mixOklab(from: string, to: string, t: number): string {
  if (t <= 0) return from.toLowerCase();
  if (t >= 1) return to.toLowerCase();
  const a = hexToOklab(from);
  const b = hexToOklab(to);
  return oklabToHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Lab);
}

// ── Project tints ──────────────────────────────────────────────────────────

/** The palette a project tint must work with (built from tokens.css in src/lib/tokens.ts). */
export interface TintPalette {
  /** Where the surface tint retreats to when a rule fails: paper. */
  surface: string;
  /** Body text: must read at 7:1 on the deep (logo) panel; the ink tint retreats to it. */
  ink: string;
  /** Every colour that sits on a tinted band, with its minimum contrast. */
  text: [string, number][];
  /** Surfaces the project ink (numerals, progress line) must read on, besides its tint. */
  canvases: string[];
}

export interface ProjectTint {
  /** Soft band behind text: hero, "next story", story cards. */
  tint: string;
  /** Stronger panel behind transparent logos (no text sits on it). */
  deep: string;
  /** Text-safe brand colour for chapter numbers, quote marks and the progress line. */
  ink: string;
}

/** Lightness (L), share of the accent's chroma kept (k) and its ceiling (max) per output. */
export const TINT_RECIPE = {
  neutral: 0.02, // below this chroma an accent has no hue worth keeping
  tint: { L: 0.92, k: 0.3, max: 0.045 }, // the blush family
  deep: { L: 0.85, k: 0.45, max: 0.075 }, // between blush and clay-light
  ink: { L: 0.47, k: 1, max: 0.12 },
  separation: 2, // a logo drawn in its brand colour stays apart from its panel
  inkOnDeep: 7,
  steps: 20,
} as const;

/**
 * A project's colour atmosphere from its brand accent. Each output is rebuilt in
 * OKLCH (the brand keeps its hue; the peachless palette sets lightness and
 * softness), then walks in OKLab toward a colour already known to be safe until
 * its contrast rules hold — so any accent at all produces readable pages. Throws
 * rather than returning a colour that breaks a rule.
 */
export function projectTint(accent: string, palette: TintPalette, recipe = TINT_RECIPE): ProjectTint {
  const brand = hexToOklch(accent);
  const neutral = brand.C < recipe.neutral;
  const paper = hexToOklch(palette.surface);
  const relight = ({ L, k, max }: { L: number; k: number; max: number }) =>
    neutral ? oklchToHex(L, paper.C, paper.h) : oklchToHex(L, Math.min(brand.C * k, max), brand.h);
  const walk = (from: string, toward: string, ok: (c: string) => boolean) => {
    for (let i = 0; i < recipe.steps; i++) {
      const c = mixOklab(from, toward, i / recipe.steps);
      if (ok(c)) return c;
    }
    return toward.toLowerCase();
  };

  const textOk = (bg: string) => palette.text.every(([fg, min]) => contrastRatio(fg, bg) >= min);
  const tint = walk(relight(recipe.tint), palette.surface, textOk);

  const need = Math.min(recipe.separation, contrastRatio(accent, tint));
  const deepOk = (bg: string) => contrastRatio(palette.ink, bg) >= recipe.inkOnDeep && contrastRatio(accent, bg) >= need;
  const deep = walk(relight(recipe.deep), tint, deepOk);

  const surfaces = [...palette.canvases, tint];
  const inkOk = (fg: string) => surfaces.every((bg) => contrastRatio(fg, bg) >= 4.5);
  const ink = walk(relight(recipe.ink), palette.ink, inkOk);

  if (!textOk(tint) || !deepOk(deep) || !inkOk(ink)) {
    throw new Error(`No readable tint for accent ${accent} (tint ${tint}, deep ${deep}, ink ${ink})`);
  }
  return { tint, deep, ink };
}
