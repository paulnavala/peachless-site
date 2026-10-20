import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { allRoutes, publishedProjects } from './content';
import { waitForIsland } from './utils';

// WCAG 2.2 AA, as automated checks can see it. Third-party iframes (Figma) are
// out of our hands and excluded.
const audit = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('iframe')
    .analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

test.use({ contextOptions: { reducedMotion: 'reduce' } });

for (const width of [1280, 390]) {
  test.describe(`accessibility at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const path of [...allRoutes(), '/does-not-exist/']) {
      test(path, async ({ page }) => {
        await page.goto(path);
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}

test.describe('accessibility of open overlays', () => {
  test('mobile menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('[data-menu-open]').click();
    expect(await audit(page)).toEqual([]);
  });

  test('photo lightbox', async ({ page }) => {
    await page.goto('/photography/');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__media').first().click();
    await expect(page.locator('.pg-modal')).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test('guideline viewer', async ({ page }) => {
    const project = publishedProjects().find((p) => p.data.blocks.some((b) => b.type === 'guidelines'));
    test.skip(!project, 'no guidelines block');
    await page.goto(`/projects/${project!.id}/`);
    await page.locator('.gv-thumbs').scrollIntoViewIfNeeded();
    await waitForIsland(page, '.gv-thumbs');
    await page.locator('.gv-thumb').first().click();
    await page.locator('.gv-menu__toggle').click();
    expect(await audit(page)).toEqual([]);
  });

  test('prototype dialog', async ({ page }) => {
    const project = publishedProjects().find((p) => p.data.blocks.some((b) => b.type === 'prototype'));
    test.skip(!project, 'no prototype block');
    await page.route('https://www.figma.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title>' })
    );
    await page.goto(`/projects/${project!.id}/`);
    await page.locator('[data-proto-fullscreen]').first().click();
    await expect(page.locator('[data-proto-dialog][open]')).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test('contact form with errors', async ({ page }) => {
    await page.goto('/contact/');
    await page.locator('.cf__form').scrollIntoViewIfNeeded();
    await waitForIsland(page, '.cf__form');
    await page.locator('.cf__submit').click();
    await expect(page.locator('.cf .error').first()).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });
});
