import { describe, expect, it } from 'vitest';
import { navCurrent, normalizePath } from '../../src/lib/nav';

describe('normalizePath', () => {
  it('drops trailing slashes, query and hash', () => {
    expect(normalizePath('/projects/')).toBe('/projects');
    expect(normalizePath('/projects/cern/?x=1#top')).toBe('/projects/cern');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('/');
  });
});

describe('navCurrent', () => {
  it('marks the exact page', () => {
    expect(navCurrent('/about/', '/about/')).toBe('page');
    expect(navCurrent('/about/', '/about')).toBe('page');
  });

  it('marks the section for pages below it', () => {
    expect(navCurrent('/projects/', '/projects/cern/')).toBe('true');
    expect(navCurrent('/projects/', '/projects/uiux/')).toBe('true');
  });

  it('never treats home as the parent of everything', () => {
    expect(navCurrent('/', '/about/')).toBeUndefined();
    expect(navCurrent('/', '/')).toBe('page');
  });

  it('does not match siblings that share a prefix', () => {
    expect(navCurrent('/project', '/projects/')).toBeUndefined();
  });

  it('ignores external and hash links', () => {
    expect(navCurrent('https://example.com/about/', '/about/')).toBeUndefined();
    expect(navCurrent('#main', '/')).toBeUndefined();
  });
});
