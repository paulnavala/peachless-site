/**
 * Legacy URLs → their v2 homes. The single source for both redirect layers:
 * astro.config.mjs (portable meta-refresh pages) and public/_redirects
 * (Cloudflare's native 301s, listed with and without the trailing slash).
 * tests/unit/redirects.spec.ts keeps the two in sync.
 *
 * Never add /projects/graphic-design or /projects/logo-design as a source:
 * browsers cached the old permanent redirect between them, so a redirect back
 * would loop (logo-design is a canonical-tagged alias page instead).
 */
export const REDIRECTS = {
  '/home': '/',
  '/uiux': '/projects/uiux/',
  '/projects/ui-ux': '/projects/uiux/',
  '/projects/guidelines': '/projects/peachless/',
};
