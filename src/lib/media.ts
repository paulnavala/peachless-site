/** The standard srcset steps for raster images (Media.astro). */
export const SRCSET_STEPS = [480, 800, 1200, 1600, 2400];

/**
 * Widths to offer for an image `sourceWidth` pixels wide: every step below it,
 * plus the source's own width (up to the largest step), so a 1052px logo is
 * offered at 1052w, not capped at 800w. Never wider than the source.
 */
export function srcsetWidths(sourceWidth: number, steps: number[] = SRCSET_STEPS): number[] {
  const below = steps.filter((w) => w < sourceWidth);
  const top = Math.min(sourceWidth, Math.max(...steps));
  return below.includes(top) ? below : [...below, top];
}
