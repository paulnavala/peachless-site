import { test, expect } from './fixtures';
import { publishedPhotos, publishedProjects, readYaml } from './content';
import { featured } from '../../src/lib/project-order';

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
});
