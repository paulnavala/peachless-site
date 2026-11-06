import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { plainPageSchema, SECTION_TYPES, type SectionType } from '../../src/lib/content-schema';
import { checkPage } from '../../src/lib/page-rules';
import { allowedOn, coreSections, PAGE_IDS, SECTIONS } from '../../src/lib/section-catalogue';

const PAGES = join(__dirname, '..', '..', 'src', 'content', 'pages');
const pages = Object.fromEntries(PAGE_IDS.map((id) => [id, parse(readFileSync(join(PAGES, id, 'index.yaml'), 'utf8'))]));

const s = (type: SectionType, id: string = type, hidden = false) => ({ id, type, hidden });
const rules = (pageId: string, ...sections: ReturnType<typeof s>[]) => checkPage(pageId, sections).map((p) => p.rule);

describe('the site’s own pages', () => {
  it.each(PAGE_IDS)('%s parses as a page document', (id) => {
    expect(plainPageSchema.safeParse(pages[id]).success).toBe(true);
  });

  it.each(PAGE_IDS)('%s keeps every page rule', (id) => {
    expect(checkPage(id, plainPageSchema.parse(pages[id]).sections)).toEqual([]);
  });
});

describe('the catalogue', () => {
  it('describes every section type', () => {
    expect(Object.keys(SECTIONS).sort()).toEqual([...SECTION_TYPES].sort());
  });

  it('keeps sections with an island, a form or a one-off script on their own page', () => {
    expect(coreSections).not.toContain('hero');
    expect(coreSections).not.toContain('contact');
    expect(coreSections).not.toContain('gallery');
  });

  it('lets a core section go on a custom page, but not a bound one', () => {
    expect(allowedOn('page-header', 'my-new-page')).toBe(true);
    expect(allowedOn('gallery', 'my-new-page')).toBe(false);
    expect(allowedOn('gallery', 'photography')).toBe(true);
  });

  it('keeps sections off pages where their view-transition names would collide', () => {
    expect(allowedOn('deck', 'work')).toBe(false);
    expect(allowedOn('about-teaser', 'about')).toBe(false);
  });
});

describe('page rules', () => {
  const closing = s('cta-band', 'next-step');

  it('passes a plain custom page', () => {
    expect(rules('new', s('page-header'), closing)).toEqual([]);
  });

  it('needs a title', () => {
    expect(rules('new', s('manifesto'), closing)).toContain('opener');
  });

  it('puts the title first', () => {
    expect(rules('new', s('manifesto'), s('page-header'), closing)).toContain('opener');
  });

  it('allows only one title', () => {
    const found = checkPage('new', [s('page-header', 'a'), s('page-header', 'b'), closing]);
    expect(found.some((p) => p.rule === 'opener' && p.section === 'b')).toBe(true);
  });

  it('ends on a next step', () => {
    expect(rules('new', s('page-header'), s('manifesto'))).toContain('next-step');
  });

  it('counts a section that can end a page, wherever it comes from', () => {
    expect(rules('new', s('page-header'), s('about-teaser'))).toEqual([]);
  });

  it('allows several closing bands, but not several decks', () => {
    expect(rules('new', s('page-header'), s('cta-band', 'a'), s('cta-band', 'b'))).toEqual([]);
    expect(rules('new', s('page-header'), s('deck', 'a'), s('deck', 'b'), closing)).toContain('once');
  });

  it('keeps a bound section on its own page', () => {
    expect(rules('new', s('page-header'), s('gallery'), closing)).toContain('reach');
  });

  it('requires a built-in page’s essential sections', () => {
    expect(rules('photography', s('page-header'), closing)).toContain('required');
    expect(rules('work', s('work-header'), closing)).toContain('required');
  });

  it('rejects two sections with the same id', () => {
    expect(rules('new', s('page-header', 'x'), s('cta-band', 'x'))).toContain('ids');
  });

  it('judges a page by what visitors see, so a hidden section doesn’t count', () => {
    expect(rules('new', s('page-header'), closing, s('manifesto', 'manifesto', true))).toEqual([]);
    expect(rules('new', s('page-header', 'p', true), closing)).toContain('opener');
  });

  it('points at the section to fix', () => {
    const [problem] = checkPage('new', [s('page-header'), s('manifesto', 'statement')]);
    expect(problem.section).toBe('statement');
  });
});
