import { test, expect } from './fixtures';

// Romanian letters (ă ș ț and the cedilla forms) come from two small subset
// families, Inter RO and Cormorant Garamond RO (astro.config.mjs). A page
// fetches them only when it has those letters, and the two preloads stay the
// main faces.
const RO_LETTERS = '[ĂăȘ-țŞşŢţ]';

for (const path of ['/', '/projects/', '/projects/ton/', '/about/', '/contact/']) {
  test(`${path} draws Romanian letters in the brand fonts, fetched only when needed`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const { needed, loaded } = await page.evaluate((letters) => {
      const needed = new RegExp(letters).test(document.body.innerText);
      const loaded = [...document.fonts].filter((f) => / RO-/.test(f.family) && f.status === 'loaded').length;
      return { needed, loaded };
    }, RO_LETTERS);
    expect(loaded > 0, needed ? 'a Romanian subset is in use' : 'no Romanian subset was fetched').toBe(needed);
    await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(2);
  });
}
