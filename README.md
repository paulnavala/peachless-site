# peachless-site

Self-hosted rebuild of [peachless.design](https://peachless.design). Astro 6 static site;
content edited via Sveltia CMS at `/admin`.

- `npm run dev` — dev server
- `npm run build` / `npm run preview` — production build / serve
- `npm run test` — unit tests · `npm run e2e` — Playwright
- `npx astro check` — typecheck

## Architecture

- **Pages**: `src/pages/*.astro` — one file per route; case studies generated from
  `src/content/projects/` via `projects/[slug].astro`
- **Islands** (`src/components/islands/`): Vue 3 render-function components hydrated
  with `client:load`/`client:visible`; data arrives as build-time props
- **Static components** (`src/components/static/`): Astro components with scoped
  client scripts (no framework runtime)
- **Design tokens**: `src/styles/tokens.css` — single source for palette/type/motion
- **Content**: `src/content/` collections (zod-validated), editable at `/admin`
  (Sveltia CMS, GitHub backend, token sign-in)
- **Images**: originals in `src/assets/`, responsive WebP generated at build time
- **Deploy**: Cloudflare Pages, git-integrated — push to `main` and CF builds and
  deploys; PRs get preview URLs. GitHub Actions remains the test gate
  (see `docs/CUTOVER.md` for DNS)

## Editing content

Small edits: GitHub web UI or `/admin`. New UI/UX project: add
`src/content/projects/<id>.json` (or use the CMS) — the portfolio page, filters, and
a case-study stub page update automatically. New photo/logo: drop the image in
`src/assets/photography|logos/` and add a content JSON pointing at it.
