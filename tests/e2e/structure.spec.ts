import { test, expect } from './fixtures';
import { allRoutes } from './content';

/**
 * Site-wide structure rules from the v2 redesign:
 * one h1 and no skipped heading levels; every page ends with a next step; no
 * horizontal scrolling at 320px; unique view-transition names; and under
 * reduced motion, nothing animates.
 */
const routes = [...allRoutes(), '/does-not-exist/'];

test.describe('every page', () => {
  for (const path of routes) {
    test(`${path}: one h1, no skipped heading levels, ends with a next step`, async ({ page }) => {
      await page.goto(path);
      const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((els) =>
        els.filter((el) => el.getClientRects().length > 0 || el.closest('.sr-only')).map((el) => Number(el.tagName[1]))
      );
      expect(levels.filter((l) => l === 1), 'exactly one h1').toHaveLength(1);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i] - levels[i - 1], `heading h${levels[i - 1]} → h${levels[i]}`).toBeLessThanOrEqual(1);
      }
      if (path !== '/contact/') {
        // Contact's own invitation is the page; its footer CTA is switched off.
        await expect(page.locator('main [data-next-step]').first()).toBeAttached();
      } else {
        await expect(page.locator('main [data-next-step]')).toHaveCount(1);
      }
    });
  }

  test('nothing scrolls sideways at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    for (const path of routes) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('view-transition names are unique on each page', async ({ page }) => {
    for (const path of routes) {
      await page.goto(path);
      const names = await page.evaluate(() =>
        [...document.querySelectorAll('*')]
          .map((el) => getComputedStyle(el).viewTransitionName)
          .filter((n) => n && n !== 'none')
      );
      expect(new Set(names).size, `${path}: ${names.join(', ')}`).toBe(names.length);
    }
  });
});

test('scroll-linked effects come to rest by the bottom of every page', async ({ page }) => {
  test.setTimeout(60_000);
  for (const path of routes) {
    await page.goto(path);
    if (!(await page.evaluate(() => CSS.supports('animation-timeline: view()')))) continue;
    // Step down the page so every timeline sees a real scroll, then settle.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(r));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const unfinished = await page.evaluate(() => {
      const left: string[] = [];
      for (const el of document.querySelectorAll('[data-scroll~="unveil"] > :first-child')) {
        const t = getComputedStyle(el).transform;
        if (t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)') left.push(`unveil in .${el.parentElement?.classList[0]}: ${t}`);
      }
      for (const statement of document.querySelectorAll('[data-scroll~="lit"]')) {
        const lit = getComputedStyle(statement).color;
        for (const word of statement.children) {
          if (getComputedStyle(word).color !== lit) left.push(`unlit word "${word.textContent}"`);
        }
      }
      for (const swash of document.querySelectorAll('.site-footer__swash')) {
        if (getComputedStyle(swash).clipPath.includes('100%')) left.push('footer underline');
      }
      return left;
    });
    expect(unfinished, path).toEqual([]);
  }
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  for (const path of ['/', '/projects/', '/projects/ton/', '/projects/peachless/', '/photography/', '/about/', '/contact/']) {
    test(`${path} runs no animations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(300);
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === 'running')
          .map((a) => (a as CSSAnimation).animationName ?? a.constructor.name)
      );
      expect(running).toEqual([]);
    });
  }

  test('the home headline is complete immediately', async ({ page }) => {
    await page.goto('/');
    const hidden = await page.locator('.tagline__char').evaluateAll(
      (chars) => chars.filter((c) => getComputedStyle(c).opacity !== '1').length
    );
    expect(hidden).toBe(0);
  });
});
