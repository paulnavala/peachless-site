import { test, expect } from '@playwright/test';

test.describe('/projects/logo-design', () => {
  test('renders the 7-logo grid', async ({ page }) => {
    await page.goto('/projects/logo-design');
    await expect(page.locator('.logo-showcase .logo-item')).toHaveCount(7);
    await expect(page.locator('.logo-item img').first()).toHaveAttribute('srcset', /webp/);
  });

  test('clicking a logo opens the detail panel', async ({ page }) => {
    await page.goto('/projects/logo-design');
    await page.locator('.logo-item').first().click();
    await expect(page.locator('.detail-panel .detail-title')).not.toBeEmpty();
    await expect(page.locator('.detail-panel .detail-logo-image')).toBeVisible();
  });
});
