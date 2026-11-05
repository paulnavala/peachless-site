import { test, expect } from './fixtures';
import { TOOLS, TOOL_LABELS, type Tool } from '../../src/lib/content-schema';
import { workView } from '../../src/lib/project-order';
import { hiddenProjects, publishedProjects, readYaml, toolRoutes, toolsInUse } from './content';

const work = readYaml('pages', 'work.yaml');
const projects = publishedProjects();
const byDiscipline = (d: string) => projects.filter((p) => p.data.disciplines.includes(d));
const { large, compact } = workView(projects);

test.describe('Work index', () => {
  test('lists every published project, in order, large cards before small tiles', async ({ page }) => {
    await page.goto('/projects/');
    await expect(page.locator('h1')).toHaveText(work.heading);
    const cards = page.getByTestId('work-card');
    await expect(cards).toHaveCount(projects.length);
    for (const [i, p] of [...large, ...compact].entries()) {
      const link = cards.nth(i).locator('a.card__link');
      await expect(link).toHaveText(p.data.title);
      await expect(link).toHaveAttribute('href', `/projects/${p.id}/`);
    }
  });

  test('filter chips are links, with the current view marked', async ({ page }) => {
    await page.goto('/projects/');
    const chips = page.locator('.filter-chips__row--kinds a');
    await expect(chips).toHaveCount(3);
    await expect(chips.first()).toHaveAttribute('aria-current', 'page');
    await expect(chips.nth(1)).toHaveAttribute('href', '/projects/uiux/');
    await expect(chips.nth(2)).toHaveAttribute('href', '/projects/graphic-design/');
    // One pill, in the current chip: it slides between the filtered pages.
    await expect(page.locator('.filter-chips .chip__indicator')).toHaveCount(1);
    await expect(page.locator('.filter-chips a[aria-current="page"] .chip__indicator')).toHaveCount(1);
  });

  test('each card invites a visit without adding words to its link', async ({ page }) => {
    await page.goto('/projects/');
    await expect(page.locator('.project-card__cta')).toHaveCount(large.length);
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

  test('Graphic design leads with projects that are graphic design alone', async ({ page }) => {
    await page.goto('/projects/graphic-design/');
    const only = byDiscipline('graphic-design').filter((p) => p.data.disciplines.length === 1);
    const shared = byDiscipline('graphic-design').filter((p) => p.data.disciplines.length > 1);
    const view = workView([...only, ...shared]);
    const links = await page.locator('a.card__link').evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    expect(links).toEqual([...view.large, ...view.compact].map((p) => `/projects/${p.id}/`));
  });

  test('small tiles sit in their own section, and each still opens its project', async ({ page }) => {
    await page.goto('/projects/');
    test.skip(compact.length === 0, 'no small tiles in the content');
    await expect(page.locator('#work-logos-title')).toHaveText(work.logos.heading);
    const tiles = page.locator('.work-tiles').getByTestId('work-card');
    await expect(tiles).toHaveCount(compact.length);
    for (const [i, p] of compact.entries()) {
      const tile = tiles.nth(i);
      await expect(tile.locator('h3 a.card__link')).toHaveAttribute('href', `/projects/${p.id}/`);
      await expect(tile.locator('.project-card__summary')).toHaveCount(0);
      // The morph into the project page.
      await expect(tile.locator('.work-media')).toHaveAttribute('style', new RegExp(`--vt:\\s*work-${p.id}`));
      await expect(tile.locator('.work-title')).toHaveAttribute('style', new RegExp(`--vt-title:\\s*work-title-${p.id}`));
    }
  });

  test('photography is its own section, not a filter of these projects', async ({ page }) => {
    await page.goto('/projects/');
    await expect(page.locator('.filter-chips a[href="/photography/"]')).toHaveCount(0);
    await page.goto('/photography/');
    await expect(page.locator('.filter-chips')).toHaveCount(0);
  });

  test('the Made with line lists every tool in use, in order, with its count', async ({ page }) => {
    await page.goto('/projects/');
    const tools = page.locator('.filter-chips__row--tools a');
    test.skip(toolsInUse().length < 2, 'one tool alone is no choice');
    await expect(tools).toHaveCount(toolsInUse().length);
    for (const [i, { tool, count }] of toolsInUse().entries()) {
      await expect(tools.nth(i)).toHaveAttribute('href', `/projects/tools/${tool}/`);
      await expect(tools.nth(i)).toContainText(TOOL_LABELS[tool]);
      await expect(tools.nth(i).locator('.chip__count')).toHaveText(String(count));
    }
  });

  for (const { tool, count } of toolsInUse()) {
    const path = `/projects/tools/${tool}/`;
    test(`${path} shows only the projects made with it, with one current filter`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveText(`Made with ${TOOL_LABELS[tool]}`);
      const expected = projects.filter((p) => p.data.tools?.includes(tool));
      expect(expected).toHaveLength(count);
      await expect(page.getByTestId('work-card')).toHaveCount(count);
      for (const p of expected) await expect(page.locator(`a.card__link[href="/projects/${p.id}/"]`)).toBeVisible();
      await expect(page.locator('.filter-chips a[aria-current]')).toHaveCount(1);
      await expect(page.locator('.filter-chips__row--tools a[aria-current="page"]')).toHaveAttribute('href', path);
      await expect(page.locator('.filter-chips .chip__indicator')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${path}$`));
    });
  }

  test('a tool no published project uses has no page', async ({ request }) => {
    const used = new Set<string>(toolsInUse().map((t) => t.tool));
    for (const tool of TOOLS.filter((t: Tool) => !used.has(t))) {
      expect((await request.get(`/projects/tools/${tool}/`)).status(), tool).toBe(404);
    }
  });

  test('a case study links each of its tools to that tool\'s page', async ({ page }) => {
    for (const p of projects.filter((x) => x.data.tools?.length)) {
      await page.goto(`/projects/${p.id}/`);
      for (const tool of p.data.tools ?? []) {
        await expect(page.locator(`.project-credits a[href="/projects/tools/${tool}/"]`), `${p.id} ${tool}`).toHaveText(TOOL_LABELS[tool as Tool]);
      }
    }
  });

  test('/projects/logo-design/ is an alias page pointing search engines at graphic-design', async ({ page }) => {
    const response = await page.goto('/projects/logo-design/');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/projects/logo-design/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/projects\/graphic-design\/$/);
    await expect(page.getByTestId('work-card')).toHaveCount(byDiscipline('graphic-design').length);
  });

  test('hidden projects appear on no listing', async ({ page }) => {
    for (const path of ['/', '/projects/', '/projects/graphic-design/', '/projects/uiux/', ...toolRoutes()]) {
      await page.goto(path);
      for (const p of hiddenProjects()) {
        await expect(page.locator(`a[href^="/projects/${p.id}"]`), `${path} links ${p.id}`).toHaveCount(0);
      }
    }
  });

  test('every Work view ends with a next step', async ({ page }) => {
    for (const path of ['/projects/', '/projects/graphic-design/', '/projects/uiux/', ...toolRoutes()]) {
      await page.goto(path);
      await expect(page.locator('main [data-next-step]')).toHaveCount(1);
    }
  });
});
