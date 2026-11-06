import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Moving between pages while the pointer moves and the canvas scrolls. The frame
 * navigates under all of that, and reaching into a document it has just left
 * crashes WebKit, so this is here to be run in every engine.
 */
test.use({ viewport: { width: 1600, height: 950 } });

const ready = (page: Page) => page.waitForFunction(() => !document.querySelector('.canvas__status') && document.querySelector('.overlay'));

test('survives moving between every kind of page, with the pointer busy', async ({ page }) => {
  test.setTimeout(90_000);
  let crashed = false;
  page.on('crash', () => (crashed = true));

  await page.goto('/admin/builder/');
  await ready(page);
  await page.getByRole('tab', { name: 'Pages' }).click();
  await page.getByLabel('Page name').fill('Client stories');
  await page.getByRole('button', { name: 'Add page' }).click();
  await ready(page);

  const route = ['Home', 'Client stories', 'About', 'Client stories', 'Work', 'Contact', 'Client stories', 'Home'];
  for (const name of route) {
    await page.getByRole('button', { name, exact: true }).click();
    // Straight away, while the frame is still navigating.
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(700 + i * 40, 300 + i * 30);
      await page.locator('.canvas').evaluate((canvas, top) => (canvas.scrollTop = top), i * 30);
    }
    await ready(page);
    await page.mouse.click(800, 420);
  }
  expect(crashed).toBe(false);
  await expect(page.locator('.canvas__frame')).toBeAttached();
  const h1 = await page.locator('.canvas__frame').evaluate((f) => (f as HTMLIFrameElement).contentDocument?.querySelector('h1')?.className);
  expect(h1).toBe('tagline');
});

test('a page switched away from mid-load doesn’t end up showing the wrong one', async ({ page }) => {
  await page.goto('/admin/builder/');
  await ready(page);
  await page.getByRole('tab', { name: 'Pages' }).click();
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await page.getByRole('button', { name: 'Contact', exact: true }).click();
  await ready(page);
  await expect
    .poll(() => page.locator('.canvas__frame').evaluate((f) => (f as HTMLIFrameElement).contentDocument?.querySelector('main [data-section]')?.getAttribute('data-section-type')))
    .toBe('contact');
});
