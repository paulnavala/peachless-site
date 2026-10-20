import { test, expect } from '@playwright/test';
import { waitForIsland } from './utils';

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

  test('keeps keyboard focus inside the viewer when dock buttons disable themselves', async ({ page }) => {
    await page.goto('/projects/guidelines');
    await waitForIsland(page, '.guideline-page');
    await page.locator('.brand-card').first().click();
    const viewer = page.locator('.svg-viewer-modal');
    await expect(viewer.locator('.close-viewer-button')).toBeFocused();

    // Step to the last page from the keyboard, so the focused Next button ends up disabled
    await viewer.getByRole('button', { name: 'Next Page (Right Arrow)' }).focus();
    for (let i = 0; i < 9; i++) await page.keyboard.press('Enter');
    await expect(viewer.locator('.dock-page-text')).toHaveText('Page 10');
    await page.keyboard.press('Tab');
    await expect(viewer.locator(':focus')).toHaveCount(1);

    // Zoom In is now the last enabled control: Tab wraps instead of leaving the viewer
    await viewer.getByRole('button', { name: 'Zoom In (+)' }).focus();
    await page.keyboard.press('Tab');
    await expect(viewer.locator('.close-viewer-button')).toBeFocused();
  });
});
