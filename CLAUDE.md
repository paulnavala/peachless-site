# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Production site for **https://peachless.design** — a portfolio site built as an Astro 6 static site with Vue 3 islands, hosted on Cloudflare Pages. This repo replaced a Squarespace site + component-CDN setup in June 2026; the old repo (`D:\Projects\peachless\sqs-design`) is **frozen, read-only reference** — its `docs/superpowers/` holds the original design spec and implementation plan, and its components are the source the islands here were ported from.

## Commands

- `npm run dev` — Astro dev server
- `npm run build` — static build to `dist/` (zod-validates all content collections; build fails on schema violations)
- `npm run preview` — serve `dist/` at `http://localhost:4321`
- `npm run check` — `astro check` (expect 0 errors; a few known unused-var hints)
- `npm run test` / `npm run test:watch` — Vitest unit tests (`tests/unit/`, happy-dom)
- `npm run e2e` / `npx playwright test` — e2e suite (`tests/e2e/`, 28 tests, `retries: 1`). **Run `npm run build` first** — the Playwright webServer runs `npm run preview` against whatever is in `dist/`, so a stale build silently tests old code.

## Architecture

- `src/pages/*.astro` — one file per route. `projects/[slug].astro` generates the case-study pages from the `projects` collection.
- `src/components/islands/` — Vue 3 **render-function components** (`defineComponent` + `h()` in plain `.ts`, **not** SFCs), each paired with a 4-line script-only `.vue` wrapper so Astro's Vue renderer picks it up. Hydration: `Tagline` is `client:load` (above the fold); everything else `client:visible`. All data arrives as **build-time props** from content collections — no runtime fetching, no `data-*` scraping.
- `src/components/static/` — Astro components with scoped client `<script>` (vanilla TS ports: PortfolioUiux, TwinGallery, FortunePeach).
- `src/components/chrome/` — Header (theme `light`/`bright`; home is bright = clay bg, white text), MobileMenu (`.mmx-*` overlay with `trapFocus`), Footer (elegant-footer design).
- `src/content.config.ts` — six zod-typed collections (`projects`, `logos`, `photos`, `brands`, `pages`, `site`); entries live in `src/content/`. `logos`/`photos` schemas use `image()` so `astro:assets` optimizes at build time.
- `src/lib/dom.ts` — shared utilities (`trapFocus`, `isReducedMotion`, `rafThrottle`, `qs`/`qsa`, …). Modal-like components must use `trapFocus`; animation must respect reduced motion.

## Styling rules (critical)

- `src/styles/tokens.css` is the **single source** for palette/type/motion/layout tokens (`--linen #efe1d4`, `--clay #d29a84`, `--cacao #58433b`, fluid `--step-*` scale). Never hardcode brand colors.
- `src/styles/components/*.css` are **verbatim ports** from the old repo, kept byte-similar on purpose. Do not edit them for cleanup or styling — visual compensations belong in page-level `<style>` blocks (which carry comments citing measured live-site values) or `global.css` helpers.
- **Visual parity contract:** `docs/reference/screens/local/` (1440/768/390 × 8 pages) are the signed-off screenshots; `screens/live/` are the original Squarespace captures they were matched against. Resting visuals must not drift — when touching styles, recapture (`scripts/capture-screens.mjs <base-url> <out-dir>`) and compare before claiming done.
- Marcellus ships **weight 400 only**; bold headings are synthetic and used only where the live site did it (home intro heading). Subpage header wordmark is clay on all subpages — intentional unification (live varied by accident).

## Deployment

- **Cloudflare Pages**, git-integrated, project `peachless`: push to `main` → CF builds (`npm run build`, Node from `.node-version`) and deploys to peachless.design. Every PR gets a preview at `https://<branch>.peachless.pages.dev` plus a "Cloudflare Pages" commit status.
- **GitHub Actions (`ci.yml`) is the test gate only** — check → unit → build → e2e. It does not deploy.
- `public/_redirects` — CF-native 301s for legacy paths (with and without trailing slash). The `astro.config.mjs` `redirects` block stays as a portable meta-refresh fallback; keep the two in sync.
- `public/_headers` — immutable caching for `/_astro/*` + security headers.
- The www → apex 301 is a Cloudflare **zone Redirect Rule** (dashboard), not in this repo.
- `docs/CUTOVER.md` — the (executed) migration runbook; still useful for the post-cutover checklist and DNS facts.

## Content & CMS

- Sveltia CMS at `/admin` (GitHub backend, personal-access-token sign-in). The CMS script in `public/admin/index.html` is **version-pinned with an SRI hash** — when bumping the version, recompute sha384 over the new file and update both together; never loosen the pin.
- `src/content/site/site.yaml` holds nav, emails, and the contact-form config. **Edit `formEndpoint`/`formHidden` directly in git** — saving "Site Settings" through the CMS can strip manually-added `formHidden` keys (the Web3Forms `access_key` lives there; it is public-by-design).

## Testing gotchas

- `tests/e2e/contact.spec.ts` **stubs** `api.web3forms.com` via `page.route`. Never let a test (or any automation) POST to the real endpoint — each submission emails the owner.
- Playwright uses `waitUntil` defaults; the uiux page embeds Figma iframes whose telemetry never goes network-idle — don't wait on networkidle there.
- `scripts/capture-screens.mjs` emulates `reducedMotion: 'reduce'`, scrolls the full page, and waits for images — so captures show the tagline fully typed and all reveal-on-scroll content visible.

## Hard rules

- Never modify `D:\Projects\peachless\sqs-design` (frozen old repo).
- Pushing `main` deploys to production — keep non-trivial work on a branch + PR (the CF preview + CI gate it).
- IIFE/loader/registry machinery, `window.init*` globals, and runtime JSON fetching from the old architecture are retired — do not reintroduce them.
