import { test, expect } from './fixtures';
import { publishedProjects } from './content';
import { waitForIsland } from './utils';

const project = publishedProjects().find((p) => p.data.blocks.some((b) => b.type === 'guidelines'));
const pages = project?.data.blocks.find((b) => b.type === 'guidelines')?.pages ?? [];

test.describe('brand guidelines viewer', () => {
  test.skip(!project, 'no published project has a guidelines block');

  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${project!.id}/`);
    await page.locator('.gv-thumbs').scrollIntoViewIfNeeded();
    await waitForIsland(page, '.gv-thumbs');
  });

  test('shows a thumbnail for every page, each a real link to the page image', async ({ page }) => {
    const thumbs = page.locator('.gv-thumb');
    await expect(thumbs).toHaveCount(pages.length);
    await expect(thumbs.first()).toHaveAttribute('href', /\.(svg|png|jpe?g|webp|avif)$/);
  });

  test('opens full screen, pages through with focus kept inside, and closes back to the thumbnail', async ({ page }) => {
    const first = page.locator('.gv-thumb').first();
    await first.click();
    const dialog = page.locator('.gv-dialog');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.locator('.gv-count')).toHaveText(`1 / ${pages.length}`);
    await expect(dialog.locator('.gv-close')).toBeFocused();

    const next = dialog.getByRole('button', { name: 'Next page' });
    for (let i = 1; i < pages.length; i++) await next.click();
    await expect(dialog.locator('.gv-count')).toHaveText(`${pages.length} / ${pages.length}`);
    await expect(dialog.locator('.gv-title')).toHaveText(pages[pages.length - 1].title);
    await expect(next).toBeDisabled();

    // The focused button just disabled itself; Tab must stay inside the dialog.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.gv-dialog'))).toBe(true);

    await page.keyboard.press('ArrowLeft');
    await expect(dialog.locator('.gv-count')).toHaveText(`${pages.length - 1} / ${pages.length}`);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
    await expect(first).toBeFocused();
  });

  test('the page menu jumps to a page and marks the current one', async ({ page }) => {
    await page.locator('.gv-thumb').first().click();
    const toggle = page.locator('.gv-menu__toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const items = page.locator('.gv-menu__item');
    await expect(items).toHaveCount(pages.length);
    await items.nth(2).click();
    await expect(page.locator('.gv-count')).toHaveText(`3 / ${pages.length}`);
    await toggle.click();
    await expect(items.nth(2)).toHaveAttribute('aria-current', 'page');
  });

  test('zooms in, then a drag pans the page 1:1', async ({ page }) => {
    await page.locator('.gv-thumb').first().click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const image = page.locator('.gv-image');
    await expect(image).toHaveAttribute('style', /scale\(1\.5\)/);
    const box = (await page.locator('.gv-stage').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 100, y + 40, { steps: 5 });
    await page.mouse.up();
    await expect(image).toHaveAttribute('style', /translate\(100px, 40px\) scale\(1\.5\)/);
    await page.keyboard.press('0');
    // Firefox writes translate(0px, 0px) as translate(0px).
    await expect(image).toHaveAttribute('style', /translate\(0px(, 0px)?\) scale\(1\)/);
  });
});
