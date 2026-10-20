#!/usr/bin/env node
/**
 * v2 content migration: logos + brands + projects → one `projects` collection
 * (folder per project, images beside index.yaml), photos → folder per photo,
 * pages split into one singleton per page, site settings split from the
 * developer-only form settings.
 *
 *   node scripts/migrate-v2.mjs            dry run: prints the plan and the owner-review list
 *   node scripts/migrate-v2.mjs --write    writes the new content
 *   node scripts/migrate-v2.mjs --write --prune   …and deletes the old collections/assets
 *
 * Re-runnable: restore the old tree from main
 * (`git checkout origin/main -- src/content src/assets public/guidelines`) and
 * run `--write --prune` again. Curated copy lives in migrate-v2.data.mjs and new
 * artwork in scripts/migrate-v2-assets/, so nothing hand-made is lost.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { stringify, parse } from 'yaml';
import { ABOUT, CONTACT, HOME, PHOTOGRAPHY, PHOTOS, PROJECTS, SITE, WORK } from './migrate-v2.data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...parts) => join(ROOT, ...parts);
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');
const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const PRUNE = args.has('--prune');

const LOGO_MAX = 2000; // px, longest edge
const PHOTO_MAX = 3200;

const ops = []; // { kind, to, from?, data?, viewBox?, max? }
const plannedTargets = new Map();
const review = [];

// ── Old sources ─────────────────────────────────────────────────────────────
const readJsonDir = (dir) =>
  existsSync(dir)
    ? Object.fromEntries(
        readdirSync(dir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))])
      )
    : {};

const oldProjects = readJsonDir(P('src/content/projects'));
const oldPhotos = readJsonDir(P('src/content/photos'));
if (!Object.keys(oldProjects).length || !Object.keys(oldPhotos).length) {
  console.log('Nothing to migrate: the old project/photo JSON files are gone (already migrated?).');
  console.log('To re-run, restore them first: git checkout origin/main -- src/content src/assets public/guidelines');
  process.exit(0);
}
const oldHome = parse(readFileSync(P('src/content/pages/home.yaml'), 'utf8'));
const oldContact = parse(readFileSync(P('src/content/pages/contact.yaml'), 'utf8'));
const oldSite = parse(readFileSync(P('src/content/site/site.yaml'), 'utf8'));
const oldAbout = readFileSync(P('src/content/pages/about.md'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/^---[\s\S]*?---\s*/, '');
if (!('buttonLabel' in oldHome)) throw new Error('src/content/pages/home.yaml is not in the old format; restore it from main first.');

// ── Helpers ─────────────────────────────────────────────────────────────────
function resolveSource(src) {
  const [scheme, ...rest] = src.split(':');
  const value = rest.join(':');
  switch (scheme) {
    case 'asset':
      return { file: P('src/assets', value) };
    case 'public':
      return { file: P('public', value) };
    case 'extra':
      return { file: P('scripts/migrate-v2-assets', value) };
    case 'logo': {
      const [name, kind] = value.split(':');
      return { file: P('src/assets/logos', `${name}_${kind}.png`), max: LOGO_MAX };
    }
    case 'svgcrop': {
      const [file, viewBox] = value.split(/:(.+)/);
      return { file: P('public/guidelines/peachless', file), viewBox };
    }
    default:
      throw new Error(`Unknown image source ${src}`);
  }
}

/** Plan copying `src` into `folder/as` and return the value the YAML stores. */
function image(folder, { src, as }) {
  const to = join(folder, as);
  const source = resolveSource(src);
  if (!existsSync(source.file)) throw new Error(`Missing source ${rel(source.file)} (for ${rel(to)})`);
  const prev = plannedTargets.get(to);
  if (prev && prev !== src) throw new Error(`${rel(to)} is planned from two sources: ${prev} and ${src}`);
  if (!prev) {
    plannedTargets.set(to, src);
    ops.push({
      kind: source.viewBox ? 'svgcrop' : source.max ? 'downscale' : 'copy',
      from: source.file,
      to,
      ...source,
    });
  }
  return as;
}

const isImageRef = (v) => v && typeof v === 'object' && 'src' in v && 'as' in v && Object.keys(v).length === 2;

/** Replace every {src, as} image reference in a block with its stored file name. */
function materialize(folder, value) {
  if (Array.isArray(value)) return value.map((v) => materialize(folder, v));
  if (isImageRef(value)) return image(folder, value);
  if (value && typeof value === 'object') {
    // Logo variants are written flat in the data file: {src, as, alt, label, panel}.
    if ('src' in value && 'as' in value) {
      const { src, as, ...restOfVariant } = value;
      return { image: image(folder, { src, as }), ...materialize(folder, restOfVariant) };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, materialize(folder, v)]));
  }
  return value;
}

const prune = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const dash = (s) => s.replace(/ - /g, ' — ');
const htmlToMarkdown = (html) => html.replace(/<strong>(.*?)<\/strong>/g, '**$1**').replace(/<em>(.*?)<\/em>/g, '*$1*').replace(/<[^>]+>/g, '');
const yaml = (obj) => stringify(obj, { lineWidth: 0 });
const write = (to, data) => ops.push({ kind: 'write', to, data });

// ── Projects ────────────────────────────────────────────────────────────────
const FIGMA = Object.fromEntries(Object.entries(oldProjects).map(([id, p]) => [id, p.figma]));

for (const p of PROJECTS) {
  const folder = P('src/content/projects', p.id);
  const blocks = p.blocks.map((b) => {
    const block = materialize(folder, b);
    if (block.type === 'prototype') {
      const key = block.url.replace(/^FIGMA:/, '');
      if (!FIGMA[key]) throw new Error(`No Figma link for ${key} in the old projects`);
      block.url = FIGMA[key];
    }
    return prune(block);
  });
  const entry = prune({
    title: p.title,
    summary: p.summary,
    disciplines: p.disciplines,
    year: p.year,
    client: p.client,
    role: p.role,
    tools: p.tools ?? [],
    cover: prune({
      image: image(folder, { src: p.cover.src, as: p.cover.as }),
      alt: p.cover.alt,
      panel: p.cover.panel,
      fit: p.cover.fit,
    }),
    accent: p.accent,
    featured: p.featured ?? false,
    hidden: p.hidden ?? false,
    order: p.order,
    blocks,
  });
  if (entry.summary.length > 160) throw new Error(`${p.id}: summary is ${entry.summary.length} characters (max 160)`);
  write(join(folder, 'index.yaml'), yaml(entry));
  for (const note of p.review ?? []) review.push(`${p.id}: ${note}`);
}

// ── Photos ──────────────────────────────────────────────────────────────────
const fromOldAsset = (path) => P('src/content/photos', path); // old JSON paths are relative to the JSON file
for (const [id, old] of Object.entries(oldPhotos)) {
  const folder = P('src/content/photos', id);
  const extra = PHOTOS[id] ?? {};
  if (!PHOTOS[id]) review.push(`photos/${id}: new photo since the curated list — write its alt text.`);
  const plan = (from, as) => {
    const to = join(folder, as);
    plannedTargets.set(to, rel(from));
    ops.push({ kind: 'downscale', from, to, max: PHOTO_MAX, jpeg: true });
    return as;
  };
  const entry = prune({
    title: old.title,
    image: plan(fromOldAsset(old.after), `${id}.jpg`),
    alt: extra.alt ?? old.title,
    before: old.before ? plan(fromOldAsset(old.before), `${id}-before.jpg`) : undefined,
    caption: extra.caption,
    location: extra.location,
    featured: false,
    hidden: false,
    order: (old.order ?? 0) + 1,
  });
  write(join(folder, 'index.yaml'), yaml(entry));
}

// ── Pages ───────────────────────────────────────────────────────────────────
// About: the first "### **…**" statement becomes `statement`; any other
// statements become ordinary paragraphs; the closing *italic* line becomes `closing`.
const rawStatements = [...oldAbout.matchAll(/^###[ \t]+\*\*(.+?)\*\*[ \t]*$/gm)].map((m) => m[1].trim());
const statements = rawStatements.map(dash);
const closing = oldAbout.match(/^\*([^*].*?)\*[ \t]*$/m)?.[1]?.trim();
const aboutBody = dash(
  oldAbout
    .replace(/^###[ \t]+\*\*(.+?)\*\*[ \t]*$/gm, (_, s) => (s.trim() === rawStatements[0] ? '' : s.trim()))
    .replace(/^\*([^*].*?)\*[ \t]*$/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
);

write(
  P('src/content/pages/home.yaml'),
  yaml(
    prune({
      eyebrow: HOME.eyebrow,
      tagline: HOME.tagline,
      lede: HOME.lede,
      primaryCta: HOME.primaryCta,
      secondaryCta: HOME.secondaryCta,
      manifesto: { heading: oldHome.heading, lead: htmlToMarkdown(oldHome.lead).replace(/\*\*(.+?)\s*-\*\*/, '**$1** —') },
      services: HOME.services,
      featured: HOME.featured,
      photography: HOME.photography,
      about: { heading: HOME.about.heading, body: statements[0], linkLabel: HOME.about.linkLabel },
      seo: HOME.seo,
    })
  )
);

write(P('src/content/pages/work.yaml'), yaml(WORK));

ops.push({ kind: 'copy', from: P('src/assets/about/portrait.jpg'), to: P('src/content/pages/images/portrait.jpg') });
write(
  P('src/content/pages/about.md'),
  `---\n${yaml(
    prune({
      eyebrow: ABOUT.eyebrow,
      title: ABOUT.title,
      statement: statements[0],
      portrait: 'images/portrait.jpg',
      portraitAlt: ABOUT.portraitAlt,
      closing,
      seo: ABOUT.seo,
    })
  )}---\n${aboutBody}\n`
);

const fortuneSource = readFileSync(P('src/components/static/FortunePeach.astro'), 'utf8');
const fortunes = [...(fortuneSource.match(/const FORTUNES[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)].map(
  (m) => m[2].replace(/\\(['"])/g, '$1')
);
if (fortunes.length < 3) throw new Error('Could not read the fortunes from FortunePeach.astro');
write(
  P('src/content/pages/contact.yaml'),
  yaml({
    eyebrow: CONTACT.eyebrow,
    heading: CONTACT.heading,
    lede: CONTACT.lede,
    form: CONTACT.form,
    fortune: { ...CONTACT.fortune, fortunes },
    seo: CONTACT.seo,
  })
);

write(P('src/content/pages/photography.yaml'), yaml(PHOTOGRAPHY));

// ── Site + developer-only form settings ─────────────────────────────────────
const emails = oldSite.emails ?? oldContact.emails;
write(
  P('src/content/site/site.yaml'),
  yaml({
    siteName: SITE.siteName,
    ownerName: SITE.ownerName,
    tagline: oldSite.tagline,
    nav: SITE.nav.map((n) => ({ label: n.label, href: n.href, cta: !!n.cta })),
    emails,
    socials: oldSite.socials ?? [],
    cta: SITE.cta,
    seo: { description: oldSite.defaultDescription ?? oldSite.seo?.description },
  })
);
write(
  P('src/content/site/form.yaml'),
  yaml({ endpoint: oldSite.formEndpoint ?? '', hidden: oldSite.formHidden ?? {} })
);

// ── Prune list ──────────────────────────────────────────────────────────────
const pruneTargets = [
  'src/content/logos',
  'src/content/brands',
  ...Object.keys(oldProjects).map((id) => `src/content/projects/${id}.json`),
  ...Object.keys(oldPhotos).map((id) => `src/content/photos/${id}.json`),
  'src/assets/logos',
  'src/assets/photography',
  'src/assets/about',
  'public/guidelines',
].filter((p) => existsSync(P(p)));

// ── Report / execute ────────────────────────────────────────────────────────
console.log(`v2 migration — ${WRITE ? 'WRITING' : 'dry run'}${PRUNE ? ' + prune' : ''}\n`);
for (const op of ops) {
  const from = op.from ? ` ← ${rel(op.from)}` : '';
  const how = op.kind === 'svgcrop' ? ` (viewBox ${op.viewBox})` : op.kind === 'downscale' ? ` (≤${op.max}px)` : '';
  console.log(`  ${op.kind.padEnd(9)} ${rel(op.to)}${from}${how}`);
}
if (PRUNE) for (const p of pruneTargets) console.log(`  delete    ${p}`);

if (WRITE) {
  for (const op of ops) {
    mkdirSync(dirname(op.to), { recursive: true });
    if (op.kind === 'write') writeFileSync(op.to, op.data);
    else if (op.kind === 'copy') copyFileSync(op.from, op.to);
    else if (op.kind === 'svgcrop') {
      const svg = readFileSync(op.from, 'utf8').replace(/(<svg\b[^>]*?\s)viewBox="[^"]*"/, `$1viewBox="${op.viewBox}"`);
      writeFileSync(op.to, svg);
    } else if (op.kind === 'downscale') {
      const img = sharp(op.from, { limitInputPixels: false }).rotate();
      const meta = await img.metadata();
      const needs = Math.max(meta.width ?? 0, meta.height ?? 0) > op.max;
      if (!needs) copyFileSync(op.from, op.to);
      else if (op.jpeg) await img.resize(op.max, op.max, { fit: 'inside' }).jpeg({ quality: 88, mozjpeg: true }).toFile(op.to);
      else await img.resize(op.max, op.max, { fit: 'inside' }).png({ compressionLevel: 9 }).toFile(op.to);
    }
  }
  if (PRUNE) for (const p of pruneTargets) rmSync(P(p), { recursive: true, force: true });
  console.log(`\nWrote ${ops.length} files${PRUNE ? `, deleted ${pruneTargets.length} old paths` : ''}.`);
}

console.log('\nFor the owner to check:');
for (const note of review) console.log(`  • ${note}`);
