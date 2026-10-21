import { test, expect } from './fixtures';
import { hiddenProjects, publishedProjects, readYaml } from './content';

const work = readYaml('pages', 'work.yaml');
const projects = publishedProjects();
const byDiscipline = (d: string) => projects.filter((p) => p.data.disciplines.includes(d));

test.describe('Work index', () => {
  test('lists every published project, in order, as linked cards', async ({ page }) => {
    await page.goto('/projects/');
    await expect(page.locator('h1')).toHaveText(work.heading);
    const cards = page.getByTestId('work-card');
    await expect(cards).toHaveCount(projects.length);
    for (const [i, p] of projects.entries()) {
      const link = cards.nth(i).locator('a.card__link');
      await expect(link).toHaveText(p.data.title);
      await expect(link).toHaveAttribute('href', `/projects/${p.id}/`);
    }
  });

  test('filter chips are links, with the current view marked', async ({ page }) => {
    await page.goto('/projects/');
    const chips = page.locator('.filter-chips a');
    await expect(chips).toHaveCount(4);
    await expect(chips.first()).toHaveAttribute('aria-current', 'page');
    await expect(chips.nth(3)).toHaveAttribute('href', '/photography/');
    // One pill, in the current chip: it slides between the filtered pages.
    await expect(page.locator('.filter-chips .chip__indicator')).toHaveCount(1);
    await expect(page.locator('.filter-chips a[aria-current="page"] .chip__indicator')).toHaveCount(1);
  });

  test('each card invites a visit without adding words to its link', async ({ page }) => {
    await page.goto('/projects/');
    await expect(page.locator('.project-card__cta')).toHaveCount(projects.length);
    await expect(page.locator('a.card__link .project-card__cta')).toHaveCount(0);
    for (const card of await page.getByTestId('work-card').all()) {
      await expect(card).toHaveAttribute('style', /--project-tint:/);
    }
  });

  for (const [path, discipline, title] of [
    ['/projects/graphic-design/', 'graphic-design', work.disciplines.graphicDesign.title],
    ['/projects/uiux/', 'uiux', work.disciplines.uiux.title],
  ] as const) {
    test(`${path} shows only ${discipline} projects`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveText(title);
      const expected = byDiscipline(discipline);
      await expect(page.getByTestId('work-card')).toHaveCount(expected.length);
      await expect(page.locator('.filter-chips a[aria-current="page"]')).toHaveAttribute('href', path);
      for (const p of expected) await expect(page.locator(`a.card__link[href="/projects/${p.id}/"]`)).toBeVisible();
    });
  }

  test('/projects/logo-design/ is an alias page pointing search engines at graphic-design', async ({ page }) => {
    const response = await page.goto('/projects/logo-design/');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/projects/logo-design/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/projects\/graphic-design\/$/);
    await expect(page.getByTestId('work-card')).toHaveCount(byDiscipline('graphic-design').length);
  });

  test('hidden projects appear on no listing', async ({ page }) => {
    for (const path of ['/', '/projects/', '/projects/graphic-design/', '/projects/uiux/']) {
      await page.goto(path);
      for (const p of hiddenProjects()) {
        await expect(page.locator(`a[href^="/projects/${p.id}"]`), `${path} links ${p.id}`).toHaveCount(0);
      }
    }
  });

  test('every Work view ends with a next step', async ({ page }) => {
    for (const path of ['/projects/', '/projects/graphic-design/', '/projects/uiux/']) {
      await page.goto(path);
      await expect(page.locator('main [data-next-step]')).toHaveCount(1);
    }
  });
});
