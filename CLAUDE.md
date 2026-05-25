# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Two-repo architecture (read this first)

`peachless.design` is split across two decoupled repos. **This one** is the HTML shell; the other (`sqs-design`) is the component CDN. Treat the CDN as **read-only** from here.

| Repo | Path | Owns | Served at |
|---|---|---|---|
| `peachless-site` (this) | `D:\Projects\peachless\peachless-site` | Static HTML pages, `css/shell.css`, migrated images under `/assets/`, `_headers`, `_redirects` | `peachless.design` (Cloudflare Pages, push-to-`main` deploy, no build) |
| `sqs-design` | `D:\Projects\peachless\sqs-design` | Vue 3 component IIFE bundles, component CSS, shared `core/*.js`/`.css`, data JSON | `assets.peachless.design` (GitHub Pages) |

Page edits, layout/typography/color, new pages, image migrations → here. Component internals, data JSON, footer/mobile-menu logic → `sqs-design`. When you need to know how a component is structured, read from `D:\Projects\peachless\sqs-design\components\<name>\<name>-loader.html` and `core/<name>.js`/`.css` — don't modify it.

## Commands

```powershell
# Serve locally on :8080
npm run serve

# Verify all routes render (Playwright + npx serve on :8789, writes screenshots/)
npm run verify
```

There is no build step — Cloudflare Pages serves the directory as-is. Deploy = push to `main`.

## Page template pattern

Every `index.html` is self-contained and follows the same shape. When adding a page, copy an existing one and change only the page-specific bits.

1. **Head** has identical preconnects (Google Fonts + `assets.peachless.design`) and the same **inline CSS loader IIFE** — a hardcoded list of CDN stylesheet paths under `https://assets.peachless.design`. Notably **`/core/header.css` is deliberately excluded** because `css/shell.css` owns the header (the CDN's `core/header.css` has a hardcoded Squarespace logo background-image).
2. `<link rel="stylesheet" href="/css/shell.css">` comes last so shell rules win.
3. `<body data-page="<key>">` — the `data-page` attribute drives the nav active-state CSS in `shell.css` (search for `body[data-page="…"]`). Keys: `home`, `about`, `contact`, `projects`, `logo-design`, `guidelines`, `uiux`, `photography`.
4. Header / footer markup is identical across pages (duplicated, not templated). Header has a `.header-menu-toggle` hamburger for mobile — the CDN's `core/mobile-menu.js` binds to `.header-menu-toggle` / `button[aria-expanded]`, **not** `.header-menu-cta` (older specs got this wrong).
5. **Inline JS loader IIFE** at end of `<body>` — sequential `PRIORITY` list (`/core/utilities.js`, `/core/component-loader.js`) then parallel `PARALLEL` list of component bundles. Components mount at `[data-component="name"]` markers, or at component-specific IDs (`#portfolio-uiux`, `#portfolio-photo`).
6. **Inlined-not-CDN exception:** the home page's twin gallery is **inlined** in `index.html` with local `/assets/images/...` paths and `/projects/logo-design` link — the CDN's `twin-gallery-loader.html` has Squarespace image URLs and the wrong link target. Don't replace it with the CDN version.

## Routing

Pretty URLs work because each route is a directory with `index.html` (Cloudflare Pages auto-serves it). Routes: `/`, `/about/`, `/contact/`, `/projects/`, `/projects/logo-design/`, `/projects/guidelines/`, `/uiux/`, `/photography/`.

`_redirects` handles:
- `/projects/uiux` → `/uiux` (301)
- `www.peachless.design/*` → `peachless.design/*` (301)

`_headers` sets cache (1-year immutable for `/assets/*`, 1-hour for `/css/*`) and basic security headers.

## Verification script (scripts/verify-pages.mjs)

`npm run verify` spawns `npx serve@14` on :8789, then Playwright loads each route, checks `body[data-page]`, required selectors, and the logo text, and writes a screenshot per route to `screenshots/`. Failures exit non-zero.

Two non-obvious things:

- **Wait on the server with `fetch()`, not stdout markers or fixed timeouts.** `npx --yes serve@14` can take 5–15s on a fresh system, and PowerShell buffering through `npm run` makes stdout-marker detection unreliable.
- **Windows tree-kill is mandatory at end-of-script.** `server.kill()` only signals the `cmd.exe` wrapper when `spawn(..., { shell: true })`; the `node serve@14` grandchild keeps the port bound and pins the event loop open. Use synchronous `spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], ...)` (not async `spawn` — otherwise `process.exit(0)` tears down before taskkill dispatches) then `process.exit(0)` explicitly. The current `killTree()` in `scripts/verify-pages.mjs` does this; preserve it.

Also: use `waitUntil: 'load'`, not `'networkidle'` — the `/uiux/` page embeds Figma prototypes whose analytics never stop polling. Component data fetches settle within a fixed 2.5s wait after `load`.

## Brand tokens (shell.css)

CSS custom properties at `:root` define the palette (`--linen`, `--clay`, `--cacao`, `--black`, plus `--accent-*`) and the fluid `--step-{-1..3}` type scale. Use these instead of literal colors / px sizes when adding shell styles.
