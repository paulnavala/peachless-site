import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REDIRECTS } from '../../redirects.config.mjs';

const ROOT = join(__dirname, '..', '..');
const cloudflare = readFileSync(join(ROOT, 'public', '_redirects'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/));

describe('redirects', () => {
  it('Cloudflare _redirects lists every redirect, with and without the trailing slash', () => {
    const expected = Object.entries(REDIRECTS).flatMap(([from, to]) => [
      [from, to, '301'],
      [`${from}/`, to, '301'],
    ]);
    expect(cloudflare).toEqual(expected);
  });

  it('never redirects the Work pages (a cached 301 the other way would loop)', () => {
    const sources = new Set(cloudflare.map(([from]) => from.replace(/\/$/, '')));
    for (const page of ['/projects', '/projects/graphic-design', '/projects/uiux', '/projects/logo-design']) {
      expect(sources.has(page), page).toBe(false);
    }
  });

  it('points at trailing-slash URLs (Cloudflare 308s the bare form)', () => {
    for (const to of Object.values(REDIRECTS)) expect(to.endsWith('/'), to).toBe(true);
  });
});
