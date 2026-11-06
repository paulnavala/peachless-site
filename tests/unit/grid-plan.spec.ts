import { describe, expect, it } from 'vitest';
import { plainPageSchema, type GridElement } from '../../src/lib/content-schema';
import {
  attrsHtml,
  cellRatio,
  elementHtml,
  imageSizes,
  itemHtml,
  offGrid,
  overlapping,
  planGrid,
  readingOrder,
  tooNarrow,
} from '../../src/lib/grid-plan';
import { checkPage, endsPage, opensPage } from '../../src/lib/page-rules';

/** Elements as the schema leaves them, defaults and all. */
function elements(...raw: Record<string, unknown>[]): GridElement[] {
  const doc = plainPageSchema.parse({ title: 'T', sections: [{ id: 's', type: 'grid', elements: raw }] });
  return (doc.sections[0] as { elements: GridElement[] }).elements;
}

const heading = (id: string, col: number, row: number, more = {}) => ({ id, type: 'heading', col, row, w: 6, h: 2, text: 'Hi', ...more });
const text = (id: string, col: number, row: number) => ({ id, type: 'text', col, row, w: 6, h: 2, body: 'Words' });

describe('reading order', () => {
  it('runs top to bottom, then left to right', () => {
    const list = [{ id: 'c', row: 2, col: 1 }, { id: 'b', row: 1, col: 7 }, { id: 'a', row: 1, col: 1 }];
    expect(readingOrder(list).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('is the order elements are written in, whatever order the file lists them', () => {
    const plan = planGrid(elements(text('late', 1, 5), heading('early', 1, 1)));
    expect(plan.map((p) => p.element.id)).toEqual(['early', 'late']);
  });
});

describe('placement', () => {
  it('carries the cell as custom properties, so CSS does the layout', () => {
    const [planned] = planGrid(elements({ ...heading('a', 3, 4), w: 5, h: 2 }));
    expect(planned.attrs.style).toContain('--col:3;--row:4;--w:5;--h:2');
  });

  it('leaves default alignment off the markup', () => {
    const [planned] = planGrid(elements(heading('a', 1, 1)));
    expect(planned.attrs['data-align']).toBeUndefined();
    expect(planned.attrs['data-valign']).toBeUndefined();
  });

  it('marks a chosen alignment', () => {
    const [planned] = planGrid(elements(heading('a', 1, 1, { align: 'center', valign: 'end' })));
    expect(planned.attrs['data-align']).toBe('center');
    expect(planned.attrs['data-valign']).toBe('end');
  });
});

describe('heading levels', () => {
  const levels = (opener: boolean, ...raw: Record<string, unknown>[]) => planGrid(elements(...raw), { opener }).map((p) => p.level);

  it('leads with an h2 in the body of a page', () => {
    expect(levels(false, heading('a', 1, 1), heading('b', 1, 3))).toEqual([2, 3]);
  });

  it('gives an opening section the page’s h1', () => {
    expect(levels(true, heading('a', 1, 1), heading('b', 1, 3))).toEqual([1, 2]);
  });

  it('ignores the look: a heading styled large is still sequential', () => {
    expect(levels(false, heading('a', 1, 1, { style: 'h4' }), heading('b', 1, 3, { style: 'statement' }))).toEqual([2, 3]);
  });
});

describe('motion', () => {
  it('reveals elements below the fold', () => {
    expect(planGrid(elements(heading('a', 1, 1)))[0].attrs['data-reveal']).toBe('');
  });

  it('never holds back the first screen', () => {
    const [planned] = planGrid(elements(heading('a', 1, 1)), { aboveFold: true });
    expect(planned.attrs['data-reveal']).toBeUndefined();
    expect(planned.attrs.style).not.toContain('--reveal-index');
  });
});

describe('phones', () => {
  const image = { id: 'i', type: 'image', col: 1, row: 1, w: 6, h: 4, image: 'a.jpg', alt: 'A' };

  it('hides what the editor hid, and halves what they halved', () => {
    const [planned] = planGrid(elements(heading('a', 1, 1, { phone: { hidden: true, span: 'half' } })));
    expect(planned.attrs['data-phone-hidden']).toBe('');
    expect(planned.attrs['data-phone-span']).toBe('half');
  });

  it('lets an image move, because it carries no reading order', () => {
    const [planned] = planGrid(elements({ ...image, phone: { order: -1 } }));
    expect(planned.attrs.style).toContain('--phone-order:-1');
  });

  it('won’t let text move, which would part reading order from tab order', () => {
    const [planned] = planGrid(elements(heading('a', 1, 1, { phone: { order: -1 } })));
    expect(planned.attrs.style).not.toContain('--phone-order');
  });

  it('keeps an image’s shape when it no longer has rows to fill', () => {
    const [planned] = planGrid(elements(image));
    expect(planned.attrs.style).toContain(`--ratio:${cellRatio({ w: 6, h: 4 })}`);
  });
});

describe('image sizes', () => {
  it('follows the columns on wide screens and the full width on phones', () => {
    expect(imageSizes(6)).toBe('(min-width: 64em) 38rem, (min-width: 48em) 50vw, 100vw');
  });

  it('halves on a phone when the element does', () => {
    expect(imageSizes(6, 'half').endsWith('50vw')).toBe(true);
  });
});

describe('markup', () => {
  const html = (...raw: Record<string, unknown>[]) => elementHtml(planGrid(elements(...raw))[0]);

  it('escapes what an editor types', () => {
    const out = html(heading('a', 1, 1, { text: '<img src=x onerror=alert(1)>' }));
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('escapes a button’s link and label', () => {
    const out = html({ id: 'b', type: 'button', col: 1, row: 1, w: 3, h: 1, label: '<b>', link: '/a"b' });
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('/a&quot;b');
  });

  it('renders text as markdown', () => {
    expect(html({ ...text('t', 1, 1), body: '**Bold**' })).toContain('<strong>Bold</strong>');
  });

  it('leaves out an empty attribution', () => {
    expect(html({ id: 'q', type: 'quote', col: 1, row: 1, w: 6, h: 2, quote: 'Hi' })).not.toContain('footer');
  });

  it('writes valueless attributes bare', () => {
    expect(attrsHtml({ 'data-reveal': '', class: 'a' })).toBe(' data-reveal class="a"');
  });

  it('hands images to the caller, who knows how to make them', () => {
    const [planned] = planGrid(elements({ id: 'i', type: 'image', col: 1, row: 1, w: 6, h: 4, image: 'a.jpg', alt: 'A' }));
    expect(itemHtml(planned, (element, sizes) => `<img alt="${element.alt}" sizes="${sizes}">`)).toContain('<img alt="A"');
  });
});

describe('page rules for custom sections', () => {
  const section = (id: string, ...raw: Record<string, unknown>[]) => ({ id, type: 'grid' as const, elements: elements(...raw) });
  const button = { id: 'b', type: 'button', col: 1, row: 1, w: 3, h: 1, label: 'Go', link: '/contact/' };

  it('opens a page with a heading of its own', () => {
    expect(opensPage(section('a', heading('h', 1, 1)))).toBe(true);
    expect(opensPage(section('a', text('t', 1, 1)))).toBe(false);
  });

  it('ends a page with a button of its own', () => {
    expect(endsPage(section('a', button))).toBe(true);
    expect(endsPage(section('a', text('t', 1, 1)))).toBe(false);
  });

  it('can be a whole page', () => {
    expect(checkPage('new', [section('a', heading('h', 1, 1), { ...button, row: 3 })])).toEqual([]);
  });

  it('finds overlaps', () => {
    const list = elements(heading('a', 1, 1), text('b', 3, 2));
    expect(overlapping(list).map(([a, b]) => [a.id, b.id])).toEqual([['a', 'b']]);
  });

  it('doesn’t count elements that only touch', () => {
    expect(overlapping(elements(heading('a', 1, 1), heading('b', 7, 1)))).toEqual([]);
    expect(overlapping(elements(heading('a', 1, 1), heading('b', 1, 3)))).toEqual([]);
  });

  it('finds an element past the right edge', () => {
    expect(offGrid(elements(heading('a', 8, 1)))).toHaveLength(1);
    expect(offGrid(elements(heading('a', 7, 1)))).toHaveLength(0);
  });

  it('finds an element too narrow for its words', () => {
    expect(tooNarrow(elements({ ...heading('a', 1, 1), w: 2 }))).toHaveLength(1);
    expect(tooNarrow(elements({ ...heading('a', 1, 1), w: 3 }))).toHaveLength(0);
  });

  it('reports each as a problem with the section', () => {
    const broken = section('story', heading('a', 8, 1), heading('b', 8, 2));
    const problems = checkPage('new', [section('top', heading('h', 1, 1)), broken, section('end', button)]);
    expect(problems.map((p) => p.rule)).toEqual(['grid', 'grid']);
    expect(problems.every((p) => p.section === 'story')).toBe(true);
  });
});
