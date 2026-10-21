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
- **v2.1 (October 2026), "editorial chapters":** a visual-storytelling polish:
  - scroll-linked motion
  - a project colour per project
  - device frames
  - numbered chapters
  - a home page told as a story
- **v2.2 (October 2026), "quiet craft":** typography, details and motion:
  - Cormorant Garamond headlines and an outlined brand wordmark
  - quiet sentence-case labels; numbers only on real sequences
  - one motion language: overlays, images, focus and links never pop
  - a "View" / "Open" label that follows the pointer over work

Patricia's editing guide is `docs/EDITING.md` (written for a non-developer; keep it in step with the admin).

## Commands

- `npm run dev` — Astro dev server
- `npm run build` — static build to `dist/`. Zod validates all content, and the build fails on schema violations, reserved or colliding slugs, or a missing image.
- `npm run preview` — serve `dist/` at `http://localhost:4321`
- `npm run check` — `astro check` (expect 0 errors, 0 warnings)
- `npm run test` / `npm run test:watch` — Vitest unit tests (`tests/unit/`, ~650 tests, most of them project-tint accents)
- `npm run budgets` — per-page gzipped JS / island / CSS / font-preload budgets on `dist/` (`scripts/check-budgets.mjs`). CI runs it between build and e2e. Raise a budget only with a reason, written next to the number.
  - Project pages are closest to the limit (about 14.2 of 15 KB CSS): `BlockRenderer` imports every block, so their CSS is the union of all story blocks plus the shared Base CSS. Keep global CSS lean.
  - JS on load includes inline scripts (Astro inlines small ones, and its ~2 KB island bootstrap on island pages). Keep comments out of `is:inline` scripts: they ship as written.
- `npm run e2e` / `npx playwright test` — e2e suite (`tests/e2e/`, ~150 tests, `retries: 1`). **Run `npm run build` first:** the Playwright webServer serves whatever is in `dist/`, so a stale build silently tests old code.
- `node scripts/capture-screens.mjs <base-url> docs/reference/screens/v2` — full-page reference screenshots (10 pages × 1440/768/390).

## Architecture

- **Pages** (`src/pages/`):
  - `index.astro`: the home story, in `components/home/`:
    1. the hero: the typed tagline plus `WorkReel`, a drifting row of work the rest of the page doesn't show yet (`reelPicks`)
    2. a `LitStatement` manifesto
    3. `DisciplineIndex` (what I do)
    4. `StoryDeck` (selected work)
    5. the `PhotoStrip` collage
    6. the about teaser
  - `projects/index.astro`, `graphic-design.astro`, `uiux.astro` and `logo-design.astro` are thin wrappers around `components/work/WorkIndex.astro`. `logo-design` is an **alias page** with `rel=canonical` to graphic-design. It is deliberately not a redirect, because browsers cache 301s and a reverse redirect would loop.
  - `projects/[slug].astro`: one page per **published** project:
    - an `article.project` carrying the project theme
    - a reading-progress line
    - the hero: a tint band, credits and "In this story"
    - story blocks
    - the next-story band
  - `photography.astro`, `about.astro`, `contact.astro`, `404.astro`.
- **Data access:** `src/lib/content.ts` is the **only** place that reads the `projects` and `photos` collections (a unit test enforces this), so hidden entries can't leak. Ordering and visibility rules (`hidden`, `featured`, `order`, next-project wrap) live in `src/lib/project-order.ts` and are reused by e2e specs.
- **Content model:** `src/lib/content-schema.ts` holds the zod schemas and constants (disciplines, tools, panels, reserved ids, regexes). It is imported by `src/content.config.ts`, Vitest and Playwright.
  - Collections: `projects`, `photos` (one folder per entry: `<id>/index.yaml` plus its images), and singletons `home`, `work`, `about` (markdown), `contact`, `photographyPage`, `site`, `form`.
  - Folder name = id. `folderId()` throws on invalid or reserved ids (`graphic-design`, `uiux`, `logo-design`, …).
  - Project pages are built from `blocks`, a discriminated union: text, image, gallery, quote, logo, palette, guidelines, prototype, before-after. `components/blocks/BlockRenderer.astro` maps each type to a component. Markdown in blocks is rendered at build time with `marked` (`src/lib/markdown.ts`).
  - **Chapters** (`src/lib/chapters.ts`): every headed block is a numbered chapter (CSS counter) anchored on its block `<section>`. Its heading isn't the anchor because it is sticky. Ids are slugs, deduped against reserved page ids. 3+ chapters (`TOC_MIN_CHAPTERS`) get an "In this story" list.
  - **Project colour:** `accent` → `projectTheme()` (`src/lib/project-theme.ts`) gives `--project-tint` (bands), `--project-tint-deep` (behind logos, panel value `accent`) and `--project-ink` (numbers, progress line).
    - `projectTint()` in `color.ts` rebuilds the accent in OKLCH, then walks toward a safe colour until every text pair passes. `project-tint.spec` proves it for 400+ accents.
    - Set the theme with `style={projectTheme(...)}` on the article, card or band. **Never** set it on `<body>` (it leaks into the next-story band) or in a `:root --color-*` token.
  - **Device frames:** `frame: none|phone|browser` on gallery and prototype blocks; the frame is drawn by `components/ui/DeviceFrame.astro`. A phone gallery is a scroll-snap rail below 48em (focusable only while it overflows).
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
  - `tokens.ts`: reads `tokens.css?raw` for build-time colour maths. `tokens-parse.ts` is shared with `tokens.spec`. Playwright can't import `tokens.ts`.
  - `color.ts`: contrast helpers, OKLab/OKLCH and `projectTint`. `project-theme.ts` wraps `projectTint` as CSS custom properties.
  - `chapters.ts`: story chapters and anchors.
  - `project-order.ts`: also `reelPicks`.
  - `dom.ts`: `trapFocus`, ref-counted `lockScroll`, reduced-motion helpers.
  - `reveal.ts`: one observer for `[data-reveal]`.
  - `cursor-label.ts`: the pointer's "View" / "Open" label over `[data-cursor]` media.
  - `nav.ts`: `navCurrent`.
  - `masonry.ts`: the photo-column dealing.
  - `structured-data.ts`: JSON-LD builders.
- **SEO:** `components/Seo.astro` emits the title, description, canonical, Open Graph tags and one JSON-LD `@graph` per page (WebSite + Person on home, Person on about, CreativeWork + breadcrumbs on projects). The project share image is `getImage` 1200×630 of a photographic cover.

## Design system rules (critical)

- **Tokens only:**
  - `src/styles/tokens.css` is the only file allowed colour literals, font names and raw z-index values. Everything else uses tokens: semantic `--color-*` first, raw palette only where no semantic token fits.
  - Surfaces switch via `[data-surface=paper|blush|inverse]`. `.sheet` (opt-in) floats a surface band as a rounded inset sheet from 48em: CtaBand, the next-story band, the footer, the home bands.
  - **Grain:** paper and inverse surfaces carry a fine grain (`--grain-*` tokens, inline SVG). It is never on linen or blush (no contrast headroom) and is off under `prefers-contrast: more`, forced colours and print. `tokens.spec` checks every pair on the strongest pixel. axe runs with `contrast: 'more'`, so it measures text, not texture.
  - `tests/unit/style-guard.spec.ts` fails CI on violations.
  - `tests/unit/tokens.spec.ts` checks the documented contrast pairs (e.g. terracotta `#8a523e` is the text-safe accent; clay `#d29a84` is decorative or a fill, never text on linen) and the clamp ratios.
- **Breakpoints:** only `36em`, `48em` and `64em` (mirrored in `src/lib/breakpoints.ts`). Range syntax (`width < 64em`) is fine. Prefer container queries inside components.
  - One documented height query: the home `StoryDeck` only stacks at `(min-width: 48em) and (min-height: 40em)`. Sticky cards taller than the screen would hide content; being in em, the query also switches off at 200% zoom.
- **Cascade:** `global.css` declares `@layer reset, base, primitives, ui`. Component and page `<style>` blocks are unlayered, so they win without specificity hacks. `!important` is allowed only in reset, base and primitives.
- **Type:**
  - Cormorant Garamond (display serif: the brand book's Minion at large sizes) and Inter (body/UI, look-alike of Neue Haas Grotesk).
  - Both are self-hosted through the Astro Fonts API `local()` provider from pinned `@fontsource-variable/*` packages (latin only: a latin-ext variant would be a third preload).
  - Cormorant's x-height is small, so the serif tokens run 1.12× the scale, and the serif is **never below `--text-h3`** (about 26px; `tokens.spec` checks). Weights: 500 from `--text-h2` up (`--weight-display`), 600 at `--text-h3` / `--text-title` (`--weight-display-sm`), italic 400 for the hero and quotes. Headings use old-style figures; counters use lining tabular ones. h4 and below, labels and UI text are Inter. `font-synthesis: none`.
  - The "peachless." wordmark is `ui/Wordmark.astro`: Crimson Pro 600 outlined with HarfBuzz (the brand book's Minion stand-in), so it never follows the display face. Another CMS site name falls back to live text.
  - Labels (`.eyebrow`) are sentence case and quiet; the style guard forbids `text-transform: uppercase`. Numbers mark real sequences only (chapters, "In this story", the deck); arrows only point somewhere (back, forward links, external, top).
  - `Base.astro` preloads Inter normal plus one Cormorant face (`preloadSerif`).
- **Motion** (`src/styles/motion.css`):
  - Base styles are the **final state**. Animation and transition live only inside `@media (prefers-reduced-motion: no-preference)`. There is no global kill switch; e2e checks that nothing runs under reduced motion.
  - **Two systems:**
    - `data-reveal` is the one-shot entrance (`reveal.ts`); it works everywhere and is the only effect allowed to fade text.
    - `data-scroll="unveil | parallax | drift | lit"` is scrubbed by the visitor's scroll and is decoration only. It lives inside `@supports (animation-timeline: view())`; Chrome/Edge and Safari 26+ have it, Firefox gets the still version.
    - An element with both is a progressive replacement: with scroll timelines, its reveal is off.
    - The style guard allows only those four values.
    - `structure.spec` checks that every effect comes to rest by the bottom of each page.
  - **Property ownership:** scroll keyframes animate `transform`, `clip-path` and `color`; hovers, transitions and reveals own `translate`, `scale`, `rotate` and `opacity`. `unveil` and `parallax` move the frame's first child, so the frame (often what tests click) holds still.
  - **Gotchas:**
    - Always set `view-timeline-inset`, since `auto` picks up `scroll-padding-top`.
    - Write `animation-timeline` and `animation-range` after the `animation` shorthand.
    - Never put `overflow: hidden` or `auto` between an effect (or a sticky element) and the root; use `clip`.
  - **Neither system goes on the hero or the LCP element.** (The project hero's cover and the About portrait are LCPs.) The home hero's own first-visit entrance (eyebrow, lede, actions; never the h1) shares the tagline's session flag.
  - **One vocabulary** (header of `motion.css`): enter with `--ease-out` (base/slow), exit with `--ease-in` (fast), state changes with `--ease-standard` (fast), travel with `--ease-in-out`. No raw durations.
  - **Overlays** fade with CSS only: `dialog` (and the lightbox's `[hidden]`) transition `opacity` plus `display`/`overlay` with `allow-discrete` and an `@starting-style`, so `open`/`hidden`, the `close` event and focus return stay synchronous (tests rely on it). Keep an overlay's content rendered while it closes. Dialogs are `position: fixed` with `--z-modal` in the reset, so a closing one stays put where `overlay` isn't supported. The mobile menu is a curtain (`clip-path`).
  - **Media own their motion:** `.media` (and `.pg-masonry__img`) carries the zoom and fade transitions; components only set `scale`, on `:hover` and keyboard focus alike. Lazy images fade in via the inline `img-fade` script in `Base.astro`'s `<head>` (it must stay inline there: `load` doesn't bubble and fires early). Eager/LCP images never fade.
  - **Icons lean** the way they point: `Icon.astro` sets `--nudge` / `--turn` per icon; one `ui.css` rule applies them on hover and focus.
  - **Cursor label:** `data-cursor="View"` on work media opts in (`lib/cursor-label.ts`, CSS in `styles/components/cursor-label.css`). Mouse, motion and no forced colours only; `pointer-events: none`, `aria-hidden`, `--z-overlay`.
  - **Page transitions** are native cross-document View Transitions (`@view-transition`): a fade-through for the page. Names must be unique per page:
    - `work-<id>` (card media ↔ hero, via `--vt`)
    - `work-title-<id>` (`.work-title` with `--vt-title`)
    - `chip-<key>` and `filter-indicator` (the sliding pill)
    - `about-portrait`
    - `site-header`

    The reel only names projects that are not also in the deck. **No `<ClientRouter>`**: it breaks module scripts, focus traps and the gallery's history handling.
  - **Scoped styles:** a component receiving `class` from a parent must spread `...rest` onto its root (see `LitStatement`, `DeviceFrame`, `ArrowLink`), or the parent's scoped styles won't reach it.
- **Header:** the sticky header keeps a constant footprint when it condenses (`margin-block-end` makes up the height difference). Without that, scroll anchoring and the sentinel fight, and the header flickers every frame near the top of the page.
- **Accessibility:**
  - One visible h1 per page, sequential heading levels.
  - Every `<main>` ends with a `[data-next-step]` element (a next project, CTA band or links). The footer CTA ("Let's create together.") is the safety net and is switched off on Contact.
  - Modal UI uses native `<dialog>` plus `trapFocus` and `lockScroll`.
  - axe (WCAG 2.2 AA) runs on every route at 1280 and 390px, plus the open overlays.
- **Links:** internal hrefs use the trailing-slash form (`/projects/`). Cloudflare answers the bare form with a redirect.
- **Visual reference:** `docs/reference/screens/v2/` is the signed-off look (recaptured for v2.2). Recapture and compare after visual changes; the captures use reduced motion, so they show final states. Review motion itself on the Cloudflare preview. `v1-parity/` is the retired v1 contract, kept for history.

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
- **Reduced motion** is set with `test.use({ contextOptions: { reducedMotion: 'reduce' } })`. A bare `test.use({ reducedMotion })` is **silently ignored**. `a11y.spec` also sets `contrast: 'more'` (no grain).
- **Vitest and CSS:** Vitest blanks CSS imports, so `vitest.config.ts` lets `tokens.css` through (`css.include`) for the `?raw` import in `src/lib/tokens.ts`.
- **Islands:** specs that drive an island should first `await waitForIsland(page, selector)` (`tests/e2e/utils.ts`), because `client:visible` islands ignore input until hydrated.
- **Figma:** prototype specs stub `https://www.figma.com/**`. Never wait on `networkidle` with a live Figma embed, because its telemetry never goes idle.
- **Cursor label:** drive it with `page.mouse` at the media's centre. A locator `hover()` aims at the card's stretched link, and on touch emulation the label is never built (`motion.spec`).
- **Windows:** Git Bash rewrites `/path` arguments, so prefix commands with `MSYS_NO_PATHCONV=1` when passing site paths. Kill a stray `astro preview` with `taskkill //PID <pid> //T //F`.

## Hard rules

- Never modify `D:\Projects\peachless\sqs-design` (frozen old repo).
- Pushing `main` deploys to production. Keep non-trivial work on a branch + PR (the CF preview and CI gate it).
- IIFE/loader/registry machinery, `window.init*` globals, and runtime JSON fetching from the old architecture are retired. Do not reintroduce them.
