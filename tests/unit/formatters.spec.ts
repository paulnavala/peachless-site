import { describe, expect, it } from 'vitest';
import { escapeHtml, litHtml, litWords, taglineHtml } from '../../src/lib/formatters';

describe('escapeHtml', () => {
  it('leaves nothing that could start a tag or end an attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;');
  });
});

describe('litHtml', () => {
  it('numbers each word so they light in turn', () => {
    expect(litHtml('Design is felt')).toBe('<span style="--w:0">Design</span> <span style="--w:1">is</span> <span style="--w:2">felt</span>');
  });

  it('treats any run of spaces as one gap', () => {
    expect(litWords('  two   words\n')).toEqual(['two', 'words']);
  });

  it('escapes what an editor types', () => {
    expect(litHtml('<b>')).toContain('&lt;b&gt;');
  });
});

describe('taglineHtml', () => {
  const html = taglineHtml('Every pixel', 'Yours');

  it('marks the second line, which takes the accent colour', () => {
    expect(html.match(/tagline__line--2/g)).toHaveLength(1);
  });

  it('gives every character its own delay, in typing order', () => {
    const delays = [...html.matchAll(/--d:(\d+)ms/g)].map((m) => Number(m[1]));
    expect(delays).toHaveLength('Everypixel'.length + 'Yours'.length);
    expect(delays[5]).toBeGreaterThan(delays[0]);
  });

  it('pauses between the lines', () => {
    const delays = [...html.matchAll(/--d:(\d+)ms/g)].map((m) => Number(m[1]));
    const inLine = delays[1] - delays[0];
    expect(delays[10] - delays[9]).toBeGreaterThan(inLine * 3);
  });

  it('is deterministic, so the canvas and the build agree', () => {
    expect(taglineHtml('Every pixel', 'Yours')).toBe(html);
  });

  it('escapes what an editor types', () => {
    expect(taglineHtml('<', '&')).toContain('&lt;');
  });
});
