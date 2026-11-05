import { describe, expect, it } from 'vitest';
import { compareProjects, featured, isPublished, nextProject, published, reelPicks, sortProjects, toolCounts, workView } from '../../src/lib/project-order';

const p = (id: string, data: Partial<{ order: number; year: number; title: string; hidden: boolean; featured: boolean }> = {}) => ({
  id,
  data: { title: id, ...data },
});

describe('workView', () => {
  const card = (id: string, compact = false) => ({ id, data: { compact } });
  const ids = (list: { id: string }[]) => list.map((p) => p.id);

  it('puts large cards first and keeps each group in order', () => {
    const { large, compact } = workView([card('a'), card('b', true), card('c'), card('d', true)]);
    expect(ids(large)).toEqual(['a', 'c']);
    expect(ids(compact)).toEqual(['b', 'd']);
  });

  it('makes a lone tile a large card, in its place', () => {
    const { large, compact } = workView([card('a'), card('b', true), card('c')]);
    expect(ids(large)).toEqual(['a', 'b', 'c']);
    expect(compact).toEqual([]);
  });

  it('shows tiles as large cards when nothing else is large', () => {
    const { large, compact } = workView([card('a', true), card('b', true)]);
    expect(ids(large)).toEqual(['a', 'b']);
    expect(compact).toEqual([]);
  });

  it('copes with an empty view', () => {
    expect(workView([])).toEqual({ large: [], compact: [] });
  });
});

describe('toolCounts', () => {
  const tool = (...tools: string[]) => ({ data: { tools } });

  it('counts projects per tool, in the given order, leaving out tools nobody used', () => {
    const list = [tool('miro', 'figma'), tool('figma'), tool()];
    expect(toolCounts(list, ['figma', 'xd', 'miro'])).toEqual([
      { tool: 'figma', count: 2 },
      { tool: 'miro', count: 1 },
    ]);
  });

  it('accepts projects with no tools at all (the CMS omits empty lists)', () => {
    expect(toolCounts([{ data: {} }], ['figma'])).toEqual([]);
  });
});

describe('project ordering', () => {
  it('sorts by drag order, then newest year, then title', () => {
    const list = [p('b', { order: 2 }), p('a', { order: 1, year: 2020 }), p('c', { order: 1, year: 2025 }), p('d', { order: 1, year: 2025 })];
    expect(sortProjects(list).map((x) => x.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(compareProjects(list[0], list[0])).toBe(0);
  });

  it('hides hidden entries everywhere', () => {
    const list = [p('a', { order: 1 }), p('b', { order: 2, hidden: true }), p('c', { order: 3 })];
    expect(isPublished(list[1])).toBe(false);
    expect(published(list).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('links each project to the next one and wraps around', () => {
    const list = published([p('a', { order: 1 }), p('b', { order: 2 }), p('c', { order: 3 })]);
    expect(nextProject(list, 'a')?.id).toBe('b');
    expect(nextProject(list, 'c')?.id).toBe('a');
    expect(nextProject(list, 'missing')).toBeNull();
    expect(nextProject([list[0]], 'a')).toBeNull();
  });

  it('features the marked projects, or the first few when none are marked', () => {
    const list = [p('a', { order: 1 }), p('b', { order: 2, featured: true }), p('c', { order: 3 })];
    expect(featured(list).map((x) => x.id)).toEqual(['b']);
    expect(featured([p('a'), p('b'), p('c'), p('d')], 2).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('fills the hero reel with work the home page doesn’t show yet, alternating project and photo', () => {
    const projects = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => p(id));
    const photos = ['q', 'r', 's', 't'].map((id) => p(id));
    const reel = reelPicks(projects, projects.slice(0, 3), photos, photos.slice(0, 2));
    expect(reel.map((x) => x.entry.id)).toEqual(['d', 's', 'e', 't', 'f', 'q', 'a']);
    expect(reel.map((x) => x.kind)).toEqual(['project', 'photo', 'project', 'photo', 'project', 'photo', 'project']);
  });

  it('tops the reel up from shown work and copes with short lists', () => {
    const two = [p('a'), p('b')];
    expect(reelPicks(two, two, [p('q')], [], { projects: 4, photos: 3 }).map((x) => x.entry.id)).toEqual(['a', 'q', 'b']);
    expect(reelPicks([], [], [], [])).toEqual([]);
  });
});
