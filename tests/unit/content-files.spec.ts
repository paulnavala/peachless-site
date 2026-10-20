import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ID_RE, RESERVED_PROJECT_IDS } from '../../src/lib/content-schema';

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
