import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { SECTION_TYPES, SURFACES } from '../../src/lib/content-schema';

/**
 * The specimens page: one real instance of every section, which the builder's
 * canvas clones. It also gives custom sections a place to be tested before any
 * editor has made one, on every surface and at the widths layouts break.
 */
const SPECIMENS = '/admin/builder/specimens/';
const grid = (surface: string) => `[data-section="specimen-grid-${surface}"]`;

// Final states, and no paper grain: see a11y.spec.ts.
test.use({ contextOptions: { reducedMotion: 'reduce', contrast: 'more' } });

test('holds a real instance of every section', async ({ page }) => {
  await page.goto(SPECIMENS);
  for (const type of SECTION_TYPES) {
    await expect(page.locator(`[data-section-type="${type}"]`).first(), type).toBeAttached();
  }
});

test('fills every optional field, so the canvas always has markup to clone', async ({ page }) => {
  await page.goto(SPECIMENS);
  const fields: [string, string[]][] = [
    ['hero', ['eyebrow', 'lede', 'secondary.label']],
    ['page-header', ['eyebrow', 'intro']],
    ['deck', ['intro', 'action.label']],
    ['photo-strip', ['intro', 'action.label']],
    ['cta-band', ['eyebrow', 'body']],
    ['profile', ['eyebrow', 'toolsNote', 'closing']],
    ['contact', ['eyebrow', 'lede']],
    ['work-logos', ['intro']],
  ];
  for (const [type, keys] of fields) {
    for (const key of keys) {
      await expect(page.locator(`[data-section-type="${type}"] [data-field="${key}"]`).first(), `${type}.${key}`).toBeAttached();
    }
  }
});

test('stays out of search', async ({ page, request }) => {
  for (const path of [SPECIMENS, '/admin/builder/shell/']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
  const xml = await (await request.get('/sitemap-0.xml')).text();
  expect(xml).not.toContain('/admin/');
});

test('the shell is a real page with nothing in it', async ({ page }) => {
  await page.goto('/admin/builder/shell/');
  await expect(page.locator('main [data-section]')).toHaveCount(0);
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.locator('footer').first()).toBeAttached();
});

test.describe('a custom section', () => {
  for (const surface of SURFACES) {
    test(`reads on the ${surface} surface`, async ({ page }) => {
      await page.goto(SPECIMENS);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include(grid(surface))
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('places elements on the columns the editor chose', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPECIMENS);
    const box = (id: string) => page.locator(`${grid('default')} [data-element="${id}"]`).boundingBox();
    const [left, right, wide] = await Promise.all([box('a'), box('b'), box('h')]);
    // Six columns each, side by side, and a full-width divider below.
    expect(left!.y).toBe(right!.y);
    expect(right!.x).toBeGreaterThan(left!.x + left!.width);
    expect(wide!.width).toBeGreaterThan(left!.width * 2);
  });

  test('an image fills the rows it was given, and never sizes them', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SPECIMENS);
    // Measured against a row that holds only a button: the grid's own row height.
    const sizes = await page.locator(`${grid('default')} .grid-section__grid`).evaluate((node) => {
      const css = getComputedStyle(node);
      const rows = css.gridTemplateRows.split(' ').map(parseFloat);
      const gap = parseFloat(css.rowGap);
      const cell = node.querySelector('[data-element="d"]')!.getBoundingClientRect().height;
      return { cell, expected: rows.slice(2, 8).reduce((a, b) => a + b, 0) + gap * 5, tallest: Math.max(...rows) };
    });
    expect(sizes.cell).toBeCloseTo(sizes.expected, 0);
    // Rows hold words, so none should be anywhere near a portrait's height.
    expect(sizes.tallest).toBeLessThan(120);
  });

  test('stacks on a phone in reading order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SPECIMENS);
    const tops = await page
      .locator(`${grid('default')} .grid-item`)
      .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    const widths = await page
      .locator(`${grid('default')} .grid-item`)
      .evaluateAll((items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().width))).size);
    expect(widths).toBe(1);
  });

  test('gives an image its shape back on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SPECIMENS);
    const image = page.locator(`${grid('default')} [data-element="d"] img`);
    await image.scrollIntoViewIfNeeded();
    const box = await image.boundingBox();
    expect(box!.height).toBeGreaterThan(100);
  });

  for (const width of [320, 768]) {
    test(`holds its words at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(SPECIMENS);
      const spill = await page.locator('.grid-item').evaluateAll((items) =>
        items.filter((item) => item.scrollWidth > item.clientWidth + 1).map((item) => item.getAttribute('data-element'))
      );
      expect(spill).toEqual([]);
      const pageSpill = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(pageSpill).toBeLessThanOrEqual(0);
    });
  }
});
