import { test, expect } from './fixtures';
import { publishedProjects } from './content';

const project = publishedProjects().find((p) => p.data.blocks.some((b) => b.type === 'prototype'));

test.describe('Figma prototype block', () => {
  test.skip(!project, 'no published project has a prototype block');

  test.beforeEach(async ({ page }) => {
    // Stub Figma: instant, offline, and it can't steal focus mid-test.
    await page.route('https://www.figma.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title>' })
    );
    await page.goto(`/projects/${project!.id}/`);
  });

  test('loads nothing from Figma until the visitor asks, then embeds inline', async ({ page }) => {
    const block = page.locator('[data-prototype]').first();
    await expect(block.locator('iframe.proto__iframe')).toHaveCount(0);
    await block.locator('[data-proto-launch]').click();
    await expect(block.locator('iframe.proto__iframe')).toHaveAttribute('src', /figma\.com\/embed/);
    await expect(block.locator('a[href*="figma.com"]').first()).toBeVisible();
    // In a device frame the prototype runs inside the device, and the launch card goes.
    const frame = project!.data.blocks.find((b) => b.type === 'prototype')?.frame;
    if (frame && frame !== 'none') {
      await expect(block.locator('.device__screen iframe.proto__iframe')).toHaveCount(1);
      await expect(block.locator('[data-proto-facade]')).toHaveCount(0);
    }
  });

  test('fullscreen opens a modal dialog that keeps focus, and Escape returns to the button', async ({ page }) => {
    const block = page.locator('[data-prototype]').first();
    const open = block.locator('[data-proto-fullscreen]');
    await open.click();
    const dialog = block.locator('[data-proto-dialog]');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.locator('iframe')).toHaveAttribute('src', /figma\.com\/embed/);
    await expect(dialog.locator('[data-proto-close]')).toBeFocused();

    // Content behind a modal dialog is inert: focus can't escape to the footer.
    await page.locator('.site-footer nav a').first().focus();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-proto-dialog]'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
    await expect(dialog.locator('iframe')).toHaveAttribute('src', 'about:blank');
    await expect(open).toBeFocused();
  });
});
