// Records where every element lands and how it is styled, then compares two
// builds. It catches what an HTML diff can't: moving a <style> block changes
// cascade order without changing a single tag.
//
//   node scripts/diff-layout.mjs capture <base-url> <out-dir>
//   node scripts/diff-layout.mjs compare <base-url> <baseline-dir>
//
// The route list comes from dist/, so run it against a fresh `npm run preview`.
// Each route is read at three widths under reduced motion (base styles are the
// final state), plus once with motion allowed, reading only the motion rules.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [mode, rawBase, dir] = process.argv.slice(2);
const base = rawBase?.replace(/\/$/, '');
if (!['capture', 'compare'].includes(mode) || !base || !dir) {
  console.error('usage: node scripts/diff-layout.mjs capture|compare <base-url> <dir>');
  process.exit(2);
}

const WIDTHS = [390, 768, 1440];
const MAX_REPORTED = 6;

const LAYOUT_PROPS = [
  'display', 'position', 'float', 'visibility', 'opacity', 'z-index', 'overflow-x', 'overflow-y',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-wrap',
  'color', 'background-color', 'background-image', 'border-top-color', 'border-top-width', 'border-top-left-radius',
  'box-shadow', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'grid-template-columns', 'grid-template-rows', 'grid-column-start', 'grid-column-end', 'row-gap', 'column-gap',
  'justify-content', 'justify-items', 'align-items', 'align-content', 'container-type', 'aspect-ratio', 'object-fit', 'object-position',
];
const MOTION_PROPS = [
  'animation-name', 'animation-duration', 'animation-timeline', 'animation-range-start', 'animation-range-end',
  'transition-property', 'transition-duration', 'view-timeline-name', 'view-timeline-inset', 'view-transition-name',
];

/** Every built page, as a URL. Redirect stubs are only a refresh tag, so they're left out. */
const routes = () => {
  const root = 'dist';
  const found = [];
  const walk = (folder) => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) {
        if (name !== 'admin' && name !== '_astro') walk(full);
      } else if (name === 'index.html' && !readFileSync(full, 'utf8').includes('http-equiv="refresh"')) {
        found.push('/' + relative(root, folder).split(sep).join('/'));
      }
    }
  };
  walk(root);
  return [...found.map((r) => (r === '/' ? r : r + '/')).sort(), '/this-page-does-not-exist/'];
};

const readPage = (page, props) =>
  page.evaluate((names) => {
    const round = (n) => Math.round(n * 10) / 10;
    const rows = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      rows.push({
        el: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim().split(/\s+/).join('.')}`,
        box: [round(r.x), round(r.y + scrollY), round(r.width), round(r.height)].join(' '),
        css: names.map((name) => css.getPropertyValue(name)).join('|'),
      });
    }
    return rows;
  }, props);

const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('load');
};

const slug = (route) => route.replace(/^\/|\/$/g, '').replaceAll('/', '_') || 'home';

async function capture(browser) {
  const shots = new Map();
  const list = routes();
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const route of list) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await settle(page);
      shots.set(`${slug(route)}-${width}`, await readPage(page, LAYOUT_PROPS));
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  for (const route of list) {
    await page.goto(base + route, { waitUntil: 'domcontentloaded' });
    await settle(page);
    // Only the rules are compared here: positions shift while things animate.
    shots.set(`${slug(route)}-motion`, (await readPage(page, MOTION_PROPS)).map(({ el, css }) => ({ el, box: '', css })));
  }
  await context.close();
  return shots;
}

const browser = await chromium.launch();
const shots = await capture(browser);
await browser.close();

if (mode === 'capture') {
  mkdirSync(dir, { recursive: true });
  for (const [name, rows] of shots) writeFileSync(join(dir, `${name}.json`), JSON.stringify(rows));
  console.log(`Captured ${shots.size} views.`);
  process.exit(0);
}

const propsOf = (name) => (name.endsWith('-motion') ? MOTION_PROPS : LAYOUT_PROPS);
// The photo masonry settles a fraction of a pixel differently from run to run as
// it hydrates, so a box may drift by up to a pixel. Computed styles must match exactly.
const sameBox = (a, b) => {
  const left = a.split(' ').map(Number);
  const right = b.split(' ').map(Number);
  return left.every((n, i) => Math.abs(n - right[i]) <= 1);
};
// A grid's computed tracks are used pixel sizes, so they are measurements too.
const MEASURED = new Set(['grid-template-columns', 'grid-template-rows']);
const sameTracks = (a, b) => {
  const left = a.replaceAll('px', '').split(' ');
  const right = b.replaceAll('px', '').split(' ');
  return left.length === right.length && left.every((n, i) => n === right[i] || Math.abs(Number(n) - Number(right[i])) <= 1);
};
const sameValue = (prop, a, b) => a === b || (MEASURED.has(prop) && sameTracks(a, b));
let problems = 0;
for (const [name, rows] of shots) {
  const file = join(dir, `${name}.json`);
  if (!existsSync(file)) {
    console.log(`new view ${name}`);
    problems++;
    continue;
  }
  const baseline = JSON.parse(readFileSync(file, 'utf8'));
  const diffs = [];
  if (baseline.length !== rows.length) diffs.push(`element count ${baseline.length} → ${rows.length}`);
  for (let i = 0; i < Math.min(baseline.length, rows.length) && diffs.length < MAX_REPORTED; i++) {
    const a = baseline[i];
    const b = rows[i];
    if (a.el !== b.el) {
      diffs.push(`#${i} is ${b.el}, was ${a.el}`);
      break; // Everything after a structural change is noise.
    }
    if (!sameBox(a.box, b.box)) diffs.push(`#${i} ${b.el} box ${a.box} → ${b.box}`);
    if (a.css !== b.css) {
      const left = a.css.split('|');
      const right = b.css.split('|');
      const changed = propsOf(name).filter((prop, p) => !sameValue(prop, left[p], right[p]));
      if (changed.length) diffs.push(`#${i} ${b.el} ${changed.map((p) => `${p}: ${left[propsOf(name).indexOf(p)]} → ${right[propsOf(name).indexOf(p)]}`).join('; ')}`);
    }
  }
  if (diffs.length) {
    problems++;
    console.log(`changed  ${name}`);
    for (const d of diffs) console.log(`  ${d.slice(0, 260)}`);
  }
}
console.log(problems ? `\n${problems} of ${shots.size} views differ.` : `\nNo differences across ${shots.size} views.`);
process.exit(problems ? 1 : 0);
