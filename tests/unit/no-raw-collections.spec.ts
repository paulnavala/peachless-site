import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Hidden projects/photos must never leak onto the site, so only
 * src/lib/content.ts may read those collections directly; everything else
 * goes through its published-only helpers.
 */
const ROOT = join(__dirname, '..', '..');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));

describe('collection access', () => {
  it('only src/lib/content.ts calls getCollection/getEntry on projects or photos', () => {
    const offenders = walk(join(ROOT, 'src'))
      .filter((f) => /\.(astro|ts|vue)$/.test(f))
      .map((f) => relative(ROOT, f).split(sep).join('/'))
      .filter((f) => f !== 'src/lib/content.ts')
      .filter((f) => /get(Collection|Entry|Entries)\(\s*['"](projects|photos)['"]/.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
