# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Production site for **https://peachless.design**, the portfolio of Patricia (brand identity, UI/UX, photography). It is an Astro 6 static site with a few Vue 3 islands, hosted on Cloudflare Pages and edited through Sveltia CMS at `/admin`.

History:
- **June 2026:** this repo replaced a Squarespace site and component CDN. The old repo (`D:\Projects\peachless\sqs-design`) is **frozen, read-only reference**.
- **October 2026:** the v2 redesign replaced the pixel-parity port with a story-led site:
  - one page per project
  - a single token-driven design system
  - an editor-friendly admin

Patricia's editing guide is `docs/EDITING.md` (written for a non-developer; keep it in step with the admin).

## Commands

- `npm run dev` — Astro dev server
- `npm run build` — static build to `dist/`. Zod validates all content, and the build fails on schema violations, reserved or colliding slugs, or a missing image.
- `npm run preview` — serve `dist/` at `http://localhost:4321`
- `npm run check` — `astro check` (expect 0 errors, 0 warnings)
- `npm run test` / `npm run test:watch` — Vitest unit tests (`tests/unit/`, ~195 tests)
- `npm run budgets` — per-page gzipped JS / island / CSS / font-preload budgets on `dist/` (`scripts/check-budgets.mjs`). CI runs it between build and e2e. Raise a budget only with a reason.
- `npm run e2e` / `npx playwright test` — e2e suite (`tests/e2e/`, ~120 tests, `retries: 1`). **Run `npm run build` first:** the Playwright webServer serves whatever is in `dist/`, so a stale build silently tests old code.
- `node scripts/capture-screens.mjs <base-url> docs/reference/screens/v2` — full-page reference screenshots (10 pages × 1440/768/390).

## Architecture

- **Pages** (`src/pages/`):
  - `index.astro`: the home story (hero → manifesto → what I do → selected work → photo strip → about teaser).
  - `projects/index.astro`, `graphic-design.astro`, `uiux.astro` and `logo-design.astro` are thin wrappers around `components/work/WorkIndex.astro`. `logo-design` is an **alias page** with `rel=canonical` to graphic-design. It is deliberately not a redirect, because browsers cache 301s and a reverse redirect would loop.
  - `projects/[slug].astro`: one page per **published** project (hero → story blocks → next project).
  - `photography.astro`, `about.astro`, `contact.astro`, `404.astro`.
- **Data access:** `src/lib/content.ts` is the **only** place that reads the `projects` and `photos` collections (a unit test enforces this), so hidden entries can't leak. Ordering and visibility rules (`hidden`, `featured`, `order`, next-project wrap) live in `src/lib/project-order.ts` and are reused by e2e specs.
- **Content model:** `src/lib/content-schema.ts` holds the zod schemas and constants (disciplines, tools, panels, reserved ids, regexes). It is imported by `src/content.config.ts`, Vitest and Playwright.
  - Collections: `projects`, `photos` (one folder per entry: `<id>/index.yaml` plus its images), and singletons `home`, `work`, `about` (markdown), `contact`, `photographyPage`, `site`, `form`.
  - Folder name = id. `folderId()` throws on invalid or reserved ids (`graphic-design`, `uiux`, `logo-design`, …).
  - Project pages are built from `blocks`, a discriminated union: text, image, gallery, quote, logo, palette, guidelines, prototype, before-after. `components/blocks/BlockRenderer.astro` maps each type to a component. Markdown in blocks is rendered at build time with `marked` (`src/lib/markdown.ts`).
- **Islands** (`src/components/islands/`):
  - Vue 3 **render-function components** (`defineComponent` + `h()` in plain `.ts`, **not** SFCs), each paired with a 4-line `.vue` wrapper so Astro's Vue renderer picks it up.
  - All four (PhotographyGallery, ContactForm, GuidelineViewer, BeforeAfterSlider) are `client:visible` and import their own CSS from `src/styles/components/`.
  - Data arrives as build-time props, with no runtime fetching.
  - Home, Work and About hydrate **no** Vue. The home Tagline is a static Astro component animated with CSS.
- **Static components with scoped scripts:**
  - `blocks/PrototypeEmbed.astro`: a click-to-load Figma facade, inline or fullscreen `<dialog>`, plus "Open in Figma".
  - `static/FortunePeach.astro`.
  - `chrome/Header.astro` (sticky, condenses via an IntersectionObserver sentinel) and `chrome/MobileMenu.astro` (`<dialog>`).
- **`src/lib/`:**
  - `dom.ts`: `trapFocus`, ref-counted `lockScroll`, reduced-motion helpers.
  - `reveal.ts`: one observer for `[data-reveal]`.
  - `nav.ts`: `navCurrent`.
  - `color.ts`: contrast helpers.
  - `masonry.ts`: the photo-column dealing.
  - `structured-data.ts`: JSON-LD builders.
- **SEO:** `components/Seo.astro` emits the title, description, canonical, Open Graph tags and one JSON-LD `@graph` per page (WebSite + Person on home, Person on about, CreativeWork + breadcrumbs on projects). The project share image is `getImage` 1200×630 of a photographic cover.

## Design system rules (critical)

- **Tokens only:**
  - `src/styles/tokens.css` is the only file allowed colour literals, font names and raw z-index values. Everything else uses tokens: semantic `--color-*` first, raw palette only where no semantic token fits.
  - Surfaces switch via `[data-surface=paper|blush|inverse]`.
  - `tests/unit/style-guard.spec.ts` fails CI on violations.
  - `tests/unit/tokens.spec.ts` checks the documented contrast pairs (e.g. terracotta `#8a523e` is the text-safe accent; clay `#d29a84` is decorative or a fill, never text on linen) and the clamp ratios.
- **Breakpoints:** only `36em`, `48em` and `64em` (mirrored in `src/lib/breakpoints.ts`). Range syntax (`width < 64em`) is fine. Prefer container queries inside components.
- **Cascade:** `global.css` declares `@layer reset, base, primitives, ui`. Component and page `<style>` blocks are unlayered, so they win without specificity hacks. `!important` is allowed only in reset, base and primitives.
- **Type:**
  - Crimson Pro (display serif, look-alike of the brand book's Minion) and Inter (body/UI, look-alike of Neue Haas Grotesk).
  - Both are self-hosted through the Astro Fonts API `local()` provider from pinned `@fontsource-variable/*` packages.
  - Serif only at 23px and up; h4 and below, eyebrows and UI text are Inter. `font-synthesis: none`.
  - `Base.astro` preloads Inter normal plus one Crimson face (`preloadSerif`).
- **Motion:**
  - Base styles are the **final state**. Animation and transition live only inside `@media (prefers-reduced-motion: no-preference)`. There is no global kill switch; e2e checks that nothing runs under reduced motion.
  - Scroll reveal is opt-in via `data-reveal`, never on the hero or the LCP element.
  - Page transitions are native cross-document View Transitions (`@view-transition`). The card ↔ hero morph uses `--vt: work-<slug>`, and names must be unique per page. **No `<ClientRouter>`**: it breaks module scripts, focus traps and the gallery's history handling.
- **Header:** the sticky header keeps a constant footprint when it condenses (`margin-block-end` makes up the height difference). Without that, scroll anchoring and the sentinel fight, and the header flickers every frame near the top of the page.
- **Accessibility:**
  - One visible h1 per page, sequential heading levels.
  - Every `<main>` ends with a `[data-next-step]` element (a next project, CTA band or links). The footer CTA ("Let's create together.") is the safety net and is switched off on Contact.
  - Modal UI uses native `<dialog>` plus `trapFocus` and `lockScroll`.
  - axe (WCAG 2.2 AA) runs on every route at 1280 and 390px, plus the open overlays.
- **Links:** internal hrefs use the trailing-slash form (`/projects/`). Cloudflare answers the bare form with a redirect.
- **Visual reference:** `docs/reference/screens/v2/` is the signed-off look; recapture and compare after visual changes. `v1-parity/` is the retired v1 contract, kept for history.

## Content & CMS

- **Sveltia CMS** at `/admin` (`public/admin/config.yml`, GitHub backend).
  - The script in `public/admin/index.html` is **version-pinned with an SRI hash** that matches the exact devDependency `@sveltia/cms`.
  - To bump: update the package, `index.html` and the `$schema` URL in `config.yml` together. `tests/unit/cms-config.spec.ts` prints the correct `integrity` value when it doesn't match. Never loosen the pin. (SRI covers the main bundle only, not lazy-loaded chunks.)
- **CMS ↔ schema parity:** `cms-config.spec.ts` checks that `config.yml` matches the zod schemas: field names, required-ness, limits, options, list min/max, block types and patterns. It also validates the config with ajv against Sveltia's own JSON schema. **Change a schema and the CMS field together.** Field labels and hints are written for Patricia; keep them in plain language.
- **Editor workflow:**
  - `publish_mode: preview` with `direct_publish: true`. A save opens a draft PR with a Cloudflare preview ("View preview" → "Publish"); "Save and publish" and drag-to-reorder go straight to `main`.
  - Reorder writes `order`. Images are stored next to their entry (`path: '{{slug}}/index'`, `media_folder: ''`).
  - A project's address (`slug`) can only be set at creation.
  - Photo uploads are converted to WebP ≤3840px.
- **Sign-in:** "Sign In with GitHub" goes through the `sveltia-cms-auth` Cloudflare Worker at `https://auth.peachless.design` (`backend.base_url`, which a unit test requires; without it the popup shows Netlify's "Not Found").
  - It was deployed with wrangler from sveltia/sveltia-cms-auth @ `95733a9811`, after the source was reviewed.
  - Var `ALLOWED_DOMAINS=peachless.design`. Secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (GitHub OAuth app "peachless. admin") are set in the Cloudflare dashboard.
  - Access, secret rotation and redeploy steps are in `docs/EDITING.md`.
- **Contact form:** the Web3Forms endpoint and `access_key` (public by design) live in `src/content/site/form.yaml`, read-only in the CMS ("Contact form — developer"). The `form` schema fails the build if a Web3Forms endpoint has no `access_key`.
- **Hidden vs. featured:** `hidden: true` removes a project or photo from every list, the sitemap and next-links, and gives it no page. `featured` puts it on the home page; if none are featured, the first three are shown.
- **Migration:** `scripts/migrate-v2.mjs` (with `migrate-v2.data.mjs` and `migrate-v2-assets/`) built the v2 content from the v1 content. It is a dry run by default (`--write`, `--prune`). It is history after launch; don't run it against v2 content.

## Deployment

- **Cloudflare Pages**, git-integrated, project `peachless`. Push to `main` → CF builds (`npm run build`, Node from `.node-version`) and deploys to peachless.design. Every PR gets a preview at `https://<branch>.peachless.pages.dev` plus a "Cloudflare Pages" commit status.
- **GitHub Actions (`ci.yml`) is the test gate only:** check → unit → build → budgets → e2e. It does not deploy. `concurrency` cancels superseded runs, because CMS saves push many small commits.
- **Redirects:** `redirects.config.mjs` is the single source. It feeds the `astro.config.mjs` `redirects` (portable meta-refresh fallback), and `public/_redirects` mirrors it in both slash forms (CF-native 301s). `tests/unit/redirects.spec.ts` keeps them in sync and forbids redirecting `/projects/graphic-design`, `/projects/uiux` or `/projects/logo-design`.
- `public/_headers` — immutable caching for `/_astro/*` plus security headers.
- The www → apex 301 is a Cloudflare **zone Redirect Rule** (dashboard), not in this repo.
- `docs/CUTOVER.md` — the (executed) June 2026 migration runbook; still useful for DNS facts.

## Testing gotchas

- **Never POST to the real Web3Forms endpoint:** each submission emails the owner. `tests/e2e/fixtures.ts` aborts `api.web3forms.com` for every spec, and specs that exercise the form add their own `page.route` stub. Every spec must import `test` from `./fixtures`; a unit test enforces this.
- **Expectations come from content:** e2e specs read counts, order, slugs and labels from the content files via `tests/e2e/content.ts` (reusing `project-order.ts`), so routine CMS edits don't turn CI red. Don't hardcode content in specs.
- **Reduced motion** is set with `test.use({ contextOptions: { reducedMotion: 'reduce' } })`. A bare `test.use({ reducedMotion })` is **silently ignored**.
- **Islands:** specs that drive an island should first `await waitForIsland(page, selector)` (`tests/e2e/utils.ts`), because `client:visible` islands ignore input until hydrated.
- **Figma:** prototype specs stub `https://www.figma.com/**`. Never wait on `networkidle` with a live Figma embed, because its telemetry never goes idle.
- **Windows:** Git Bash rewrites `/path` arguments, so prefix commands with `MSYS_NO_PATHCONV=1` when passing site paths. Kill a stray `astro preview` with `taskkill //PID <pid> //T //F`.

## Hard rules

- Never modify `D:\Projects\peachless\sqs-design` (frozen old repo).
- Pushing `main` deploys to production. Keep non-trivial work on a branch + PR (the CF preview and CI gate it).
- IIFE/loader/registry machinery, `window.init*` globals, and runtime JSON fetching from the old architecture are retired. Do not reintroduce them.
