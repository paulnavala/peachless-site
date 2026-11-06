// Compares two builds' HTML with the noise stripped, to prove a refactor changed
// nothing a visitor receives. scripts/diff-layout.mjs covers what HTML can't see:
// cascade order and computed styles.
//
//   node scripts/diff-dist.mjs <baseline-dist> [<dist>] [--rename old=new ...]
//
// Stripped: Astro's scope ids, the builder's data attributes, asset hashes,
// stylesheets (a chunk's name and contents follow the module graph) and the
// order of attributes on a tag (spreading ...rest can reorder them). --rename
// reads a deliberately renamed class as the same class.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const renames = args.flatMap((arg, i) => (args[i - 1] === '--rename' ? [arg.split('=')] : []));
const [baselineDir, distDir = 'dist'] = args.filter((arg, i) => arg !== '--rename' && args[i - 1] !== '--rename');
if (!baselineDir) {
  console.error('usage: node scripts/diff-dist.mjs <baseline-dist> [<dist>] [--rename old=new ...]');
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

const applyRenames = (html) => renames.reduce((text, [from, to]) => text.replaceAll(from, to), html);

export const normalise = (html) =>
  unhash(applyRenames(html))
    .replace(/\r\n?/g, '\n')
    // An island's props hold its scope id, and its uid is a hash of its props.
    .replace(/,?&quot;data-astro-cid-[\w-]+&quot;:\[0,true\]/g, '')
    .replace(/(<astro-island\b[^>]*?) uid="[^"]*"/g, '$1')
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
  const before = left[line] ?? '(end of file)';
  const after = right[line] ?? '(end of file)';
  // Lines can be very long (an island's props), so show where they part.
  let column = 0;
  while (column < before.length && before[column] === after[column]) column++;
  const from = Math.max(0, column - 70);
  return { line, before: before.slice(from, column + 150), after: after.slice(from, column + 150), lines: Math.abs(left.length - right.length) };
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
  console.log(`  - ${before}`);
  console.log(`  + ${after}`);
}

const total = baseline.length;
const problems = added.length + removed.length + changed.length;
console.log(problems ? `\n${problems} difference(s) across ${total} pages.` : `\nNo differences across ${total} pages.`);
process.exit(problems ? 1 : 0);
