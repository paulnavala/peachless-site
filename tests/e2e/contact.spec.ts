import { test, expect } from '@playwright/test';

test.describe('/contact', () => {
  test('shows heading and both email addresses', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('h2').first()).toContainText('Contact');
    // Scoped to the page's email block: the footer also renders both mailto links,
    // so the unscoped locator is a strict-mode violation.
    await expect(
      page.locator('.contact-emails a[href="mailto:patricia@peachless.design"]')
    ).toBeVisible();
    await expect(
      page.locator('.contact-emails a[href="mailto:i.am.peachless@gmail.com"]')
    ).toBeVisible();
  });

  test('contact form validates required fields and shows unconfigured notice', async ({ page }) => {
    await page.goto('/contact');
    const form = page.locator('.contact-form-container form');
    await expect(form.locator('input[name="name"]')).toHaveAttribute('required', '');
    await form.locator('input[name="name"]').fill('Test');
    await form.locator('input[name="email"]').fill('test@example.com');
    await form.locator('textarea[name="message"]').fill('Hello');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('.form-status')).toContainText('isn’t configured');
  });

  test('fortune peach cracks open and resets on Escape', async ({ page }) => {
    await page.goto('/contact');
    await page.locator('#flwLogoBtn').click();
    await expect(page.locator('#flwStage')).toHaveClass(/flw-stage--revealed/, { timeout: 8_000 });
    await expect(page.locator('#flwQuote')).not.toBeEmpty();
    await page.keyboard.press('Escape');
    await expect(page.locator('#flwStage')).toHaveClass(/flw-stage--unopened/);
  });
});
