import { test, expect } from '@playwright/test';

test.describe('site chrome', () => {
  test('header renders title, centered logo, and nav', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.site-header__title')).toHaveText('peachless.');
    await expect(page.locator('.site-header__logo img')).toBeVisible();
    const nav = page.locator('.site-header__nav a');
    await expect(nav).toHaveCount(4);
    await expect(nav.nth(0)).toHaveAttribute('href', '/projects');
    await expect(nav.nth(1)).toHaveAttribute('href', '/photography');
    await expect(nav.nth(2)).toHaveAttribute('href', '/about');
    await expect(nav.nth(3)).toHaveAttribute('href', '/contact');
  });

  test('footer renders brand, nav, contact emails, legal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#elegant-footer .brand-name')).toHaveText('peachless.');
    await expect(page.locator('#elegant-footer .footer-nav a')).toHaveCount(4);
    await expect(
      page.locator('#elegant-footer .footer-contact a[href="mailto:patricia@peachless.design"]')
    ).toBeVisible();
    await expect(page.locator('#elegant-footer .footer-legal')).toContainText('peachless.');
  });

  test('mobile menu opens, traps focus, closes on Escape', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/');
    await page.locator('.site-header__burger').click();
    await expect(page.locator('.mmx-overlay')).toHaveClass(/open/);
    await expect(page.locator('.mmx-nav a')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mmx-overlay')).not.toHaveClass(/open/);
  });

  test('404 page renders for unknown URLs', async ({ page }) => {
    const response = await page.goto('/does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('404');
  });
});
