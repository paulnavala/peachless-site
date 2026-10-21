import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, fontProviders } from 'astro/config';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';
import { REDIRECTS } from './redirects.config.mjs';
import { glueDashesInHtml } from './src/lib/typography.ts';

// Every built page is typeset once more: a spaced dash is glued to the word
// before it, so no line starts with "—" (src/lib/typography.ts). CMS text,
// markdown and captions all get it; the admin is left alone.
const typeset = {
  name: 'peachless-typeset',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const root = fileURLToPath(dir);
      for (const file of await readdir(root, { recursive: true })) {
        if (!file.endsWith('.html') || file.startsWith('admin')) continue;
        const path = join(root, file);
        const html = await readFile(path, 'utf8');
        const set = glueDashesInHtml(html);
        if (set !== html) await writeFile(path, set);
      }
    },
  },
};

// Fonts come from pinned @fontsource-variable packages through the local
// provider, so builds are deterministic and need no font CDN. Cormorant
// Garamond (display) and Inter (body/UI) stand in for the brand book's Minion
// Display and Neue Haas Grotesk; the wordmark is outlined (ui/Wordmark.astro).
const fsv = (pkg, file) => `./node_modules/@fontsource-variable/${pkg}/files/${file}`;

// Romanian letters (Ă ă Ș ș Ț ț, plus the older cedilla forms Ş ş Ţ ţ; Â â Î î
// are already latin) as their own small families, listed first in the font
// tokens. A browser downloads one only on a page that uses those letters, and
// none is preloaded: as variants of the main families they would be, because
// preloads can't tell local subsets apart. The ~3 KB files in src/assets/fonts
// are cut from the packages' latin-ext files (same pinned versions), keeping
// the weight axis:
//   pyftsubset <pkg>-latin-ext-wght-<style>.woff2 --unicodes=<RO> --flavor=woff2
const RO = ['U+0102-0103', 'U+015E-015F', 'U+0162-0163', 'U+0218-021B'];
const ro = (file, weight, style) => ({ src: [`./src/assets/fonts/${file}`], weight, style, unicodeRange: RO });

export default defineConfig({
  site: 'https://peachless.design',
  integrations: [
    vue(),
    // The logo-design alias page carries a canonical link to graphic-design;
    // only the canonical URL belongs in the sitemap.
    sitemap({ filter: (url) => !url.endsWith('/projects/logo-design/') }),
    typeset,
  ],
  redirects: REDIRECTS,
  // A project folder named like a static page fails the build instead of
  // silently shadowing (or being shadowed by) that page.
  prerenderConflictBehavior: 'error',
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Cormorant Garamond',
      cssVariable: '--font-cormorant',
      fallbacks: ['Georgia', 'serif'],
      options: {
        variants: [
          {
            src: [fsv('cormorant-garamond', 'cormorant-garamond-latin-wght-normal.woff2')],
            weight: '300 700',
            style: 'normal',
          },
          {
            src: [fsv('cormorant-garamond', 'cormorant-garamond-latin-wght-italic.woff2')],
            weight: '300 700',
            style: 'italic',
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Inter',
      cssVariable: '--font-inter',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          { src: [fsv('inter', 'inter-latin-wght-normal.woff2')], weight: '100 900', style: 'normal' },
          { src: [fsv('inter', 'inter-latin-wght-italic.woff2')], weight: '100 900', style: 'italic' },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Cormorant Garamond RO',
      cssVariable: '--font-cormorant-ro',
      fallbacks: [],
      optimizedFallbacks: false,
      options: {
        variants: [
          ro('cormorant-garamond-ro-wght-normal.woff2', '300 700', 'normal'),
          ro('cormorant-garamond-ro-wght-italic.woff2', '300 700', 'italic'),
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Inter RO',
      cssVariable: '--font-inter-ro',
      fallbacks: [],
      optimizedFallbacks: false,
      options: {
        variants: [ro('inter-ro-wght-normal.woff2', '100 900', 'normal'), ro('inter-ro-wght-italic.woff2', '100 900', 'italic')],
      },
    },
  ],
});
