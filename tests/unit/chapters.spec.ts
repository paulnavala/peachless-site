import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { GUIDELINES_HEADING, headingOf, RESERVED_IDS, slugify, storyChapters, TOC_MIN_CHAPTERS } from '../../src/lib/chapters';

describe('story chapters', () => {
  it('turns headings into readable anchors', () => {
    expect(slugify('What I’d do differently')).toBe('what-id-do-differently');
    expect(slugify('Fish & Seafood')).toBe('fish-and-seafood');
    expect(slugify('Brașov')).toBe('brasov');
    expect(slugify('  The app  ')).toBe('the-app');
    expect(slugify('   ')).toBe('');
  });

  it('numbers only blocks with a heading; brand guidelines always have one', () => {
    expect(headingOf({ type: 'text', heading: 'The idea' })).toBe('The idea');
    expect(headingOf({ type: 'text' })).toBeUndefined();
    expect(headingOf({ type: 'quote' })).toBeUndefined();
    expect(headingOf({ type: 'image' })).toBeUndefined();
    expect(headingOf({ type: 'guidelines' })).toBe(GUIDELINES_HEADING);
  });

  it('never repeats an id or takes one the page already uses', () => {
    const chapters = storyChapters([
      { type: 'text', heading: 'The idea' },
      { type: 'text', heading: 'The idea' },
      { type: 'text', heading: 'Main' },
      { type: 'text', heading: 'Top' },
      { type: 'text', heading: '!!!' },
      { type: 'quote' },
    ]);
    expect(chapters.map((c) => c.id)).toEqual(['the-idea', 'the-idea-2', 'main-2', 'top-2', 'chapter-5']);
    expect(chapters.map((c) => c.block)).toEqual([0, 1, 2, 3, 4]);
    for (const c of chapters) expect(RESERVED_IDS.has(c.id)).toBe(false);
  });

  it('gives TON its chapters and a table of contents', () => {
    const ton = parse(readFileSync(join(__dirname, '..', '..', 'src', 'content', 'projects', 'ton', 'index.yaml'), 'utf8'));
    const chapters = storyChapters(ton.blocks);
    expect(chapters.length).toBeGreaterThanOrEqual(TOC_MIN_CHAPTERS);
    expect(new Set(chapters.map((c) => c.id)).size).toBe(chapters.length);
  });
});
