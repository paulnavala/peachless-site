import { test, expect } from '@playwright/test';

test.describe('/photography', () => {
  test('renders the masonry gallery', async ({ page }) => {
    await page.goto('/photography');
    await expect(page.locator('#portfolio-photo .pg-masonry__item').first()).toBeVisible();
    const count = await page.locator('#portfolio-photo .pg-masonry__item').count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('opens the lightbox with a before/after slider and closes on Escape', async ({ page }) => {
    await page.goto('/photography');
    await page.locator('.pg-masonry__item').first().click();
    await expect(page.locator('.pg-modal')).toBeVisible();
    await expect(page.locator('.pg-modal .image-compare')).toBeVisible(); // first photo has a before image
    await page.keyboard.press('Escape');
    await expect(page.locator('.pg-modal')).toBeHidden();
  });
});
