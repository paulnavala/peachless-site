import { test, expect } from './fixtures';
import { publishedProjects, site } from './content';

const settings = site();

test.describe('site chrome', () => {
  test('header has one brand link and the nav from site settings', async ({ page }) => {
    await page.goto('/');
    const brand = page.locator('.site-header__brand');
    await expect(brand).toHaveCount(1);
    await expect(brand).toHaveAttribute('href', '/');
    await expect(brand).toContainText(settings.siteName ?? 'peachless.');
    // The wordmark is drawn (an outlined SVG); its name is still the site name.
    await expect(brand).toHaveAccessibleName(settings.siteName ?? 'peachless.');
    await expect(brand.locator('.wordmark svg, .wordmark--text').first()).toBeVisible();

    const links = page.locator('.site-header__nav a');
    await expect(links).toHaveCount(settings.nav.length);
    for (const [i, item] of settings.nav.entries()) {
      await expect(links.nth(i)).toHaveAttribute('href', item.href);
      await expect(links.nth(i)).toHaveText(item.label);
      if (item.cta) await expect(links.nth(i)).toHaveClass(/btn/);
    }
  });

  test('nav marks the current page, and its section on pages below it', async ({ page }) => {
    const about = settings.nav.find((n) => n.href.startsWith('/about'))!;
    await page.goto(about.href);
    await expect(page.locator(`.site-header__nav a[href="${about.href}"]`)).toHaveAttribute('aria-current', 'page');

    const work = settings.nav.find((n) => n.href.startsWith('/projects'))!;
    await page.goto('/projects/cern/');
    await expect(page.locator(`.site-header__nav a[href="${work.href}"]`)).toHaveAttribute('aria-current', 'true');
  });

  test('header condenses once the page scrolls', async ({ page }) => {
    await page.goto('/about/');
    const header = page.locator('[data-site-header]');
    await expect(header).not.toHaveAttribute('data-condensed');
    await page.mouse.wheel(0, 600);
    await expect(header).toHaveAttribute('data-condensed', '');
  });

  test('footer invites contact and lists nav, emails and legal line', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('.site-footer');
    if (settings.cta) {
      await expect(footer.locator('#footer-cta-title')).toHaveText(settings.cta.heading);
      await expect(footer.locator(`.site-footer__cta a[href="${settings.cta.buttonLink}"]`)).toBeVisible();
    }
    await expect(footer.locator('nav a')).toHaveCount(settings.nav.length);
    for (const e of settings.emails) {
      await expect(footer.locator(`.site-footer__main a[href="mailto:${e.address}"]`)).toBeVisible();
    }
    await expect(footer.locator('.site-footer__legal')).toContainText(settings.siteName ?? 'peachless.');
  });

  test('mobile menu opens as a modal, focuses the first link, closes on Escape and restores focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const toggle = page.locator('[data-menu-open]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toHaveAttribute('open', '');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const links = settings.nav.filter((n) => !n.cta);
    await expect(menu.locator('.mobile-menu__link')).toHaveCount(links.length);
    await expect(menu.locator('.mobile-menu__link').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('mobile menu keeps Tab inside the dialog', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('[data-menu-open]').click();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() =>
        document.activeElement === document.body ? 'body' : document.activeElement?.closest('#mobile-menu') ? 'menu' : 'behind'
      );
      // Never the page behind. Safari's Tab skips links by default, so focus
      // passes through the browser's own UI (<body>) on its way round.
      expect(where === 'menu' || (browserName === 'webkit' && where === 'body'), where).toBe(true);
    }
  });

  test('every page has exactly one h1', async ({ page }) => {
    for (const path of [
      '/',
      '/about/',
      '/contact/',
      '/photography/',
      '/projects/',
      '/projects/uiux/',
      '/projects/graphic-design/',
      '/projects/logo-design/',
      ...publishedProjects().map((p) => `/projects/${p.id}/`),
    ]) {
      await page.goto(path);
      await expect(page.locator('h1'), path).toHaveCount(1);
    }
  });

  test('404 page renders for unknown URLs', async ({ page }) => {
    const response = await page.goto('/does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toBeVisible();
  });
});
