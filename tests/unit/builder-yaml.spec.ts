import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse, parseDocument } from 'yaml';
import { describe, expect, it } from 'vitest';
import { newYaml, patchYaml, YAML_OPTIONS } from '../../src/builder/yaml';

/**
 * The builder writes to the same files Sveltia does. Whatever it leaves alone has
 * to stay byte for byte, or every save would churn files the editor never touched.
 */
const ROOT = join(__dirname, '..', '..');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

const contentFiles = walk(join(ROOT, 'src', 'content'))
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => relative(ROOT, file).split(sep).join('/'));

// Git holds these with LF, which is what the builder reads from GitHub. A Windows
// working copy has CRLF, so both are tested.
const onDisk = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const inGit = (file: string) => onDisk(file).replaceAll('\r\n', '\n');

type Doc = Record<string, unknown>;
type Key = string | number;

/** The deepest one-line string in a document, and where it is. */
function lastLine(value: unknown, at: Key[] = []): Key[] | undefined {
  if (typeof value === 'string') return value.includes('\n') ? undefined : at;
  if (typeof value !== 'object' || value === null) return undefined;
  const keys: Key[] = Array.isArray(value) ? [...value.keys()] : Object.keys(value);
  for (const key of keys.reverse()) {
    const found = lastLine((value as Record<Key, unknown>)[key], [...at, key]);
    if (found) return found;
  }
  return undefined;
}

function set(doc: unknown, path: Key[], value: unknown) {
  const owner = path.slice(0, -1).reduce<unknown>((item, key) => (item as Record<Key, unknown>)[key], doc);
  (owner as Record<Key, unknown>)[path.at(-1)!] = value;
}

const differingLines = (a: string, b: string) => {
  const [before, after] = [a.split('\n'), b.split('\n')];
  expect(after.length).toBe(before.length);
  return before.flatMap((line, i) => (line === after[i] ? [] : [i]));
};

describe('every real content file', () => {
  it('finds them all', () => {
    expect(contentFiles.length).toBeGreaterThanOrEqual(79);
  });

  it.each(contentFiles)('%s: a no-op patch changes nothing', (file) => {
    expect(patchYaml(inGit(file), parse(inGit(file)))).toBe(inGit(file));
    expect(patchYaml(onDisk(file), parse(onDisk(file)))).toBe(onDisk(file));
  });

  // A no-op returns early, so this is what proves the writer itself leaves a file alone.
  it.each(contentFiles)('%s: comes back byte for byte through the writer', (file) => {
    expect(parseDocument(inGit(file)).toString(YAML_OPTIONS)).toBe(inGit(file));
  });

  it.each(contentFiles)('%s: changing one value moves one line', (file) => {
    const doc = parse(inGit(file));
    const path = lastLine(doc);
    expect(path).toBeDefined();
    set(doc, path!, 'Changed by a spec');

    const patched = patchYaml(inGit(file), doc);
    expect(differingLines(inGit(file), patched)).toHaveLength(1);
    expect(parse(patched)).toEqual(doc);
  });

  it.each(contentFiles)('%s: adding a key adds one line', (file) => {
    const doc = parse(inGit(file)) as Doc;
    expect(patchYaml(inGit(file), { ...doc, addedBySpec: 'Yes it was' })).toBe(`${inGit(file)}addedBySpec: Yes it was\n`);
  });

  it.each(contentFiles)('%s: removing the last key leaves what came before it', (file) => {
    const doc = parse(inGit(file)) as Doc;
    const keys = Object.keys(doc);
    const last = keys.at(-1)!;
    const rest = Object.fromEntries(Object.entries(doc).filter(([key]) => key !== last));
    const start = inGit(file).split(new RegExp(`^${last}:`, 'm'))[0];
    expect(patchYaml(inGit(file), rest)).toBe(start);
  });

  it.each(contentFiles)('%s: keeps CRLF when it finds CRLF', (file) => {
    const crlf = inGit(file).replaceAll('\n', '\r\n');
    const patched = patchYaml(crlf, { ...(parse(crlf) as Doc), addedBySpec: 'A value' });
    expect(patched).toBe(`${crlf}addedBySpec: A value\r\n`);
  });

  it.each(contentFiles)('%s: rewritten from scratch, says the same thing', (file) => {
    const doc = parse(inGit(file)) as Doc;
    const written = parse(newYaml(doc)) as Doc;
    // Empty values are left out, as Sveltia leaves them out.
    const withoutEmpties = JSON.parse(JSON.stringify(doc, (_key, value) => (Array.isArray(value) && !value.length ? undefined : value)));
    expect(JSON.parse(JSON.stringify(written))).toEqual(withoutEmpties);
  });
});

describe('patchYaml', () => {
  describe('what it leaves alone', () => {
    const text = [
      '# Above everything',
      'title: Old # beside the value',
      '',
      '# Above seo',
      'seo:',
      '  description: "Double quoted"',
      "  note: 'Single quoted'",
      'sections:',
      '  # Above the first section',
      '  - id: one',
      '    heading: First',
      '',
      '  - id: two # beside the id',
      '    heading: Second',
      '',
    ].join('\n');

    it('keeps comments, blank lines and quotes around a change', () => {
      const doc = parse(text);
      doc.title = 'New';
      const lines = patchYaml(text, doc).split('\n');
      expect(lines[1]).toBe('title: New # beside the value');
      expect(lines.filter((_, i) => i !== 1)).toEqual(text.split('\n').filter((_, i) => i !== 1));
    });

    it('keeps a value’s quotes when it changes', () => {
      const doc = parse(text);
      doc.seo.description = 'Still double';
      doc.seo.note = 'Still single';
      const patched = patchYaml(text, doc);
      expect(patched).toContain('description: "Still double"');
      expect(patched).toContain("note: 'Still single'");
    });

    it('keeps a section’s comments when the sections swap places', () => {
      const doc = parse(text);
      doc.sections.reverse();
      const patched = patchYaml(text, doc);
      expect(patched.indexOf('id: two')).toBeLessThan(patched.indexOf('id: one'));
      expect(patched).toContain('- id: two # beside the id');
      expect(patched).toContain('# Above the first section');
      expect(parse(patched)).toEqual(doc);
    });

    it('finds a section that moved and changed by its id', () => {
      const doc = parse(text);
      doc.sections.reverse();
      doc.sections[0].heading = 'Second, moved up';
      const patched = patchYaml(text, doc);
      expect(patched).toContain('- id: two # beside the id');
      expect(parse(patched)).toEqual(doc);
    });

    it('keeps a blank line and a comment above a list item that changes', () => {
      const list = 'fortunes:\n  - One\n\n  # About two\n  - Two\n';
      expect(patchYaml(list, { fortunes: ['One', 'Changed'] })).toBe('fortunes:\n  - One\n\n  # About two\n  - Changed\n');
    });

    it('keeps the rest of a list when one item goes', () => {
      const doc = parse(text);
      doc.sections.shift();
      const patched = patchYaml(text, doc);
      expect(patched).toContain('- id: two # beside the id');
      expect(patched).not.toContain('id: one');
    });

    it('doesn’t care what order the document’s keys are in', () => {
      const { sections, seo, title } = parse(text);
      expect(patchYaml(text, { sections, seo, title })).toBe(text);
    });

    it('returns a file with its own style when nothing changed, even a style the writer wouldn’t choose', () => {
      const odd = 'key:     value\nlist:\n- a\n- b\nmap: { a: 1 }\n';
      expect(patchYaml(odd, parse(odd))).toBe(odd);
    });
  });

  describe('empty values', () => {
    it.each([[''], [null], [undefined], [[]], [{}]])('removes a key that became %j', (empty) => {
      expect(patchYaml('title: A\nnote: Old\n', { title: 'A', note: empty })).toBe('title: A\n');
    });

    it('removes a key that is gone from the document', () => {
      expect(patchYaml('title: A\nnote: Old\n', { title: 'A' })).toBe('title: A\n');
    });

    it('doesn’t add an empty key', () => {
      expect(patchYaml('title: A\n', { title: 'B', note: '', tags: [], seo: {}, gone: null })).toBe('title: B\n');
    });

    it('removes a group whose fields all became empty', () => {
      expect(patchYaml('title: A\nseo:\n  description: Old\n', { title: 'A', seo: { description: '' } })).toBe('title: A\n');
    });

    it('doesn’t add a group of empty fields', () => {
      expect(patchYaml('title: A\n', { title: 'B', seo: { description: '' } })).toBe('title: B\n');
    });

    it('removes empty fields from a new item, as it does from a key', () => {
      const out = patchYaml('sections:\n  - id: one\n', { sections: [{ id: 'one' }, { id: 'two', intro: '', tags: [] }] });
      expect(parse(out)).toEqual({ sections: [{ id: 'one' }, { id: 'two' }] });
    });

    it('keeps false and 0, which are values', () => {
      const out = parse(patchYaml('title: A\n', { title: 'A', hidden: false, order: 0 }));
      expect(out).toEqual({ title: 'A', hidden: false, order: 0 });
    });

    it('leaves an empty list that was already there, as the real files have', () => {
      const text = 'title: A\ntools: []\n';
      expect(patchYaml(text, { title: 'B', tools: [] })).toBe('title: B\ntools: []\n');
    });

    it('writes a list into an empty one in block style', () => {
      expect(patchYaml('title: A\ntools: []\n', { title: 'A', tools: ['figma', 'xd'] })).toBe('title: A\ntools:\n  - figma\n  - xd\n');
    });

    it('writes keys into an empty map in block style', () => {
      expect(patchYaml('title: A\nseo: {}\n', { title: 'A', seo: { description: 'B' } })).toBe('title: A\nseo:\n  description: B\n');
    });
  });

  describe('new keys', () => {
    const order = ['title', 'summary', 'year', 'client', 'tools'];

    it('go after the nearest key before them in the config', () => {
      expect(patchYaml('title: A\nyear: 2025\ntools: []\n', { title: 'A', year: 2025, tools: [], client: 'B' }, order)).toBe(
        'title: A\nyear: 2025\nclient: B\ntools: []\n'
      );
    });

    it('go before the nearest key after them, when none comes before', () => {
      expect(patchYaml('year: 2025\n', { title: 'A', year: 2025 }, order)).toBe('title: A\nyear: 2025\n');
    });

    it('skip over keys the file doesn’t have', () => {
      expect(patchYaml('title: A\ntools: []\n', { title: 'A', tools: [], year: 2025 }, order)).toBe('title: A\nyear: 2025\ntools: []\n');
    });

    it('never move a key the file already has', () => {
      expect(patchYaml('year: 2025\ntitle: A\n', { title: 'A', year: 2025, summary: 'B' }, order)).toBe('year: 2025\ntitle: A\nsummary: B\n');
    });

    it('follow the document’s own order for a key the config doesn’t list', () => {
      expect(patchYaml('title: A\nyear: 2025\n', { title: 'A', extra: 'B', year: 2025 }, order)).toBe('title: A\nextra: B\nyear: 2025\n');
    });

    it('follow the document’s own order without a config', () => {
      expect(patchYaml('a: 1\nc: 3\n', { a: 1, b: 2, c: 3 })).toBe('a: 1\nb: 2\nc: 3\n');
    });

    it('take the config’s order inside a group too', () => {
      const text = 'cover:\n  image: a.png\n  fit: cover\n';
      const out = patchYaml(text, { cover: { image: 'a.png', fit: 'cover', alt: 'B' } }, ['image', 'alt', 'fit']);
      expect(out).toBe('cover:\n  image: a.png\n  alt: B\n  fit: cover\n');
    });
  });

  describe('values', () => {
    it('quotes what a YAML 1.1 reader would misread, as Sveltia does', () => {
      const out = patchYaml('title: A\n', { title: 'no', a: 'yes', b: 'off', c: '1.5', d: '1:20', e: '0755', f: 'plain' });
      expect(out).toBe("title: 'no'\na: 'yes'\nb: 'off'\nc: '1.5'\nd: '1:20'\ne: '0755'\nf: plain\n");
      expect(parse(out)).toMatchObject({ title: 'no', c: '1.5', e: '0755' });
    });

    it('quotes what YAML itself would misread', () => {
      const value = { a: 'Key: value', b: '# not a comment', c: '- not a list', d: 'null', e: 'true' };
      expect(parse(patchYaml('title: A\n', { title: 'A', ...value }))).toEqual({ title: 'A', ...value });
    });

    it('writes several lines as a block', () => {
      expect(patchYaml('body: One\n', { body: 'One\n\nTwo' })).toBe('body: |-\n  One\n\n  Two\n');
    });

    it('drops the quotes when a value becomes several lines', () => {
      expect(patchYaml('body: "One"\n', { body: 'One\nTwo' })).toBe('body: |-\n  One\n  Two\n');
    });

    it('keeps a block a block', () => {
      expect(patchYaml('body: |\n  One\n  Two\n', { body: 'One\nThree\n' })).toBe('body: |\n  One\n  Three\n');
    });

    it('never folds a long line', () => {
      const long = 'word '.repeat(100).trim();
      expect(patchYaml('title: A\n', { title: long })).toBe(`title: ${long}\n`);
    });

    it('keeps letters beyond ASCII as they are', () => {
      expect(patchYaml('title: A\n', { title: 'Hi, I’m Patricia — ș ț ă' })).toBe('title: Hi, I’m Patricia — ș ț ă\n');
    });

    it('turns a value into a list or a group, and back', () => {
      expect(parse(patchYaml('a: 1\nb: 2\n', { a: [1, 2], b: { c: 3 } }))).toEqual({ a: [1, 2], b: { c: 3 } });
      expect(parse(patchYaml('a:\n  - 1\nb:\n  c: 3\n', { a: 'one', b: 2 }))).toEqual({ a: 'one', b: 2 });
    });

    it('changes numbers and booleans', () => {
      expect(patchYaml('year: 2025\nhidden: false\n', { year: 2026, hidden: true })).toBe('year: 2026\nhidden: true\n');
    });

    it('patches inside a list of lists', () => {
      const doc = { grid: [[1, 2], [3]] };
      expect(parse(patchYaml('grid:\n  - [1]\n  - [3]\n', doc))).toEqual(doc);
    });

    it('never writes an alias for an object used twice', () => {
      const shared = { label: 'A', link: '/a/' };
      const out = patchYaml('title: A\n', { title: 'A', first: shared, second: shared });
      expect(out).not.toMatch(/[&*]/);
      expect(parse(out)).toMatchObject({ first: shared, second: shared });
    });
  });

  describe('a file it can’t read', () => {
    it('says so plainly, and writes nothing', () => {
      expect(() => patchYaml('title: "unclosed\n', { title: 'A' })).toThrow('This file is damaged, so the builder can’t change it. Ask Paul to take a look.');
    });

    it('starts afresh from an empty file', () => {
      expect(patchYaml('', { title: 'A' })).toBe('title: A\n');
    });
  });
});

describe('newYaml', () => {
  it('writes a page the way Sveltia would', () => {
    const page = {
      title: 'A page',
      seo: { description: 'Short, with a colon: here' },
      sections: [{ id: 'one', type: 'page-header', heading: 'Yes', hidden: false, order: 0 }],
    };
    expect(newYaml(page)).toBe(
      [
        'title: A page',
        'seo:',
        "  description: 'Short, with a colon: here'",
        'sections:',
        '  - id: one',
        '    type: page-header',
        "    heading: 'Yes'",
        '    hidden: false',
        '    order: 0',
        '',
      ].join('\n')
    );
  });

  it('leaves out what’s empty', () => {
    expect(newYaml({ title: 'A', note: '', tags: [], seo: {}, group: { inner: '' }, gone: null })).toBe('title: A\n');
  });

  it('quotes what a YAML 1.1 reader would misread', () => {
    expect(newYaml({ answer: 'no' })).toBe("answer: 'no'\n");
  });

  it('never writes an alias for an object used twice', () => {
    const shared = { a: 1 };
    expect(newYaml({ one: shared, two: shared })).toBe('one:\n  a: 1\ntwo:\n  a: 1\n');
  });
});
