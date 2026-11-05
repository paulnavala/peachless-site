// Compares two builds' HTML with the noise stripped, to prove a refactor changed
// nothing a visitor receives. scripts/diff-layout.mjs covers what HTML can't see:
// cascade order and computed styles.
//
//   node scripts/diff-dist.mjs <baseline-dist> [<dist>]
//
// Stripped: Astro's scope ids, the builder's data attributes, asset hashes,
// stylesheets (a chunk's name and contents follow the module graph) and the
// order of attributes on a tag (spreading ...rest can reorder them).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [baselineDir, distDir = 'dist'] = process.argv.slice(2);
if (!baselineDir) {
  console.error('usage: node scripts/diff-dist.mjs <baseline-dist> [<dist>]');
  process.exit(2);
}

const htmlFiles = (root) => {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== 'admin' && name !== '_astro') walk(full);
      } else if (name.endsWith('.html')) {
        found.push(relative(root, full).split(sep).join('/'));
      }
    }
  };
  walk(root);
  return found.sort();
};

const IGNORED_ATTR = /^(data-astro-cid-[\w-]+|data-section|data-section-type|data-field|data-field-[\w-]+|data-block)(=|$)/;
const ATTR = /[^\s=]+(?:="[^"]*")?/g;

/** Removes a hashed asset's fingerprint: /_astro/name.AbC123_Z1x9.webp → /_astro/name.webp */
const unhash = (text) => text.replace(/(\/_astro\/[\w.-]*?)\.[\w-]{8}(?:_[\w-]+)?(\.\w+)/g, '$1$2');

const tidyTag = (tag) => {
  const match = /^<([a-zA-Z][\w:-]*)([\s\S]*?)(\/?)>$/.exec(tag);
  if (!match) return tag;
  const [, name, attrs, selfClose] = match;
  const kept = (attrs.match(ATTR) ?? []).filter((a) => !IGNORED_ATTR.test(a)).sort();
  return `<${name}${kept.length ? ' ' + kept.join(' ') : ''}${selfClose}>`;
};

export const normalise = (html) =>
  unhash(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<link[^>]*rel="?stylesheet"?[^>]*>/g, '')
    // A tag, quoted attribute values included, so a ">" in a value doesn't end it.
    .replace(/<[a-zA-Z][\w:-]*(?:\s+[^\s=>]+(?:="[^"]*")?)*\s*\/?>/g, tidyTag)
    .replace(/>\s+</g, '><')
    .replace(/></g, '>\n<');

const firstDifference = (a, b) => {
  const left = a.split('\n');
  const right = b.split('\n');
  const at = left.findIndex((line, i) => line !== right[i]);
  const line = at === -1 ? left.length : at;
  return { line, before: left[line] ?? '(end of file)', after: right[line] ?? '(end of file)', lines: Math.abs(left.length - right.length) };
};

if (!existsSync(baselineDir) || !existsSync(distDir)) {
  console.error(`Missing build: ${existsSync(baselineDir) ? distDir : baselineDir}`);
  process.exit(2);
}

const baseline = htmlFiles(baselineDir);
const current = htmlFiles(distDir);
const added = current.filter((f) => !baseline.includes(f));
const removed = baseline.filter((f) => !current.includes(f));
const changed = [];

for (const file of baseline.filter((f) => current.includes(f))) {
  const a = normalise(readFileSync(join(baselineDir, file), 'utf8'));
  const b = normalise(readFileSync(join(distDir, file), 'utf8'));
  if (a !== b) changed.push({ file, ...firstDifference(a, b) });
}

for (const file of added) console.log(`added    ${file}`);
for (const file of removed) console.log(`removed  ${file}`);
for (const { file, line, before, after, lines } of changed) {
  console.log(`changed  ${file} (first at line ${line}${lines ? `, ${lines} lines longer or shorter` : ''})`);
  console.log(`  - ${before.slice(0, 220)}`);
  console.log(`  + ${after.slice(0, 220)}`);
}

const total = baseline.length;
const problems = added.length + removed.length + changed.length;
console.log(problems ? `\n${problems} difference(s) across ${total} pages.` : `\nNo differences across ${total} pages.`);
process.exit(problems ? 1 : 0);
