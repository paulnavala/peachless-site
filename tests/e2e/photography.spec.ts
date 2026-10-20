import { test, expect } from './fixtures';
import { waitForIsland } from './utils';
import { publishedPhotos } from './content';

const photos = publishedPhotos();
const second = new RegExp(photos[1].id);

test.describe('/photography', () => {
  test('renders the masonry gallery', async ({ page }) => {
    await page.goto('/photography');
    await expect(page.locator('#portfolio-photo .pg-masonry__item').first()).toBeVisible();
    const count = await page.locator('#portfolio-photo .pg-masonry__item').count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('opens the lightbox with a before/after slider and closes on Escape', async ({ page }) => {
    await page.goto('/photography');
    await page.locator('.pg-masonry__item').first().click();
    await expect(page.locator('.pg-modal')).toBeVisible();
    await expect(page.locator('.pg-modal .image-compare')).toBeVisible(); // first photo has a before image
    await page.keyboard.press('Escape');
    await expect(page.locator('.pg-modal')).toBeHidden();
  });

  test('Escape right after an arrow key does not reopen the lightbox', async ({ page }) => {
    await page.goto('/photography');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__item').first().click();
    await expect(page.locator('.pg-modal__close')).toBeFocused();
    // Hold the next photo's images so its preload is still in flight when Escape lands
    await page.route('**/_astro/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue().catch(() => {});
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pg-modal')).toBeHidden();
    await page.waitForTimeout(700); // past the 400ms preload timeout
    await expect(page.locator('.pg-modal')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/pg-modal-open/);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('arrow navigation swaps photos without a square placeholder box', async ({ page }) => {
    await page.goto('/photography');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__item').first().click();
    await expect(page.locator('.pg-modal__close')).toBeFocused();
    // Record every aspect ratio the lightbox box takes on (none of the photos is square)
    await page.locator('.pg-modal__view').evaluate((el) => {
      const seen: string[] = [];
      (window as any).__ratios = seen;
      new MutationObserver(() => seen.push(el.style.getPropertyValue('--m-ratio').trim())).observe(el, {
        attributes: true,
        attributeFilter: ['style'],
      });
    });
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.pg-modal .image-compare img').first()).toHaveAttribute('src', second);
    expect(await page.evaluate(() => (window as any).__ratios)).not.toContain('1');
  });

  test('a photo slower than the preload timeout still gets its real aspect ratio', async ({ page }) => {
    await page.goto('/photography');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__item').first().click();
    await expect(page.locator('.pg-modal__close')).toBeFocused();
    // Hold the next photo's images past the 400ms preload timeout
    await page.route('**/_astro/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue().catch(() => {});
    });
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.pg-modal .image-compare img').first()).toHaveAttribute('src', second);
    await expect
      .poll(() => page.locator('.pg-modal__view').evaluate((el) => el.style.getPropertyValue('--m-ratio').trim()))
      .not.toBe('1');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('before/after handle keeps its position when the viewport resizes', async ({ page }) => {
    await page.goto('/photography');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__item').first().click();
    const slider = page.locator('.pg-modal .image-compare');
    await expect(slider).toBeVisible();
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
    await page.setViewportSize({ width: 1000, height: 640 });
    await page.waitForTimeout(500); // let the ResizeObserver run
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
  });

  test('right-clicking a photo does not open the lightbox', async ({ page }) => {
    await page.goto('/photography');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__item').first().click({ button: 'right' });
    await page.waitForTimeout(600); // past the 400ms preload window
    await expect(page.locator('.pg-modal')).toBeHidden();
  });
});
