import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the design system honest: colours and font names live only in
 * src/styles/tokens.css, stacking uses the --z-* scale, media queries use the
 * three documented breakpoints, and !important stays in the global reset
 * layers. Files that predate the v2 redesign are allowlisted in LEGACY_FILES;
 * that list must only ever shrink and is empty at launch.
 */

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

const LEGACY_FILES = new Set<string>([
  'src/styles/components/close-button-fix.css',
  'src/styles/components/contact-form-core.css',
  'src/styles/components/contact-form.css',
  'src/styles/components/fortune-peach.css',
  'src/styles/components/portfolio-photo.css',
  'src/styles/components/tagline.css',
  'src/styles/components/twin-gallery.css',
  'src/components/static/FortunePeach.astro',
  'src/components/static/TwinGallery.astro',
  'src/components/islands/BeforeAfterSlider.ts',
  'src/components/islands/ContactForm.ts',
  'src/components/islands/PhotographyGallery.ts',
  'src/components/islands/Tagline.ts',
  'src/pages/404.astro',
  'src/pages/about.astro',
  'src/pages/contact.astro',
  'src/pages/index.astro',
  'src/pages/photography.astro',
]);

const EXCLUDED = [/^src\/styles\/tokens\.css$/, /^src\/content\//, /\.d\.ts$/];
const IMPORTANT_ALLOWED = new Set(['src/styles/reset.css', 'src/styles/base.css', 'src/styles/primitives.css']);
const BREAKPOINTS = new Set(['36em', '48em', '64em']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SRC)
  .filter((f) => /\.(css|astro|ts|vue)$/.test(f))
  .map((abs) => ({ abs, rel: relative(ROOT, abs).split(sep).join('/') }))
  .filter(({ rel }) => !EXCLUDED.some((re) => re.test(rel)));

const stripCssComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripIgnored = (s: string) =>
  s
    .split('\n')
    .filter((line) => !line.includes('style-guard-ignore'))
    .join('\n');

/** The parts of a file that are CSS: whole .css files, Astro <style> blocks, style="" attributes. */
function cssOf(rel: string, text: string): string {
  if (rel.endsWith('.css')) return stripCssComments(text);
  if (!rel.endsWith('.astro')) return '';
  const blocks = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const attrs = [...text.replace(/<svg[\s\S]*?<\/svg>/g, '').matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]);
  return stripCssComments([...blocks, ...attrs].join('\n'));
}

/** Script code: .ts/.vue files and Astro <script> blocks / frontmatter. */
function codeOf(rel: string, text: string): string {
  if (rel.endsWith('.ts') || rel.endsWith('.vue')) return text;
  if (!rel.endsWith('.astro')) return '';
  const front = text.match(/^---([\s\S]*?)---/)?.[1] ?? '';
  const scripts = [...text.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return [front, ...scripts].join('\n').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function violations(rel: string, raw: string): string[] {
  const text = stripIgnored(raw);
  const css = cssOf(rel, text);
  const code = codeOf(rel, text);
  const found: string[] = [];

  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) found.push(`hex colour ${m[0]}`);
  for (const m of css.matchAll(/\b(?:rgba?|hsla?)\(\s*[\d.]/g)) found.push(`literal colour ${m[0]}…`);
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (!/^(var\(--font-[\w-]+\)|inherit|initial|unset)$/.test(v)) found.push(`font-family: ${v}`);
  }
  for (const m of css.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/g)) {
    if (/['"]|\b(serif|sans-serif|monospace|system-ui|cursive)\b/.test(m[1].replace(/var\([^)]*\)/g, '')))
      found.push(`font shorthand names a family: ${m[1].trim()}`);
  }
  for (const m of css.matchAll(/z-index\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (!/^(var\(--z-[\w-]+\)|auto|0|-1)$/.test(v)) found.push(`z-index: ${v}`);
  }
  for (const m of css.matchAll(/@media[^{]*/g)) {
    for (const w of m[0].matchAll(/(?:(?:min|max)-width\s*:|width\s*[<>]=?)\s*([\d.]+[a-z%]*)/g)) {
      if (!BREAKPOINTS.has(w[1])) found.push(`breakpoint ${w[1]} (use 36em / 48em / 64em)`);
    }
  }
  if (!IMPORTANT_ALLOWED.has(rel)) {
    for (const _ of css.matchAll(/!important/g)) found.push('!important');
  }
  for (const m of code.matchAll(/['"`]#[0-9a-fA-F]{3,8}['"`]/g)) found.push(`hex colour ${m[0]} in script`);
  for (const m of code.matchAll(/font-family\s*:\s*['"]/g)) found.push(`font-family in script ${m[0]}`);

  return found;
}

describe('style guard', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { abs, rel } of files) {
    if (LEGACY_FILES.has(rel)) continue;
    it(`${rel} uses tokens, the z-scale and the three breakpoints`, () => {
      expect(violations(rel, readFileSync(abs, 'utf8'))).toEqual([]);
    });
  }

  it('legacy allowlist only names files that still exist', () => {
    const present = new Set(files.map((f) => f.rel));
    expect([...LEGACY_FILES].filter((f) => !present.has(f))).toEqual([]);
  });
});
