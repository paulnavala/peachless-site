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
