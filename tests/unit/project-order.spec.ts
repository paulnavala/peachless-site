import { describe, expect, it } from 'vitest';
import { compareProjects, featured, isPublished, nextProject, published, sortProjects } from '../../src/lib/project-order';

const p = (id: string, data: Partial<{ order: number; year: number; title: string; hidden: boolean; featured: boolean }> = {}) => ({
  id,
  data: { title: id, ...data },
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
});
