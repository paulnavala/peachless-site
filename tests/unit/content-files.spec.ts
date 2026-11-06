import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { REDIRECTS } from '../../redirects.config.mjs';
import { ID_RE, RESERVED_PAGE_IDS, RESERVED_PROJECT_IDS } from '../../src/lib/content-schema';
import { PAGE_IDS } from '../../src/lib/section-catalogue';

/**
 * Folder-per-entry content: the folder name is the page URL and every image
 * the entry uses sits inside its own folder (that is where the CMS uploads).
 */
const ROOT = join(__dirname, '..', '..');
const folders = (dir: string) =>
  readdirSync(join(ROOT, dir)).filter((d) => statSync(join(ROOT, dir, d)).isDirectory());

/** Every string value that looks like an image file. */
function imageRefs(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string' && /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => imageRefs(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => imageRefs(v, out));
  return out;
}

describe('the content cache', () => {
  it('is tied to the schema, which Astro does not watch', () => {
    const schema = readFileSync(join(ROOT, 'src/lib/content-schema.ts'), 'utf8').replaceAll('\r\n', '\n');
    const hash = createHash('sha256').update(schema).digest('hex').slice(0, 12);
    const config = readFileSync(join(ROOT, 'src/content.config.ts'), 'utf8');
    expect(config, `The schema changed: set the line in src/content.config.ts to "// content-schema: ${hash}"`).toContain(`// content-schema: ${hash}`);
  });
});

describe('a custom page’s address', () => {
  const taken: readonly string[] = [...RESERVED_PAGE_IDS, ...PAGE_IDS];
  const name = (file: string) => file.replace(/\.astro$/, '');

  it.each(folders('public'))('can’t be public/%s, whose files would clash with it', (folder) => {
    expect(taken).toContain(folder);
  });

  it.each(Object.keys(REDIRECTS).filter((from) => from.split('/').length === 2))('can’t be %s, which redirects elsewhere', (from) => {
    expect(taken).toContain(from.slice(1));
  });

  it.each(readdirSync(join(ROOT, 'src/pages')).filter((f) => !f.startsWith('[')).map(name))('can’t be %s, which is a route', (route) => {
    expect(taken).toContain(route);
  });
});

describe('page files', () => {
  it.each(folders('src/content/pages'))('%s only references images inside its own folder', (id) => {
    const data = parse(readFileSync(join(ROOT, 'src/content/pages', id, 'index.yaml'), 'utf8'));
    for (const ref of imageRefs(data)) {
      expect(ref, `${id}: ${ref}`).not.toMatch(/^(\/|\.\.|https?:)/);
      expect(existsSync(normalize(join(ROOT, 'src/content/pages', id, ref))), `${id}: missing ${ref}`).toBe(true);
    }
  });

  it('are all there', () => {
    for (const id of PAGE_IDS) expect(existsSync(join(ROOT, 'src/content/pages', id, 'index.yaml')), id).toBe(true);
  });
});

describe('the résumé', () => {
  it('exists when the site links to it (the build would not notice)', () => {
    const { resume } = parse(readFileSync(join(ROOT, 'src/content/site/site.yaml'), 'utf8'));
    if (resume) expect(existsSync(join(ROOT, 'public', resume)), resume).toBe(true);
  });
});

describe.each(['src/content/projects', 'src/content/photos'])('%s', (dir) => {
  const ids = folders(dir);

  it('has entries', () => expect(ids.length).toBeGreaterThan(0));

  it.each(ids)('%s is a valid, unreserved folder name with an index.yaml', (id) => {
    expect(id).toMatch(ID_RE);
    expect(RESERVED_PROJECT_IDS as readonly string[]).not.toContain(id);
    expect(existsSync(join(ROOT, dir, id, 'index.yaml'))).toBe(true);
  });

  it.each(ids)('%s only references images inside its own folder', (id) => {
    const data = parse(readFileSync(join(ROOT, dir, id, 'index.yaml'), 'utf8'));
    for (const ref of imageRefs(data)) {
      expect(ref, `${id}: ${ref}`).not.toMatch(/^(\/|\.\.|https?:)/);
      const file = normalize(join(ROOT, dir, id, ref));
      expect(existsSync(file), `${id}: missing ${ref}`).toBe(true);
    }
  });
});
