import { test, expect } from './fixtures';
import { REDIRECTS } from '../../redirects.config.mjs';

// Locally `astro preview` serves Astro's meta-refresh pages; on Cloudflare the
// same table is answered by public/_redirects with real 301s.
for (const [from, to] of Object.entries(REDIRECTS)) {
  for (const source of [from, `${from}/`]) {
    test(`${source} leads to ${to}`, async ({ page }) => {
      await page.goto(source);
      await page.waitForURL((url) => url.pathname === to);
      const response = await page.request.get(to);
      expect(response.status()).toBe(200);
    });
  }
}

for (const path of ['/projects/graphic-design/', '/projects/logo-design/', '/projects/uiux/']) {
  test(`${path} is a page, not a redirect`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe(path);
  });
}
