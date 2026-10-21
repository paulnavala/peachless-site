import { describe, expect, it } from 'vitest';
import { SRCSET_STEPS, srcsetWidths } from '../../src/lib/media';

describe('srcsetWidths', () => {
  it("offers the source's own width after the steps below it", () => {
    expect(srcsetWidths(1052)).toEqual([480, 800, 1052]);
    expect(srcsetWidths(1440)).toEqual([480, 800, 1200, 1440]);
  });

  it('does not repeat a source that is exactly a step wide', () => {
    expect(srcsetWidths(800)).toEqual([480, 800]);
  });

  it('caps a large source at the largest step', () => {
    expect(srcsetWidths(3840)).toEqual(SRCSET_STEPS);
  });

  it('offers a source smaller than every step at its own width', () => {
    expect(srcsetWidths(412)).toEqual([412]);
  });

  it('respects explicit steps and never goes wider than the source', () => {
    expect(srcsetWidths(3000, [400, 800])).toEqual([400, 800]);
    expect(srcsetWidths(600, [400, 800])).toEqual([400, 600]);
  });
});
