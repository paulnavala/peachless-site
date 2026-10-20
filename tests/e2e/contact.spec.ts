import { test, expect } from './fixtures';
import { waitForIsland } from './utils';
import { readYaml, site } from './content';

const contact = readYaml('pages', 'contact.yaml');
const emails = site().emails;

test.describe('/contact', () => {
  test('shows the heading and every email address', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('main')).toContainText(contact.heading);
    // Scoped to the page's email block: the footer also renders the mailto links.
    for (const e of emails) {
      await expect(page.locator(`.contact-emails a[href="mailto:${e.address}"]`)).toBeVisible();
    }
  });

  test('contact form validates required fields and submits to the configured endpoint', async ({ page }) => {
    // Stub the form service so test runs never create real submissions/emails.
    let posted = false;
    await page.route('https://api.web3forms.com/**', async (route) => {
      posted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
    await page.goto('/contact');
    const form = page.locator('.contact-form-container form');
    await expect(form.locator('input[name="name"]')).toHaveAttribute('required', '');
    // formHidden from site.yaml must render as a hidden input inside the form
    await expect(form.locator('input[type="hidden"][name="access_key"]')).toHaveValue(/.+/);
    await form.locator('input[name="name"]').fill('Test');
    await form.locator('input[name="email"]').fill('test@example.com');
    await form.locator('textarea[name="message"]').fill('Hello');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('.form-status')).toContainText('Message sent');
    expect(posted).toBe(true);
    // successful submission resets the form
    await expect(form.locator('input[name="name"]')).toHaveValue('');
  });

  test('fortune peach cracks open and resets on Escape', async ({ page }) => {
    await page.goto('/contact');
    await page.locator('#flwLogoBtn').click();
    await expect(page.locator('#flwStage')).toHaveClass(/flw-stage--revealed/, { timeout: 8_000 });
    await expect(page.locator('#flwQuote')).not.toBeEmpty();
    await page.keyboard.press('Escape');
    await expect(page.locator('#flwStage')).toHaveClass(/flw-stage--unopened/);
  });

  test('fortune peach announces the result and keeps keyboard focus in the widget', async ({ page }) => {
    await page.goto('/contact');
    await page.locator('#flwLogoBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#flwStage')).toHaveClass(/flw-stage--revealed/, { timeout: 8_000 });
    await expect(page.locator('#flwAnnounce')).toContainText('Your fortune:');
    await expect(page.locator('#flwAgain')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#flwStage')).toHaveClass(/flw-stage--unopened/);
    await expect(page.locator('#flwLogoBtn')).toBeFocused();
    await expect(page.locator('#flwAnnounce')).toBeEmpty();
  });

  test('a failed submission offers the contact email instead', async ({ page }) => {
    // Stubbed failure: never let a test POST to the real endpoint.
    await page.route('https://api.web3forms.com/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false }),
      })
    );
    await page.goto('/contact');
    const form = page.locator('.contact-form-container form');
    await form.scrollIntoViewIfNeeded();
    await waitForIsland(page, '.contact-form-container');
    await form.locator('input[name="name"]').fill('Test');
    await form.locator('input[name="email"]').fill('test@example.com');
    await form.locator('textarea[name="message"]').fill('Hello');
    await form.locator('button[type="submit"]').click();
    await expect(
      page.locator(`.form-status a[href="mailto:${emails[0].address}"]`)
    ).toBeVisible();
  });
});
