import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { allRoutes, publishedProjects, site } from './content';

const ORIGIN = 'https://peachless.design';

const graph = async (page: Page) => {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => JSON.parse(text)['@graph'] ?? []) as Record<string, any>[];
};
const node = (nodes: Record<string, any>[], type: string) => nodes.find((n) => n['@type'] === type);

test('every page has its own title, a description, a canonical URL and a share image', async ({ page }) => {
  const titles = new Map<string, string>();
  for (const path of allRoutes()) {
    await page.goto(path);
    const title = await page.title();
    expect(titles.get(title), `${path} repeats the title of ${titles.get(title)}`).toBeUndefined();
    titles.set(title, path);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S{3,}/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`^${ORIGIN}/`));
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`^${ORIGIN}/`));
  }
});

test('home describes the site and the person behind it', async ({ page }) => {
  await page.goto('/');
  const nodes = await graph(page);
  expect(node(nodes, 'WebSite')).toMatchObject({ name: site().siteName, url: `${ORIGIN}/` });
  const person = node(nodes, 'Person');
  expect(person).toMatchObject({ name: site().ownerName, url: `${ORIGIN}/about/` });
  expect(person!.image).toMatch(new RegExp(`^${ORIGIN}/_astro/`));
});

test('about describes the same person', async ({ page }) => {
  await page.goto('/about/');
  expect(node(await graph(page), 'Person')).toMatchObject({ '@id': `${ORIGIN}/#person`, name: site().ownerName });
});

test('each project describes the work and its place in the site', async ({ page }) => {
  for (const project of publishedProjects()) {
    const url = `${ORIGIN}/projects/${project.id}/`;
    await page.goto(`/projects/${project.id}/`);
    const nodes = await graph(page);
    expect(node(nodes, 'CreativeWork'), project.id).toMatchObject({ name: project.data.title, url });
    const crumbs = node(nodes, 'BreadcrumbList')!.itemListElement;
    expect(crumbs.map((c: any) => c.item)).toEqual([`${ORIGIN}/`, `${ORIGIN}/projects/`, url]);
    expect(crumbs.at(-1).name).toBe(project.data.title);
  }
});
