import { test, expect } from './fixtures';
import { hiddenProjects, publishedProjects } from './content';
import { REDIRECTS } from '../../redirects.config.mjs';

test('the sitemap lists every published page and nothing else', async ({ request }) => {
  const xml = await (await request.get('/sitemap-0.xml')).text();
  const urls = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));

  for (const path of ['/', '/projects/', '/projects/graphic-design/', '/projects/uiux/', '/photography/', '/about/', '/contact/']) {
    expect(urls.has(path), path).toBe(true);
  }
  for (const p of publishedProjects()) expect(urls.has(`/projects/${p.id}/`), p.id).toBe(true);
  for (const p of hiddenProjects()) expect(urls.has(`/projects/${p.id}/`), p.id).toBe(false);
  expect(urls.has('/projects/logo-design/')).toBe(false);
  for (const from of Object.keys(REDIRECTS)) expect(urls.has(`${from}/`), from).toBe(false);
});
