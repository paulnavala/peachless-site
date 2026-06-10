import { test, expect } from '@playwright/test';

for (const slug of ['cern', 'ton', 'melody-memoirs']) {
  test(`/projects/${slug} renders a case-study stub`, async ({ page }) => {
    await page.goto(`/projects/${slug}`);
    await expect(page.locator('.case-study h1')).not.toBeEmpty();
    await expect(page.locator('.case-study iframe')).toHaveAttribute('src', /figma\.com\/embed/);
    await expect(page.locator('.case-study a.case-back')).toHaveAttribute('href', '/projects/uiux');
  });
}
