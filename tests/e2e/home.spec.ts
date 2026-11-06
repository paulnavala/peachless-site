import { test, expect } from './fixtures';
import { disciplines, publishedPhotos, publishedProjects, sectionOf, sectionsOf } from './content';
import { featured, hasPrototype, reelPicks } from '../../src/lib/project-order';

// An editor can reorder Home or take a section off it, so each check reads the
// page's own file, and a section that isn't there isn't tested.
const hero = sectionOf('home', 'hero')!;
const manifesto = sectionOf('home', 'manifesto');
const deck = sectionOf('home', 'deck');
const crafts = sectionOf('home', 'disciplines');
const strip = sectionOf('home', 'photo-strip');
const teaser = sectionOf('home', 'about-teaser');

test.describe('home page', () => {
  test('opens with the typed headline, introduction and both calls to action', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(hero.line1);
    await expect(h1).toContainText(hero.line2);
    await expect(page.getByRole('link', { name: hero.primary.label })).toHaveAttribute('href', hero.primary.link);
    if (hero.secondary) {
      await expect(page.locator('.home-hero').getByRole('link', { name: hero.secondary.label })).toHaveAttribute('href', hero.secondary.link);
    }
  });

  test('the typed headline is fully rendered on the server', async ({ page }) => {
    await page.goto('/');
    const visual = await page.locator('.tagline__visual').innerText();
    expect(visual.replace(/\s+/g, ' ').trim()).toBe(`${hero.line1} ${hero.line2}`);
  });

  test('tells the story in the order its page gives', async ({ page }) => {
    await page.goto('/');
    const order = await page.locator('main section[aria-labelledby]').evaluateAll((sections) => sections.map((s) => s.getAttribute('aria-labelledby')));
    const expected = sectionsOf('home')
      .filter((s) => s.type !== 'hero')
      .map((s) => `${s.id}-title`);
    expect(order).toEqual(expected);
    await expect(page.locator('main [data-next-step]')).toHaveCount(1);
  });

  test('states what it believes', async ({ page }) => {
    test.skip(!manifesto, 'no statement on the page');
    await page.goto('/');
    await expect(page.locator(`#${manifesto!.id}-title`)).toHaveText(manifesto!.heading);
  });

  test('lists the kinds of work', async ({ page }) => {
    test.skip(!crafts, 'not on the page');
    await page.goto('/');
    const links = page.locator('.disciplines .card__link');
    await expect(links).toHaveCount(3);
    await expect(links.nth(0)).toHaveAttribute('href', '/projects/uiux/');
    await expect(links.nth(0)).toHaveText(disciplines().uiux.title);
    await expect(links.nth(1)).toHaveAttribute('href', '/projects/graphic-design/');
    await expect(links.nth(2)).toHaveAttribute('href', '/photography/');
  });

  test('shows the selected stories', async ({ page }) => {
    test.skip(!deck, 'not on the page');
    await page.goto('/');
    const expected = featured(publishedProjects());
    const cards = page.locator('.selected-work').getByTestId('work-card');
    await expect(cards).toHaveCount(expected.length);
    for (const [i, p] of expected.entries()) {
      await expect(cards.nth(i).locator('a.card__link')).toHaveAttribute('href', `/projects/${p.id}/`);
      await expect(cards.nth(i).locator('.deck-card__meta').getByText('Live prototype'), p.id).toHaveCount(hasPrototype(p) ? 1 : 0);
    }
  });

  test('shows the photo strip, and says hello', async ({ page }) => {
    await page.goto('/');
    if (strip) {
      const links = page.locator('.photo-strip__link');
      await expect(links).toHaveCount(Math.min(5, featured(publishedPhotos(), 5).length));
      await expect(links.first()).toHaveAttribute('href', '/photography/');
    }
    if (teaser) await expect(page.locator(`#${teaser.id}-title`)).toHaveText(teaser.heading);
  });

  test('the hero reel previews work the page doesn’t show yet, out of the way of assistive tech', async ({ page }) => {
    await page.goto('/');
    const projects = publishedProjects();
    const photos = publishedPhotos();
    const picks = reelPicks(projects, deck ? featured(projects) : [], photos, strip ? featured(photos, 5).slice(0, 5) : []);
    test.skip(picks.length < 3 || hero.reel === false, 'no reel');
    const reel = page.locator('.reel');
    await expect(reel).toHaveAttribute('aria-hidden', 'true');
    const links = reel.locator('a');
    await expect(links).toHaveCount(picks.length);
    for (const [i, pick] of picks.entries()) {
      await expect(links.nth(i)).toHaveAttribute('tabindex', '-1');
      await expect(links.nth(i)).toHaveAttribute('href', pick.kind === 'project' ? `/projects/${pick.entry.id}/` : '/photography/');
    }
  });

  for (const width of [320, 1280]) {
    test(`nothing scrolls sideways at ${width}px while the reel drifts`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('a focused story in the deck comes to the front', async ({ page }) => {
    test.skip(!deck, 'not on the page');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const cards = page.locator('.selected-work').getByTestId('work-card');
    const count = await cards.count();
    // Scroll to where the whole deck is stacked, then focus each story in turn.
    await page.locator('.selected-work .deck__item').last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    for (let i = 0; i < count; i++) {
      const link = cards.nth(i).locator('a.card__link');
      await link.focus();
      const onTop = await link.evaluate((a) => {
        const box = a.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return !!hit && hit.closest('[data-testid="work-card"]') === a.closest('[data-testid="work-card"]');
      });
      expect(onTop, `story ${i + 1} is visible when focused`).toBe(true);
    }
  });
});
