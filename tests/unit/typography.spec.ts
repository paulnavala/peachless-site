import { describe, expect, it } from 'vitest';
import { glueDashes, glueDashesInHtml } from '../../src/lib/typography';

const NBSP = ' ';

describe('glueDashes', () => {
  it('keeps a spaced em or en dash with the word before it', () => {
    expect(glueDashes('A concept for CERN — homepage and news')).toBe(`A concept for CERN${NBSP}— homepage and news`);
    expect(glueDashes('Light and texture – before and after')).toBe(`Light and texture${NBSP}– before and after`);
  });

  it('leaves unspaced dashes alone: ranges and a dash that opens a line', () => {
    expect(glueDashes('2019–2021')).toBe('2019–2021');
    expect(glueDashes('— Patricia')).toBe('— Patricia');
  });

  it('glues every dash in the text', () => {
    expect(glueDashes('one — two — three')).toBe(`one${NBSP}— two${NBSP}— three`);
  });
});

describe('glueDashesInHtml', () => {
  const page = (head: string, body: string) => `<!doctype html><html><head>${head}</head><body class="x">${body}</body></html>`;

  it('glues dashes in the text of the body', () => {
    const html = page('', '<p class="lede">Images — blending <em>UI — UX</em></p>');
    expect(glueDashesInHtml(html)).toBe(page('', `<p class="lede">Images${NBSP}— blending <em>UI${NBSP}— UX</em></p>`));
  });

  it('never touches the head: title, meta and structured data', () => {
    const head = '<title>CERN — peachless.</title><meta name="description" content="CERN — homepage">';
    const html = page(head, '<p>a — b</p>');
    expect(glueDashesInHtml(html)).toBe(page(head, `<p>a${NBSP}— b</p>`));
  });

  it('never touches attributes, scripts or styles in the body', () => {
    const body = '<a title="a — b" href="/">x</a><script>const s = "a — b";</script><style>/* a — b */</style>';
    expect(glueDashesInHtml(page('', body))).toBe(page('', body));
  });

  it('leaves a page without a body as it is', () => {
    expect(glueDashesInHtml('<p>a — b</p>')).toBe('<p>a — b</p>');
  });
});
