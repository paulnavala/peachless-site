import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ID_RE, RESERVED_PAGE_IDS, SECTION_TYPES } from '../../src/lib/content-schema';
import { pagesFromSingletons } from '../../src/lib/page-adapter';
import { PAGE_IDS } from '../../src/lib/section-catalogue';
import { SAMPLES } from '../../src/lib/section-samples';
import { pageIdProblem, validatePage } from '../../src/builder/validate';

/**
 * Nothing stands between an editor and production but these checks, so they have
 * to catch what the build would refuse, in words that make sense to a designer.
 */
const ROOT = join(__dirname, '..', '..');
const PAGES = join(ROOT, 'src', 'content', 'pages');

const noImages = new Set<string>();
const messages = (check: { problems: { message: string }[] }) => check.problems.map(({ message }) => message);

const header = (rest = {}) => ({ id: 'header', type: 'page-header', heading: 'A page', ...rest });
const closing = { id: 'closing', type: 'cta-band', heading: 'Next', links: [{ label: 'Home', link: '/' }] };
const page = (...sections: unknown[]) => ({ title: 'A page', sections: [header(), ...sections, closing] });

const imageElement = (rest = {}) => ({ id: 'picture', type: 'image', col: 1, row: 1, w: 6, h: 4, image: 'hero.jpg', alt: 'A peach', ...rest });
const grid = (...elements: unknown[]) => ({ id: 'grid', type: 'grid', elements });
const withImage = (rest = {}) => page(grid(imageElement(rest)));

describe('a good page', () => {
  it('passes', () => {
    expect(validatePage('a-page', page(), noImages)).toEqual({ ok: true, problems: [] });
  });

  describe('the site’s own pages', () => {
    const yaml = (file: string) => parse(readFileSync(join(PAGES, file), 'utf8'));
    const [, front, ...body] = readFileSync(join(PAGES, 'about.md'), 'utf8').replaceAll('\r\n', '\n').split(/^---$/m);
    const pages = pagesFromSingletons({
      home: yaml('home.yaml'),
      work: yaml('work.yaml'),
      about: parse(front),
      aboutBody: body.join('---').trim(),
      contact: yaml('contact.yaml'),
      photography: yaml('photography.yaml'),
    });

    it.each(PAGE_IDS)('%s passes', (id) => {
      expect(validatePage(id, JSON.parse(JSON.stringify(pages[id])), noImages)).toEqual({ ok: true, problems: [] });
    });
  });
});

describe('images', () => {
  const beside = new Set(['src/content/pages/a-page/hero.jpg']);

  it('passes when the image sits beside the page', () => {
    expect(validatePage('a-page', withImage(), beside).ok).toBe(true);
  });

  it('accepts a leading ./', () => {
    expect(validatePage('a-page', withImage({ image: './hero.jpg' }), beside).ok).toBe(true);
  });

  it('follows ../ to a shared folder', () => {
    const shared = new Set(['src/content/pages/images/portrait.jpg']);
    expect(validatePage('a-page', withImage({ image: '../images/portrait.jpg' }), shared).ok).toBe(true);
  });

  it('says so when the file isn’t there, and points at the element', () => {
    expect(validatePage('a-page', withImage(), noImages)).toEqual({
      ok: false,
      problems: [{ message: 'This image can’t be found. Choose it again, or pick another.', section: 'grid', element: 'picture' }],
    });
  });

  it('checks the page’s own folder, not another page’s', () => {
    expect(validatePage('another', withImage(), beside).ok).toBe(false);
  });

  it('checks hidden sections too: the build reads them', () => {
    const hidden = { ...grid(imageElement()), hidden: true };
    expect(validatePage('a-page', page(hidden), noImages).ok).toBe(false);
  });

  it('doesn’t take a web address or an absolute path for a file beside the page', () => {
    const beside = new Set(['src/content/pages/a-page/x.png']);
    expect(validatePage('a-page', withImage({ image: 'x.png' }), beside).ok).toBe(true);
    expect(validatePage('a-page', withImage({ image: '/x.png' }), beside).ok).toBe(false);
    expect(validatePage('a-page', withImage({ image: 'https://example.com/x.png' }), beside).ok).toBe(false);
  });

  it('asks for an image that was never chosen', () => {
    const { image: _image, ...empty } = imageElement();
    expect(messages(validatePage('a-page', page(grid(empty)), noImages))).toEqual(['Choose an image.']);
  });
});

describe('what the schema refuses', () => {
  it('asks for an image description in plain words', () => {
    const check = validatePage('a-page', withImage({ alt: '' }), new Set(['src/content/pages/a-page/hero.jpg']));
    expect(check.problems).toEqual([{ message: 'Add a description of this image for people who can’t see it.', section: 'grid', element: 'picture' }]);
  });

  it('asks the same when the description is missing or only spaces', () => {
    const images = new Set(['src/content/pages/a-page/hero.jpg']);
    const { alt: _alt, ...without } = imageElement();
    for (const raw of [page(grid(without)), withImage({ alt: '   ' })]) {
      expect(messages(validatePage('a-page', raw, images))).toEqual(['Add a description of this image for people who can’t see it.']);
    }
  });

  it('asks for a page title', () => {
    expect(messages(validatePage('a-page', { ...page(), title: '' }, noImages))).toEqual(['Give this page a title.']);
    const { title: _title, ...untitled } = page();
    expect(messages(validatePage('a-page', untitled, noImages))).toEqual(['Give this page a title.']);
  });

  it('names a field the way the inspector does', () => {
    const check = validatePage('a-page', { title: 'A', sections: [header({ heading: '' }), closing] }, noImages);
    expect(check.problems).toEqual([{ message: 'Fill in “Page title”.', section: 'header' }]);
  });

  it('takes limits from the schema', () => {
    const long = 'x'.repeat(81);
    expect(messages(validatePage('a-page', { title: 'A', sections: [header({ heading: long }), closing] }, noImages))).toEqual([
      '“Page title” is too long. Keep it to 80 characters.',
    ]);
    expect(messages(validatePage('a-page', { ...page(), title: 'x'.repeat(61) }, noImages))).toEqual(['“Page title” is too long. Keep it to 60 characters.']);
    expect(messages(validatePage('a-page', { ...page(), seo: { description: 'x'.repeat(161) } }, noImages))).toEqual([
      '“Search description” is too long. Keep it to 160 characters.',
    ]);
  });

  it('explains what a link has to look like', () => {
    const check = validatePage('a-page', page(grid({ id: 'go', type: 'button', col: 1, row: 1, w: 3, h: 1, label: 'Go', link: 'peachless.design' })), noImages);
    expect(check.problems).toEqual([{ message: '“Button link” has to start with /, https:// or mailto:.', section: 'grid', element: 'go' }]);
  });

  it('counts a list item from one, the way a person does', () => {
    const links = [
      { label: 'Home', link: '/' },
      { label: '', link: '/about/' },
    ];
    expect(messages(validatePage('a-page', { title: 'A', sections: [header(), { ...closing, links }] }, noImages))).toEqual(['Fill in “Links 2: Text”.']);
  });

  it('says how many a list can hold', () => {
    const links = Array.from({ length: 4 }, () => ({ label: 'Home', link: '/' }));
    expect(messages(validatePage('a-page', { title: 'A', sections: [header(), { ...closing, links }] }, noImages))).toEqual(['“Links” can hold 3 at most. Remove some.']);
  });

  it('says how many a list needs', () => {
    const fortune = { id: 'fortune', type: 'fortune', heading: 'A', fortunes: ['One'] };
    const check = validatePage('contact', { title: 'A', sections: [fortune] }, noImages);
    expect(messages(check)).toContain('“Fortunes” needs at least 3.');
  });

  it('asks for at least one section', () => {
    expect(messages(validatePage('a-page', { title: 'A', sections: [] }, noImages))).toContain('Add at least one section to this page.');
  });

  it('turns a bad placement into one thing to do', () => {
    const check = validatePage('a-page', page(grid({ id: 'h', type: 'heading', col: 13, row: 1, w: 3, h: 1, text: 'Hi' })), noImages);
    expect(messages(check)).toContain('This element is off the grid. Drag it back into place.');
  });

  it('says so about a choice the site doesn’t offer', () => {
    expect(messages(validatePage('a-page', page({ ...grid(), surface: 'pink' }), noImages))).toContain('Choose one of the options for “Surface”.');
  });

  it('won’t name a section it can’t identify', () => {
    const check = validatePage('a-page', { title: 'A', sections: [{ type: 'page-header', heading: 'A' }, closing] }, noImages);
    expect(check.problems[0]).toEqual({ message: 'This section’s name can only use lowercase letters, numbers and dashes.' });
  });

  it('says a section with a bad id can only use certain letters', () => {
    expect(messages(validatePage('a-page', page({ ...grid(), id: 'Not ok' }), noImages))).toEqual(['This section’s name can only use lowercase letters, numbers and dashes.']);
  });

  it('says so about a section it doesn’t know', () => {
    const check = validatePage('a-page', page({ id: 'odd', type: 'from-the-future' }), noImages);
    expect(check.problems).toEqual([{ message: 'This section isn’t one the site knows. Remove it.', section: 'odd' }]);
  });

  it('says so about an element it doesn’t know', () => {
    const check = validatePage('a-page', page(grid({ id: 'odd', type: 'hologram', col: 1, row: 1, w: 2, h: 2 })), noImages);
    expect(check.problems).toEqual([{ message: 'This element isn’t one the site knows. Remove it.', section: 'grid', element: 'odd' }]);
  });

  it('copes with a section that is nothing at all', () => {
    expect(messages(validatePage('a-page', page(null), noImages))).toEqual(['This section can’t be read. Remove it and add it again.']);
  });

  it('copes with a file that isn’t a page', () => {
    for (const raw of ['nope', null, 7, []]) {
      expect(validatePage('a-page', raw, noImages)).toEqual({ ok: false, problems: [{ message: 'This page’s file can’t be read. Ask Paul to take a look.' }] });
    }
  });

  it('copes with a list that isn’t one', () => {
    expect(messages(validatePage('a-page', { title: 'A', sections: 'none' }, noImages))).toEqual(['“Sections” isn’t the right kind of value. Set it again.']);
  });
});

describe('page rules', () => {
  it('come through with the section to select', () => {
    const check = validatePage('a-page', { title: 'A', sections: [closing, header()] }, noImages);
    expect(check.ok).toBe(false);
    expect(check.problems).toContainEqual({ message: 'Page header holds the page title, so it has to come first.', section: 'header' });
  });

  it('come through without a section when the whole page is at fault', () => {
    const check = validatePage('a-page', { title: 'A', sections: [closing] }, noImages);
    expect(check.problems).toContainEqual({ message: 'This page has no title. Add a page opener, such as a Page header.' });
  });

  it('catch elements a schema can’t see', () => {
    const one = { id: 'one', type: 'heading', col: 1, row: 1, w: 6, h: 2, text: 'One' };
    const two = { id: 'two', type: 'heading', col: 3, row: 1, w: 6, h: 2, text: 'Two' };
    expect(validatePage('a-page', page(grid(one, two)), noImages).problems).toEqual([
      { message: 'Two elements overlap. Move one so each has its own space.', section: 'grid' },
    ]);
  });

  it('run beside the schema’s problems, so an editor sees them all at once', () => {
    const check = validatePage('a-page', { title: '', sections: [closing, header()] }, noImages);
    expect(messages(check)).toEqual(expect.arrayContaining(['Give this page a title.', 'Page header holds the page title, so it has to come first.']));
  });

  it('skip what they can’t read rather than fall over', () => {
    const check = validatePage('a-page', page({ id: 'odd', type: 'from-the-future' }, null, 'text', { type: 'grid', elements: [null, 'x'] }), noImages);
    expect(check.ok).toBe(false);
  });

  it('know a section that only works elsewhere', () => {
    const hero = { id: 'hero', ...SAMPLES.hero };
    expect(messages(validatePage('a-page', { title: 'A', sections: [hero, closing] }, noImages))).toContain('Hero only works on the home page.');
  });
});

describe('a page’s address', () => {
  it('has to be lowercase letters, numbers and dashes', () => {
    for (const id of ['Upper', 'with space', 'trailing-', '-leading', 'two--dashes', 'ș', '']) {
      expect(ID_RE.test(id)).toBe(false);
      expect(messages(validatePage(id, page(), noImages))).toContain('A page’s address can only use lowercase letters, numbers and dashes.');
    }
  });

  it.each(RESERVED_PAGE_IDS)('can’t be %s, which the site keeps for itself', (id) => {
    expect(messages(validatePage(id, page(), noImages))).toContain(`“${id}” is kept for the site’s own use. Choose another address.`);
    expect(pageIdProblem(id, { isNew: true })).toBe(`“${id}” is kept for the site’s own use. Choose another address.`);
  });

  it.each(PAGE_IDS)('can’t be %s on a new page', (id) => {
    expect(pageIdProblem(id, { isNew: true })).toBe(`There’s already a page called “${id}”. Choose another address.`);
    expect(messages(validatePage(id, page(), noImages, { isNew: true }))).toContain(`There’s already a page called “${id}”. Choose another address.`);
  });

  it.each(PAGE_IDS)('can be %s on the page that already has it', (id) => {
    expect(pageIdProblem(id)).toBeNull();
    expect(messages(validatePage(id, page(), noImages))).not.toContain(`There’s already a page called “${id}”. Choose another address.`);
  });

  it('is fine for an ordinary new page', () => {
    expect(pageIdProblem('my-new-page', { isNew: true })).toBeNull();
    expect(validatePage('my-new-page', page(), noImages, { isNew: true }).ok).toBe(true);
  });
});

describe('every message', () => {
  const DEVELOPER_WORDS = /undefined|null\b|expected|invalid|required at|sections\.\d|elements\.\d|\[\d|zod|schema|string|regex|array|object/i;

  const blanks = (doc: Record<string, unknown>, at: string[] = []): string[][] =>
    Object.entries(doc).flatMap(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) return blanks(value as Record<string, unknown>, [...at, key]);
      return [[...at, key]];
    });

  function without(doc: Record<string, unknown>, path: string[], value: unknown) {
    const copy = structuredClone(doc);
    const owner = path.slice(0, -1).reduce<Record<string, unknown>>((item, key) => item[key] as Record<string, unknown>, copy);
    owner[path.at(-1)!] = value;
    return copy;
  }

  const cases = SECTION_TYPES.flatMap((type) =>
    blanks(SAMPLES[type] as Record<string, unknown>)
      .filter((path) => path.at(-1) !== 'type')
      .map((path) => [type, path.join('.')] as const)
  );

  it.each(cases)('%s: broken %s stays in plain words', (type, dotted) => {
    const path = dotted.split('.');
    const sample = { id: 'sample', ...SAMPLES[type] } as Record<string, unknown>;
    for (const value of ['', 'x'.repeat(2000), 42, null]) {
      const raw = { title: 'A', sections: [without(sample, path, value)] };
      for (const message of messages(validatePage('a-page', raw, noImages))) {
        expect(message).not.toMatch(DEVELOPER_WORDS);
        expect(message).toMatch(/[.!]$/);
      }
    }
  });
});

describe('the browser', () => {
  /** Everything validate.ts pulls in, following relative imports. */
  function reach(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(/^(?:import|export)(?!\s+type\b)[^'"]*['"]([^'"]+)['"]/gm)) {
      if (specifier.startsWith('.')) reach(resolve(dirname(file), `${specifier}.ts`), seen);
      else seen.add(specifier);
    }
    return seen;
  }

  it('gets a validator with no Astro virtual modules and nothing from Node', () => {
    const reached = [...reach(join(ROOT, 'src', 'builder', 'validate.ts'))];
    expect(reached).toContain('astro/zod');
    expect(reached.filter((item) => /^(?:astro:|node:)/.test(item))).toEqual([]);
  });
});
