/**
 * A project's colour atmosphere as CSS custom properties, for a `style` attribute
 * on the element that should carry it (the project article, a card, the "next
 * story" band). All three properties are always set, so a themed element never
 * inherits another project's colours. Never put them on <body>, and never point
 * a :root --color-* token at them (tokens.spec requires palette values).
 */
import { projectTint } from './color';
import { TINT_PALETTE } from './tokens';

export type ProjectTheme = Record<'--project-tint' | '--project-tint-deep' | '--project-ink', string>;

/** No accent: the site's own peach tones. */
const PEACH: ProjectTheme = {
  '--project-tint': 'var(--blush)',
  '--project-tint-deep': 'var(--clay-light)',
  '--project-ink': 'var(--color-accent-text)',
};

const cache = new Map<string, ProjectTheme>();

export function projectTheme(accent?: string): ProjectTheme {
  if (!accent) return PEACH;
  let theme = cache.get(accent);
  if (!theme) {
    const { tint, deep, ink } = projectTint(accent, TINT_PALETTE);
    theme = { '--project-tint': tint, '--project-tint-deep': deep, '--project-ink': ink };
    cache.set(accent, theme);
  }
  return theme;
}
