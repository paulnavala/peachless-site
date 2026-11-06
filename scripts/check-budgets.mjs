#!/usr/bin/env node
/**
 * Per-page weight budgets, measured on the built site. Run after `npm run build`
 * (CI runs it between the build and the e2e suite).
 *
 * Sizes are gzipped, per file, the way the CDN serves them:
 * - JS on load: module and inline scripts plus everything they statically import.
 * - Islands: Vue islands hydrate when they scroll into view, so their code
 *   (component, renderer, shared chunks) is budgeted separately. Pages that
 *   should hydrate nothing have an island budget of 0.
 * - CSS: linked stylesheets plus inline <style>.
 * - Font preloads: every preload competes with the hero for bandwidth.
 *
 *   node scripts/check-budgets.mjs [distDir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const DIST = process.argv[2] ?? fileURLToPath(new URL('../dist/', import.meta.url));
const KB = 1024;

// First match wins. Budgets are in KB (gzipped). Raised, with reasons:
// - Project CSS 14 → 15 (v2.2): BlockRenderer puts every story block's CSS on
//   every project page, and the shared overlay/interaction motion took the
//   last KB.
// - Photography JS 4 → 5 (v2.2): inline scripts are measured since v2.2 (the
//   loop used to read their attributes), and this page inlines Astro's island
//   bootstrap (~2 KB).
// - Project CSS 15 → 16 (v2.3): fit fixes in the story blocks (the prototype's
//   launch button under small stills, the brand-book viewer's page fit, dock
//   and thumbnail columns, the palette's chip-sized names) and the balanced
//   contents line, after removing ~0.1 KB of dead CSS.
// - Work, Photography and Contact CSS 14 → 15 (v3): every route now carries the
//   sections an editor can place on any page, custom sections included. It is one
//   shared file, cached once for the whole site, and held to CORE_CSS_KB below so
//   it can't creep. Home and About stay at 14.
const BUDGETS = [
  { name: 'Home', match: /^\/$/, js: 4, islands: 0, css: 14 },
  { name: 'Work', match: /^\/projects\/(graphic-design\/|uiux\/|logo-design\/|tools\/[^/]+\/)?$/, js: 4, islands: 0, css: 15 },
  { name: 'Project', match: /^\/projects\/[^/]+\/$/, js: 6, islands: 40, css: 16 },
  { name: 'Photography', match: /^\/photography\/$/, js: 5, islands: 40, css: 15 },
  { name: 'Contact', match: /^\/contact\/$/, js: 6, islands: 40, css: 15 },
  { name: 'Page', match: /./, js: 4, islands: 0, css: 14 },
];
const MAX_FONT_PRELOADS = 2;
// The core sections' stylesheet is on every route, so a section belongs in it
// only if it really must go on any page; the rest stay bound to their route.
const CORE_CSS_KB = 3.5;
const CORE_ROUTES = ['/', '/about/', '/contact/', '/photography/', '/projects/'];

const pages = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'admin' && name !== '_astro') walk(full);
    } else if (name.endsWith('.html')) {
      pages.push(full);
    }
  }
};
walk(DIST);

const urlOf = (file) => {
  const rel = '/' + file.slice(DIST.length).replaceAll('\\', '/').replace(/^\/+/, '');
  return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
};

const gz = (text) => gzipSync(text, { level: 9 }).length;
const fileOf = (url) => join(DIST, url.split(/[?#]/)[0]);
const sizes = new Map();
const sizeOf = (url) => {
  if (!sizes.has(url)) sizes.set(url, gz(readFileSync(fileOf(url))));
  return sizes.get(url);
};

// Static imports only: `import "./x.js"`, `import {a} from "./x.js"`,
// `export {a} from "./x.js"`. Dynamic import() loads later, on demand.
const STATIC_IMPORT = /(?:\bimport|\bfrom)\s*["']([^"']+\.js)["']/g;
const resolve = (from, spec) => (spec.startsWith('/') ? spec : posix.join(posix.dirname(from), spec));
const closure = (entries, seen = new Set()) => {
  const stack = [...entries];
  while (stack.length) {
    const url = stack.pop();
    if (seen.has(url) || !existsSync(fileOf(url))) continue;
    seen.add(url);
    for (const [, spec] of readFileSync(fileOf(url), 'utf8').matchAll(STATIC_IMPORT)) stack.push(resolve(url, spec));
  }
  return seen;
};

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const fmt = (bytes) => (bytes / KB).toFixed(1);

const rows = [];
const stylesheets = new Map();
let failed = false;

for (const file of pages.sort()) {
  const html = readFileSync(file, 'utf8');
  if (/http-equiv="refresh"/i.test(html)) continue; // redirect stubs
  const url = urlOf(file).replace(/^\/404\.html$/, '/404');
  const budget = BUDGETS.find((b) => b.match.test(url));

  // Scripts that run on load.
  let inlineJs = 0;
  const entryJs = [];
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const type = attr(attrs, 'type');
    if (type && type !== 'module' && type !== 'text/javascript') continue; // JSON-LD, speculation rules
    const src = attr(attrs, 'src');
    if (src) entryJs.push(src);
    else if (body.trim()) {
      inlineJs += gz(body);
      for (const [, spec] of body.matchAll(STATIC_IMPORT)) entryJs.push(resolve('/', spec));
    }
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*>/g)) entryJs.push(attr(tag, 'href'));
  const onLoad = closure(entryJs);
  const js = inlineJs + [...onLoad].reduce((n, u) => n + sizeOf(u), 0);

  // Island code, minus anything already loaded.
  const islandEntries = [];
  for (const [tag] of html.matchAll(/<astro-island\b[^>]*>/g)) {
    for (const name of ['component-url', 'renderer-url', 'before-hydration-url']) {
      const value = attr(tag, name);
      if (value) islandEntries.push(value);
    }
  }
  const islandFiles = [...closure(islandEntries)].filter((u) => !onLoad.has(u));
  const islands = islandFiles.reduce((n, u) => n + sizeOf(u), 0);

  // CSS.
  let css = 0;
  const linked = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(([tag]) => attr(tag, 'href'));
  stylesheets.set(url, new Set(linked));
  for (const href of linked) css += sizeOf(href);
  for (const [, body] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) css += gz(body);

  const fonts = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)].filter(([tag]) => attr(tag, 'as') === 'font').length;

  const over = [];
  if (js > budget.js * KB) over.push(`JS ${fmt(js)} > ${budget.js} KB`);
  if (islands > budget.islands * KB) over.push(`islands ${fmt(islands)} > ${budget.islands} KB`);
  if (css > budget.css * KB) over.push(`CSS ${fmt(css)} > ${budget.css} KB`);
  if (fonts > MAX_FONT_PRELOADS) over.push(`${fonts} font preloads > ${MAX_FONT_PRELOADS}`);
  if (over.length) failed = true;
  rows.push({ url, budget: budget.name, js, islands, css, fonts, over });
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(`${pad('page', 34)}${pad('budget', 13)}${padL('JS', 7)}${padL('islands', 9)}${padL('CSS', 7)}${padL('fonts', 7)}   (KB gzip)`);
for (const r of rows) {
  console.log(
    `${pad(r.url, 34)}${pad(r.budget, 13)}${padL(fmt(r.js), 7)}${padL(fmt(r.islands), 9)}${padL(fmt(r.css), 7)}${padL(r.fonts, 7)}` +
      (r.over.length ? `   OVER: ${r.over.join('; ')}` : '')
  );
}

if (!rows.length) {
  console.error(`No pages found in ${DIST} — run \`npm run build\` first.`);
  process.exit(1);
}

// What every route shares, apart from what even the 404 has: the core sections.
const onEveryRoute = (href) => CORE_ROUTES.every((route) => stylesheets.get(route)?.has(href));
const core = [...(stylesheets.get(CORE_ROUTES[0]) ?? [])].filter((href) => onEveryRoute(href) && !stylesheets.get('/404')?.has(href));
const coreCss = core.reduce((n, href) => n + sizeOf(href), 0);
console.log(`\nCore sections' CSS: ${fmt(coreCss)} of ${CORE_CSS_KB} KB`);
if (coreCss > CORE_CSS_KB * KB) {
  console.error('Core sections are on every route. Bind a section to its route instead (src/lib/section-catalogue.ts).');
  failed = true;
}

if (failed) {
  console.error('\nPage weight budget exceeded. Trim the page, or raise its budget in scripts/check-budgets.mjs with a reason.');
  process.exit(1);
}
console.log(`\nAll ${rows.length} pages within budget.`);
