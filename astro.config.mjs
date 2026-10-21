import { defineConfig, fontProviders } from 'astro/config';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';
import { REDIRECTS } from './redirects.config.mjs';

// Fonts come from pinned @fontsource-variable packages through the local
// provider, so builds are deterministic and need no font CDN. Cormorant
// Garamond (display) and Inter (body/UI) stand in for the brand book's Minion
// Display and Neue Haas Grotesk; the wordmark is outlined (ui/Wordmark.astro).
const fsv = (pkg, file) => `./node_modules/@fontsource-variable/${pkg}/files/${file}`;

export default defineConfig({
  site: 'https://peachless.design',
  integrations: [
    vue(),
    // The logo-design alias page carries a canonical link to graphic-design;
    // only the canonical URL belongs in the sitemap.
    sitemap({ filter: (url) => !url.endsWith('/projects/logo-design/') }),
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
  ],
});
