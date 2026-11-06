import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRAME_SANDBOX } from '../../src/builder/canvas/frame';

/**
 * The sign-in token lives on the same origin as the page content the builder
 * shows. Two things keep them apart: the frame's sandbox, and the builder page's
 * Content-Security-Policy. Weakening either should take a deliberate change here.
 */
const ROOT = join(__dirname, '..', '..');

function builderCsp(): string {
  const headers = readFileSync(join(ROOT, 'public/_headers'), 'utf8').replaceAll('\r\n', '\n');
  return /^\/admin\/builder\/\n\s+Content-Security-Policy: (.+)$/m.exec(headers)?.[1] ?? '';
}

const directive = (name: string) => builderCsp().split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

describe('the canvas sandbox', () => {
  it('gives the frame its origin, so we can measure it, and nothing else', () => {
    expect(FRAME_SANDBOX).toBe('allow-same-origin');
  });

  it('never allows scripts, anywhere in the builder', () => {
    for (const file of walk(join(ROOT, 'src/builder'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/allow-scripts['"`]/);
    }
  });

  it('goes on once, as a frame is made, before it loads anything', () => {
    const uses = walk(join(ROOT, 'src/builder')).flatMap((file) => readFileSync(file, 'utf8').match(/setAttribute\(\s*['"]sandbox.*/g) ?? []);
    expect(uses).toEqual(["setAttribute('sandbox', FRAME_SANDBOX);"]);
    const frame = readFileSync(join(ROOT, 'src/builder/canvas/frame.ts'), 'utf8');
    expect(/function createFrame[\s\S]*?^}/m.exec(frame)?.[0]).not.toContain('.src');
  });
});

describe('the builder’s Content-Security-Policy', () => {
  it('exists, on the page that holds the token', () => {
    expect(builderCsp()).toContain("default-src 'none'");
  });

  it('runs only our own scripts, with no inline code and no eval', () => {
    expect(directive('script-src')).toBe("script-src 'self'");
  });

  it('sends data only to ourselves and GitHub', () => {
    expect(directive('connect-src')).toBe("connect-src 'self' https://api.github.com");
  });

  it('can’t be framed, and can’t be sent elsewhere by a form or a base tag', () => {
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('form-action')).toBe("form-action 'none'");
    expect(directive('base-uri')).toBe("base-uri 'none'");
  });
});
