# peachless-site

Static HTML shell for [peachless.design](https://peachless.design), deployed via Cloudflare Pages.

## What this repo is

The Squarespace replacement for the peachless.design domain. Plain HTML/CSS pages — no build step. UI components are loaded at runtime from the separate `sqs-design` CDN at `https://assets.peachless.design` (do **not** modify that repo as part of this one).

## Local preview

```bash
# Any static server works; e.g.
npx serve . --listen 8080
# then open http://localhost:8080
```

## Deployment

Cloudflare Pages:
- Project root: `/`
- Build command: *(none)*
- Output directory: `/`
- Custom domain: `peachless.design`

Push to `main` triggers automatic deploy.

## Component CDN

Components, data JSON, and shared core JS/CSS are served from the `sqs-design` repo (`https://github.com/paulnavala/sqs-design`) at `https://assets.peachless.design`. The new pages load them via `<script>`/`<link>` tags pointing at that CDN.

## Pages

| Route | File |
|---|---|
| `/` | `index.html` |
| `/uiux` | `uiux/index.html` |
| `/photography` | `photography/index.html` |
| `/projects` | `projects/index.html` |
| `/projects/logo-design` | `projects/logo-design/index.html` |
| `/projects/guidelines` | `projects/guidelines/index.html` |
| `/about` | `about/index.html` |
| `/contact` | `contact/index.html` |
