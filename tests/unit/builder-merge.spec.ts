import { describe, expect, it } from 'vitest';
import { mergeObject, mergePage, same } from '../../src/builder/persist/merge';

/**
 * When main moved under a draft. `base` is where the draft started, `ours` is the
 * draft and `theirs` is main. Nothing may be lost without the editor being told.
 */
type Section = { id: string; type: string } & Record<string, unknown>;

const section = (id: string, type = 'page-header', heading = id): Section => ({ id, type, heading });
const page = (...sections: Section[]) => ({ title: 'A page', sections });
const ids = (doc: { sections: Section[] }) => doc.sections.map(({ id }) => id);
const edited = (item: Section, heading: string) => ({ ...item, heading });

const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => section(id));

describe('same', () => {
  it('ignores key order but not list order', () => {
    expect(same({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(same([1, 2], [2, 1])).toBe(false);
  });

  it('counts a key set to undefined as absent', () => {
    expect(same({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('tells empty values apart', () => {
    expect(same('', null)).toBe(false);
    expect(same([], {})).toBe(false);
    expect(same(0, false)).toBe(false);
    expect(same(null, undefined)).toBe(false);
  });
});

describe('mergePage', () => {
  describe('sections', () => {
    it('takes a section changed on our side', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(edited(a, 'Ours'), b), page(a, b));
      expect(merged.sections[0].heading).toBe('Ours');
      expect(conflicts).toEqual([]);
    });

    it('takes a section changed on their side', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(a, b), page(a, edited(b, 'Theirs')));
      expect(merged.sections[1].heading).toBe('Theirs');
      expect(conflicts).toEqual([]);
    });

    it('takes different sections from each side', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(edited(a, 'Ours'), b), page(a, edited(b, 'Theirs')));
      expect(merged.sections.map(({ heading }) => heading)).toEqual(['Ours', 'Theirs']);
      expect(conflicts).toEqual([]);
    });

    it('calls the same section changed on both sides a conflict, and keeps ours', () => {
      const { merged, conflicts } = mergePage(page(a), page(edited(a, 'Ours')), page(edited(a, 'Theirs')));
      expect(merged.sections[0].heading).toBe('Ours');
      expect(conflicts).toEqual([
        { path: 'sections.a', section: 'a', message: 'The Page header section changed here and somewhere else. Choose which version to keep.' },
      ]);
    });

    it('sees no conflict when both sides made the same change', () => {
      const { merged, conflicts } = mergePage(page(a), page(edited(a, 'Both')), page(edited(a, 'Both')));
      expect(merged.sections[0].heading).toBe('Both');
      expect(conflicts).toEqual([]);
    });

    it('sees no conflict when only the key order differs', () => {
      const flipped = { heading: 'a', type: 'page-header', id: 'a' };
      expect(mergePage(page(a), page(a), page(flipped)).conflicts).toEqual([]);
    });

    it('names a section the way the builder does', () => {
      const custom = section('g', 'grid');
      const { conflicts } = mergePage(page(custom), page(edited(custom, 'O')), page(edited(custom, 'T')));
      expect(conflicts[0].message).toBe('The Custom section changed here and somewhere else. Choose which version to keep.');
    });

    it('doesn’t stumble on a type it doesn’t know', () => {
      const odd = section('x', 'from-the-future');
      const { conflicts } = mergePage(page(odd), page(edited(odd, 'O')), page(edited(odd, 'T')));
      expect(conflicts[0].message).toBe('This section changed here and somewhere else. Choose which version to keep.');
    });
  });

  describe('sections added and removed', () => {
    it('keeps a section we added', () => {
      const { merged, conflicts } = mergePage(page(a), page(a, b), page(a));
      expect(ids(merged)).toEqual(['a', 'b']);
      expect(conflicts).toEqual([]);
    });

    it('takes a section they added, after the one it followed there', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(a, b), page(a, c, b));
      expect(ids(merged)).toEqual(['a', 'c', 'b']);
      expect(conflicts).toEqual([]);
    });

    it('takes a section they added first, at the start', () => {
      expect(ids(mergePage(page(a), page(a), page(c, a)).merged)).toEqual(['c', 'a']);
    });

    it('keeps sections each side added', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(a, c, b), page(a, b, d));
      expect(ids(merged)).toEqual(['a', 'c', 'b', 'd']);
      expect(conflicts).toEqual([]);
    });

    it('accepts the same section added on both sides', () => {
      const { merged, conflicts } = mergePage(page(a), page(a, b), page(a, b));
      expect(ids(merged)).toEqual(['a', 'b']);
      expect(conflicts).toEqual([]);
    });

    it('calls two different sections with one id a conflict', () => {
      const { merged, conflicts } = mergePage(page(a), page(a, edited(b, 'Ours')), page(a, edited(b, 'Theirs')));
      expect(merged.sections[1].heading).toBe('Ours');
      expect(conflicts.map(({ section: id }) => id)).toEqual(['b']);
    });

    it('removes a section we removed', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(a), page(a, b));
      expect(ids(merged)).toEqual(['a']);
      expect(conflicts).toEqual([]);
    });

    it('removes a section they removed', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(a, b), page(a));
      expect(ids(merged)).toEqual(['a']);
      expect(conflicts).toEqual([]);
    });

    it('stays quiet when both removed it', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(a), page(a));
      expect(ids(merged)).toEqual(['a']);
      expect(conflicts).toEqual([]);
    });

    it('says so when we removed what they changed', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(a), page(a, edited(b, 'Theirs')));
      expect(ids(merged)).toEqual(['a']);
      expect(conflicts).toEqual([
        { path: 'sections.b', section: 'b', message: 'You removed the Page header section, but it changed somewhere else. Choose whether to keep it.' },
      ]);
    });

    it('says so when they removed what we changed, and keeps ours', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(a, edited(b, 'Ours')), page(a));
      expect(merged.sections[1].heading).toBe('Ours');
      expect(conflicts[0].message).toBe('The Page header section was removed somewhere else, but you changed it here. Choose whether to keep it.');
    });
  });

  describe('order', () => {
    it('keeps our order when only we changed it', () => {
      expect(ids(mergePage(page(a, b, c), page(c, a, b), page(a, b, c)).merged)).toEqual(['c', 'a', 'b']);
    });

    it('takes their order when only they changed it', () => {
      expect(ids(mergePage(page(a, b, c), page(a, b, c), page(c, b, a)).merged)).toEqual(['c', 'b', 'a']);
    });

    it('keeps our order when both changed it', () => {
      const { merged, conflicts } = mergePage(page(a, b, c), page(b, a, c), page(a, c, b));
      expect(ids(merged)).toEqual(['b', 'a', 'c']);
      expect(conflicts).toEqual([]);
    });

    it('doesn’t count an added section as a change of order', () => {
      expect(ids(mergePage(page(a, b), page(a, c, b), page(b, a)).merged)).toEqual(['b', 'a', 'c']);
    });

    it('doesn’t count a removed section as a change of order', () => {
      expect(ids(mergePage(page(a, b, c), page(a, c), page(c, b, a)).merged)).toEqual(['c', 'a']);
    });

    it('keeps a move and an edit from different sides', () => {
      const { merged, conflicts } = mergePage(page(a, b), page(b, a), page(edited(a, 'Theirs'), b));
      expect(ids(merged)).toEqual(['b', 'a']);
      expect(merged.sections[1].heading).toBe('Theirs');
      expect(conflicts).toEqual([]);
    });
  });

  describe('the page’s own fields', () => {
    it('merges them key by key, beside the sections', () => {
      const base = { title: 'Old', seo: { description: 'Old' }, sections: [a] };
      const ours = { title: 'Ours', seo: { description: 'Old' }, sections: [edited(a, 'Ours')] };
      const theirs = { title: 'Old', seo: { description: 'Theirs' }, sections: [a] };
      const { merged, conflicts } = mergePage(base, ours, theirs);
      expect(merged).toEqual({ title: 'Ours', seo: { description: 'Theirs' }, sections: [edited(a, 'Ours')] });
      expect(conflicts).toEqual([]);
    });

    it('reports a clash in the title', () => {
      const { merged, conflicts } = mergePage({ title: 'Old', sections: [] }, { title: 'Ours', sections: [] }, { title: 'Theirs', sections: [] });
      expect(merged.title).toBe('Ours');
      expect(conflicts).toEqual([{ path: 'title', message: 'The title changed here and somewhere else. Choose which version to keep.' }]);
    });

    it('reports a clash in the search description in plain words', () => {
      const base = { seo: { description: 'Old' }, sections: [] };
      const { conflicts } = mergePage(base, { seo: { description: 'Ours' }, sections: [] }, { seo: { description: 'Theirs' }, sections: [] });
      expect(conflicts).toEqual([{ path: 'seo.description', message: 'The search description changed here and somewhere else. Choose which version to keep.' }]);
    });
  });

  it('merges a page that has no base, as two new pages', () => {
    const { merged, conflicts } = mergePage(null, page(a), page(b));
    expect(ids(merged).sort()).toEqual(['a', 'b']);
    expect(conflicts).toEqual([]);
  });

  it('never changes what it was given', () => {
    const [base, ours, theirs] = [page(a, b), page(edited(a, 'Ours'), b), page(a, c, b)];
    const before = structuredClone([base, ours, theirs]);
    mergePage(base, ours, theirs);
    expect([base, ours, theirs]).toEqual(before);
  });
});

describe('mergeObject', () => {
  it('takes each side’s change, key by key', () => {
    const { merged, conflicts } = mergeObject({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 2 });
    expect(merged).toEqual({ a: 2, b: 2 });
    expect(conflicts).toEqual([]);
  });

  it('reports the same key changed differently, and keeps ours', () => {
    const { merged, conflicts } = mergeObject({ tagline: 'Old' }, { tagline: 'Ours' }, { tagline: 'Theirs' });
    expect(merged).toEqual({ tagline: 'Ours' });
    expect(conflicts).toEqual([{ path: 'tagline', message: 'The tagline changed here and somewhere else. Choose which version to keep.' }]);
  });

  it('sees no conflict in the same change', () => {
    expect(mergeObject({ a: 1 }, { a: 2 }, { a: 2 }).conflicts).toEqual([]);
  });

  it('goes inside groups', () => {
    const base = { cover: { image: 'a.png', alt: 'Old' } };
    const { merged, conflicts } = mergeObject(base, { cover: { image: 'b.png', alt: 'Old' } }, { cover: { image: 'a.png', alt: 'New' } });
    expect(merged).toEqual({ cover: { image: 'b.png', alt: 'New' } });
    expect(conflicts).toEqual([]);
  });

  it('points at the field inside a group, in plain words', () => {
    const base = { cover: { alt: 'Old' } };
    const { conflicts } = mergeObject(base, { cover: { alt: 'Ours' } }, { cover: { alt: 'Theirs' } });
    expect(conflicts).toEqual([{ path: 'cover.alt', message: 'The cover image description changed here and somewhere else. Choose which version to keep.' }]);
  });

  it('spells out a key in two words', () => {
    const { conflicts } = mergeObject({ siteName: 'Old' }, { siteName: 'Ours' }, { siteName: 'Theirs' });
    expect(conflicts[0].message).toBe('The site name changed here and somewhere else. Choose which version to keep.');
  });

  it('keeps keys only one side added, and drops keys one side removed', () => {
    expect(mergeObject({ a: 1, gone: 1 }, { a: 1, ours: 1 }, { a: 1, theirs: 1, gone: 1 }).merged).toEqual({ a: 1, ours: 1, theirs: 1 });
  });

  it('says so when a key was removed on one side and changed on the other', () => {
    const { conflicts } = mergeObject({ client: 'Old' }, {}, { client: 'Theirs' });
    expect(conflicts[0].message).toBe('You removed the client, but it changed somewhere else. Choose whether to keep it.');
  });

  it('treats a plain list as one value', () => {
    const { merged, conflicts } = mergeObject({ tools: ['a'] }, { tools: ['a', 'b'] }, { tools: ['a', 'c'] });
    expect(merged).toEqual({ tools: ['a', 'b'] });
    expect(conflicts.map(({ path }) => path)).toEqual(['tools']);
  });

  it('treats a menu as one value, as a list has no ids', () => {
    const nav = [{ label: 'Work', href: '/projects/' }];
    const { conflicts } = mergeObject({ nav }, { nav: [{ label: 'Ours', href: '/projects/' }] }, { nav: [{ label: 'Theirs', href: '/projects/' }] });
    expect(conflicts.map(({ path }) => path)).toEqual(['nav']);
  });

  it('leaves the deep values of the documents alone', () => {
    const base = { a: { b: 1 } };
    const ours = { a: { b: 2 } };
    mergeObject(base, ours, { a: { b: 1, c: 3 } });
    expect(ours).toEqual({ a: { b: 2 } });
  });

  describe('a project’s blocks', () => {
    const block = (body: string) => ({ type: 'text', body });
    const project = (...blocks: unknown[]) => ({ title: 'A', blocks });

    it('takes each side’s block, matched by index', () => {
      const { merged, conflicts } = mergeObject(
        project(block('one'), block('two')),
        project(block('ours'), block('two')),
        project(block('one'), block('theirs'))
      );
      expect(merged.blocks).toEqual([block('ours'), block('theirs')]);
      expect(conflicts).toEqual([]);
    });

    it('reports one block changed on both sides, and only that block', () => {
      const { merged, conflicts } = mergeObject(
        project(block('one'), block('two')),
        project(block('ours'), block('two')),
        project(block('theirs'), block('new'))
      );
      expect(merged.blocks).toEqual([block('ours'), block('new')]);
      expect(conflicts).toEqual([{ path: 'blocks.0', message: 'Block 1 changed here and somewhere else. Choose which version to keep.' }]);
    });

    it('doesn’t mix two versions of one block', () => {
      const base = project({ type: 'text', heading: 'Old', body: 'Old' });
      const ours = project({ type: 'text', heading: 'Ours', body: 'Old' });
      const theirs = project({ type: 'text', heading: 'Old', body: 'Theirs' });
      expect(mergeObject(base, ours, theirs).conflicts.map(({ path }) => path)).toEqual(['blocks.0']);
    });

    it('takes the whole list from the one side that changed its length', () => {
      const { merged, conflicts } = mergeObject(project(block('one')), project(block('one'), block('two')), project(block('one')));
      expect(merged.blocks).toEqual([block('one'), block('two')]);
      expect(conflicts).toEqual([]);
    });

    it('reports the whole list when lengths differ and both sides changed it', () => {
      const { merged, conflicts } = mergeObject(project(block('one')), project(block('one'), block('two')), project(block('theirs')));
      expect(merged.blocks).toEqual([block('one'), block('two')]);
      expect(conflicts).toEqual([{ path: 'blocks', message: 'The blocks changed here and somewhere else. Choose which version to keep.' }]);
    });

    it('only does this for a project’s own blocks', () => {
      const nested = (body: string) => ({ group: { blocks: [block(body)] } });
      const { conflicts } = mergeObject(nested('old'), nested('ours'), nested('theirs'));
      expect(conflicts.map(({ path }) => path)).toEqual(['group.blocks']);
    });
  });
});

describe('every message', () => {
  it('avoids the words only a developer would use', () => {
    const results = [
      mergePage(page(a), page(edited(a, 'O')), page(edited(a, 'T'))),
      mergePage(page(a), page(), page(edited(a, 'T'))),
      mergePage(page(a), page(edited(a, 'O')), page()),
      mergeObject({ a: 1 }, { a: 2 }, { a: 3 }),
    ];
    for (const { conflicts } of results) {
      for (const { message } of conflicts) expect(message).not.toMatch(/\b(?:merge|commit|conflict|branch|yaml|undefined|null|ref)\b/i);
    }
  });
});
