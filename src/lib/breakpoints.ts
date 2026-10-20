/**
 * The three layout breakpoints (mirrors the comment in tokens.css). Media
 * queries cannot read custom properties, so CSS uses these literal values and
 * tests/unit/style-guard.spec.ts rejects any others.
 */
export const BREAKPOINTS = { sm: '36em', md: '48em', lg: '64em' } as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** `(min-width: 48em)`-style query for matchMedia. */
export const minWidth = (bp: Breakpoint) => `(min-width: ${BREAKPOINTS[bp]})`;
