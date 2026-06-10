import { test, expect } from '@playwright/test';

test.describe('/about', () => {
  test('renders the manifesto and portrait', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('.about-content h3').first()).toContainText('visual designer');
    await expect(page.locator('.about-content')).toContainText('Every pixel tells a story');
    await expect(page.locator('.about-portrait img')).toBeVisible();
  });
});
