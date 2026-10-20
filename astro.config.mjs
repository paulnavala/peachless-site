import { defineConfig, fontProviders } from 'astro/config';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';

// Fonts come from pinned @fontsource-variable packages through the local
// provider, so builds are deterministic and need no font CDN. Crimson Pro
// (display) and Inter (body/UI) stand in for the brand book's Minion and
// Neue Haas Grotesk.
const fsv = (pkg, file) => `./node_modules/@fontsource-variable/${pkg}/files/${file}`;

export default defineConfig({
  site: 'https://peachless.design',
  integrations: [vue(), sitemap()],
  redirects: {
    '/home': '/',
    '/uiux': '/projects/uiux',
    '/projects/ui-ux': '/projects/uiux',
    '/projects/graphic-design': '/projects/logo-design',
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Crimson Pro',
      cssVariable: '--font-crimson-pro',
      fallbacks: ['Georgia', 'serif'],
      options: {
        variants: [
          { src: [fsv('crimson-pro', 'crimson-pro-latin-wght-normal.woff2')], weight: '200 900', style: 'normal' },
          { src: [fsv('crimson-pro', 'crimson-pro-latin-wght-italic.woff2')], weight: '200 900', style: 'italic' },
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
