import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { test, expect } from './fixtures';

const source = readFileSync(fileURLToPath(new URL('../../src/content/pages/about.md', import.meta.url)), 'utf8');
const about = parse(source.split(/^---\s*$/m)[1]);

test.describe('/about', () => {
  test('introduces the designer with portrait, statement and story, then leads on', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.locator('h1')).toHaveText(about.title);
    await expect(page.locator('.about__statement')).toHaveText(about.statement);
    await expect(page.locator('.about__portrait img')).toHaveAttribute('alt', about.portraitAlt);
    await expect(page.locator('.about__body p').first()).toBeVisible();
    await expect(page.locator('main [data-next-step] a[href="/projects/"]')).toBeVisible();
  });
});
