import { test, expect } from '@playwright/test';
import { waitForIsland } from './utils';

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

  test('Escape closes the detail panel and returns focus to its logo', async ({ page }) => {
    await page.goto('/projects/logo-design');
    await waitForIsland(page, '.logo-showcase');
    const card = page.locator('.logo-placeholder').first();
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.detail-panel .close-button')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.detail-panel')).toHaveCount(0);
    await expect(card).toBeFocused();
    // The roving tab stop stays on that logo, so the grid is still reachable with Tab
    await expect(card).toHaveAttribute('tabindex', '0');
  });

  test('screen-reader activation of × returns focus to its logo', async ({ page }) => {
    await page.goto('/projects/logo-design');
    await waitForIsland(page, '.logo-showcase');
    const card = page.locator('.logo-placeholder').first();
    await card.click();
    const close = page.locator('.detail-panel .close-button');
    await expect(close).toBeFocused();
    // Assistive tech clicks carry no pointer type, and can report detail 1 like a mouse
    await close.evaluate((el) =>
      el.dispatchEvent(
        new PointerEvent('click', { pointerType: '', detail: 1, bubbles: true, cancelable: true })
      )
    );
    await expect(page.locator('.detail-panel')).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test('a mouse click on × does not leave its logo focused', async ({ page }) => {
    await page.goto('/projects/logo-design');
    await waitForIsland(page, '.logo-showcase');
    const card = page.locator('.logo-placeholder').first();
    await card.click();
    await page.locator('.detail-panel .close-button').click();
    await expect(page.locator('.detail-panel')).toHaveCount(0);
    await expect(card).not.toBeFocused();
  });

  test('Back closes a panel reopened right after another closed (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.goto('/projects/logo-design');
    await waitForIsland(page, '.logo-showcase');
    await page.locator('.logo-item').first().click();
    await expect(page.locator('.detail-panel')).toBeVisible();
    // Close, then open another logo straight away (inside the old 100ms window), and
    // wait until the popstate from the close's own history.back() has been handled
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          window.addEventListener('popstate', () => setTimeout(resolve), { once: true });
          document.querySelector<HTMLElement>('.detail-panel .close-button')!.click();
          document.querySelectorAll<HTMLElement>('.logo-placeholder')[1].click();
        })
    );
    await expect(page.locator('.detail-panel')).toBeVisible();
    // Back closes the reopened panel instead of leaving the page
    await page.goBack();
    await expect(page.locator('.detail-panel')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toMatch(/^\/projects\/logo-design\/?$/);
  });

  test('mobile detail panel keeps Tab on its close button', async ({ page }) => {
    // Reduced motion: no slide-in transform, so the close button is position:fixed from the start
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/projects/logo-design');
    await waitForIsland(page, '.logo-showcase');
    await page.locator('.logo-item').first().click();
    const close = page.locator('.detail-panel .close-button');
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
  });
});
