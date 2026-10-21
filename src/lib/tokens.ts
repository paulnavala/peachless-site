/**
 * Design-token values the build computes with (project tints are measured
 * against the real palette). Reads tokens.css itself, so colours still live in
 * exactly one file. Uses Vite's ?raw import: fine in Astro and Vitest, not in
 * Playwright specs — they import the pure maths in color.ts instead.
 */
import css from '../styles/tokens.css?raw';
import type { TintPalette } from './color';
import { parseRootTokens, resolveToken } from './tokens-parse';

const tokens = parseRootTokens(css);

const hex = (name: string): string => {
  const value = resolveToken(tokens, name);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} must resolve to a #rrggbb colour, not ${value}`);
  return value.toLowerCase();
};

/** What a project tint must carry: every colour that sits on it, with its minimum ratio. */
export const TINT_PALETTE: TintPalette = {
  surface: hex('--paper'),
  ink: hex('--color-text'),
  text: [
    [hex('--color-text'), 4.5],
    [hex('--color-text-secondary'), 4.5],
    [hex('--color-text-muted'), 4.5],
    [hex('--color-accent-text'), 4.5],
    [hex('--color-border-strong'), 3],
    [hex('--focus-ring'), 3],
  ],
  canvases: [hex('--color-bg'), hex('--paper'), hex('--blush')],
};
