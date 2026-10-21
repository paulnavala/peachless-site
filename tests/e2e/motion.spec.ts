import { test, expect } from './fixtures';
import { publishedProjects } from './content';
import { waitForIsland } from './utils';

// Motion that answers the visitor (v2.2): overlays fade in and out while their
// state changes at once, a label follows the pointer over work, lazy images
// fade in as they arrive — and none of it moves for visitors who ask for less.

const guidelines = publishedProjects().find((p) => p.data.blocks.some((b) => b.type === 'guidelines'));
const prototype = publishedProjects().find((p) => p.data.blocks.some((b) => b.type === 'prototype'));

const running = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => (a as CSSAnimation).animationName ?? a.constructor.name)
  );

test.describe('overlays', () => {
  test('the mobile menu closes at once, then lifts away', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const toggle = page.locator('[data-menu-open]');
    await toggle.click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    // The state changes immediately (no waiting on the animation)…
    expect(await menu.evaluate((d) => (d as HTMLDialogElement).open)).toBe(false);
    await expect(toggle).toBeFocused();
    // …and the curtain is gone soon after.
    await expect(menu).toBeHidden();
  });

  test('a prototype fades in once it has loaded, and its loading card goes', async ({ page }) => {
    test.skip(!prototype, 'no published project has a prototype block');
    await page.route('https://www.figma.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title>' })
    );
    await page.goto(`/projects/${prototype!.id}/`);
    const block = page.locator('[data-prototype]').first();
    await block.locator('[data-proto-launch]').click();
    await expect(block.locator('iframe.proto__iframe')).toHaveAttribute('data-loaded', '');
    await expect(block.locator('[data-proto-facade]')).toHaveCount(0);
  });
});

test.describe('the pointer label over work', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('says "View" over a cover, stays out of the way, and goes off the cover', async ({ page }) => {
    await page.goto('/projects/');
    const card = page.getByTestId('work-card').first();
    const media = card.locator('[data-cursor]');
    await media.scrollIntoViewIfNeeded();
    const box = (await media.boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    // The raw mouse: a locator hover would aim at the card's stretched link.
    await page.mouse.move(x - 40, y - 40);
    await page.mouse.move(x, y, { steps: 4 });

    const label = page.locator('.cursor-label');
    await expect(label).toHaveAttribute('data-on', '');
    await expect(label).toHaveText('View');
    await expect(label).toHaveAttribute('aria-hidden', 'true');
    await expect(label).toHaveCSS('pointer-events', 'none');
    // Clicks pass straight through it.
    const covered = await page.evaluate(
      ([px, py]) => !!document.elementFromPoint(px + 40, py + 40)?.closest('.cursor-label'),
      [x, y]
    );
    expect(covered).toBe(false);

    const title = (await card.locator('.work-title').boundingBox())!;
    await page.mouse.move(title.x + 8, title.y + title.height / 2, { steps: 4 });
    await expect(label).not.toHaveAttribute('data-on');

    const href = (await card.locator('a.card__link').getAttribute('href'))!;
    await page.mouse.move(x, y, { steps: 2 });
    await page.mouse.click(x, y);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test.describe('is never built for touch', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test('on a phone', async ({ page }) => {
      await page.goto('/projects/');
      const box = (await page.getByTestId('work-card').first().locator('[data-cursor]').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
      await page.waitForTimeout(200);
      await expect(page.locator('.cursor-label')).toHaveCount(0);
    });
  });
});

test('lazy images end fully shown once they have loaded', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(60);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLImageElement>('img.media[loading="lazy"]')].filter(
            (img) => img.complete && img.naturalWidth > 0 && (!img.hasAttribute('data-loaded') || getComputedStyle(img).opacity !== '1')
          ).length
      )
    )
    .toBe(0);
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('no pointer label, and lazy images are never hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/projects/');
    const box = (await page.getByTestId('work-card').first().locator('[data-cursor]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await page.waitForTimeout(200);
    await expect(page.locator('.cursor-label')).toHaveCount(0);
    const hidden = await page.evaluate(
      () => [...document.querySelectorAll('img[loading="lazy"]')].filter((img) => getComputedStyle(img).opacity !== '1').length
    );
    expect(hidden).toBe(0);
  });

  test('the mobile menu opens and closes without moving', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('[data-menu-open]').click();
    await expect(page.locator('#mobile-menu')).toHaveAttribute('open', '');
    await page.waitForTimeout(300);
    expect(await running(page)).toEqual([]);
  });

  test('the photo lightbox opens without moving', async ({ page }) => {
    await page.goto('/photography/');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__media').first().click();
    await expect(page.locator('.pg-modal')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await running(page)).toEqual([]);
  });

  test('the guideline viewer opens and pages without moving', async ({ page }) => {
    test.skip(!guidelines, 'no published project has a guidelines block');
    await page.goto(`/projects/${guidelines!.id}/`);
    await page.locator('.gv-thumbs').scrollIntoViewIfNeeded();
    await waitForIsland(page, '.gv-thumbs');
    await page.locator('.gv-thumb').first().click();
    await expect(page.locator('.gv-dialog')).toHaveAttribute('open', '');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(await running(page)).toEqual([]);
  });
});
