import { test, expect } from './fixtures';
import { publishedPhotos, publishedProjects, readYaml } from './content';
import { featured, reelPicks } from '../../src/lib/project-order';

const home = readYaml('pages', 'home.yaml');
const work = readYaml('pages', 'work.yaml');

test.describe('home page', () => {
  test('opens with the typed headline, introduction and both calls to action', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(home.tagline.line1);
    await expect(h1).toContainText(home.tagline.line2);
    await expect(page.getByRole('link', { name: home.primaryCta.label })).toHaveAttribute('href', home.primaryCta.link);
    if (home.secondaryCta) {
      await expect(page.locator('.home-hero').getByRole('link', { name: home.secondaryCta.label })).toHaveAttribute(
        'href',
        home.secondaryCta.link
      );
    }
  });

  test('the typed headline is fully rendered on the server', async ({ page }) => {
    await page.goto('/');
    const visual = await page.locator('.tagline__visual').innerText();
    expect(visual.replace(/\s+/g, ' ').trim()).toBe(`${home.tagline.line1} ${home.tagline.line2}`);
  });

  test('tells the story in order: manifesto, disciplines, selected work, photography, about', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#manifesto-title')).toHaveText(home.manifesto.heading);

    const disciplines = page.locator('.disciplines .card__link');
    await expect(disciplines).toHaveCount(3);
    await expect(disciplines.nth(0)).toHaveAttribute('href', '/projects/graphic-design/');
    await expect(disciplines.nth(0)).toHaveText(work.disciplines.graphicDesign.title);
    await expect(disciplines.nth(1)).toHaveAttribute('href', '/projects/uiux/');
    await expect(disciplines.nth(2)).toHaveAttribute('href', '/photography/');

    const expected = featured(publishedProjects());
    const cards = page.locator('.selected-work').getByTestId('work-card');
    await expect(cards).toHaveCount(expected.length);
    for (const [i, p] of expected.entries()) {
      await expect(cards.nth(i).locator('a.card__link')).toHaveAttribute('href', `/projects/${p.id}/`);
    }

    const strip = page.locator('.photo-strip__link');
    await expect(strip).toHaveCount(Math.min(5, featured(publishedPhotos(), 5).length));
    await expect(strip.first()).toHaveAttribute('href', '/photography/');

    await expect(page.locator('#about-teaser-title')).toHaveText(home.about.heading);
    await expect(page.locator('main [data-next-step]')).toHaveCount(1);
  });

  test('the hero reel previews work the page doesn’t show yet, out of the way of assistive tech', async ({ page }) => {
    await page.goto('/');
    const projects = publishedProjects();
    const photos = publishedPhotos();
    const picks = reelPicks(projects, featured(projects), photos, featured(photos, 5).slice(0, 5));
    test.skip(picks.length < 3, 'too little work for a reel');
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
