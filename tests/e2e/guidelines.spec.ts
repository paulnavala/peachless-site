import { test, expect } from '@playwright/test';

test.describe('/projects/guidelines', () => {
  test('renders all six brand cards with Peachless first', async ({ page }) => {
    await page.goto('/projects/guidelines');
    // Live card order: peachless, blend, fish-seafood, intouch, melody, the-world
    await expect(page.locator('.guideline-page .brand-card')).toHaveCount(6);
    await expect(page.locator('.brand-name').first()).toContainText('Peachless');
  });

  test('opens the SVG viewer and closes on Escape', async ({ page }) => {
    await page.goto('/projects/guidelines');
    await page.locator('.brand-card').first().click();
    await expect(page.locator('.svg-viewer-modal')).toBeVisible();
    await expect(page.locator('.svg-image')).toHaveAttribute('src', /guidelines\/peachless/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.svg-viewer-modal')).toBeHidden();
  });
});
