import { defineConfig, fontProviders } from 'astro/config';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';

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
      provider: fontProviders.fontsource(),
      name: 'Marcellus',
      cssVariable: '--font-marcellus',
      weights: [400],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'PT Serif',
      cssVariable: '--font-pt-serif',
      weights: [400, 700],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
  ],
});
