import { test, expect } from '@playwright/test';

test.describe('/projects', () => {
  test('renders two project cards with rewired links + guidelines button', async ({ page }) => {
    await page.goto('/projects');
    const cards = page.locator('.projects-text-grid a.project-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('href', '/projects/logo-design');
    await expect(cards.nth(0)).toContainText('Logo Design');
    await expect(cards.nth(1)).toHaveAttribute('href', '/projects/uiux');
    await expect(page.locator('a.guideline-button')).toHaveAttribute('href', '/projects/guidelines');
  });
});
