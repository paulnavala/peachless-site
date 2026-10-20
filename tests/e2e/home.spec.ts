import { test, expect } from './fixtures';
import { readYaml } from './content';

const home = readYaml('pages', 'home.yaml');

test.describe('home page', () => {
  test('animated tagline types the brand line', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.tagline .line-1')).toContainText('Every pixel', {
      timeout: 15_000,
    });
  });

  test('intro section shows the manifesto and the main call to action', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.home-intro h3')).toContainText(home.manifesto.heading);
    await expect(page.locator('.home-intro img')).toBeVisible();
    const btn = page.locator('.home-intro a.btn-primary');
    await expect(btn).toHaveText(home.primaryCta.label);
    await expect(btn).toHaveAttribute('href', home.primaryCta.link);
  });

  test('twin gallery has three panels with rewired links', async ({ page }) => {
    await page.goto('/');
    const gallery = page.locator('.twin-gallery');
    await expect(gallery.locator('a.panel')).toHaveCount(2);
    await expect(gallery.locator('a.panel.left')).toHaveAttribute('href', '/projects/logo-design');
    await expect(gallery.locator('a.panel.right')).toHaveAttribute('href', '/projects/uiux');
    await expect(page.locator('.guidelines-wrapper a.guidelines-panel')).toHaveAttribute(
      'href',
      '/projects/guidelines'
    );
  });
});
