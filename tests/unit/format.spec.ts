import { describe, expect, it } from 'vitest';
import { disciplineList } from '../../src/lib/content-schema';

describe('disciplineList', () => {
  it('names one discipline as is', () => {
    expect(disciplineList(['uiux'])).toBe('UI/UX');
  });

  it('joins two with an ampersand, the way they are said', () => {
    expect(disciplineList(['graphic-design', 'uiux'])).toBe('Graphic design & UI/UX');
  });

  it('is empty for none', () => {
    expect(disciplineList([])).toBe('');
  });
});
