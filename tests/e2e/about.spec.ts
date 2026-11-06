import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { test, expect } from './fixtures';
import { TOOL_LABELS } from '../../src/lib/content-schema';
import { site, toolsInUse } from './content';

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

  test('lists the tools in use, each opening its Made with page', async ({ page }) => {
    await page.goto('/about/');
    const tools = page.locator('.about-tools a');
    await expect(tools).toHaveCount(toolsInUse().length);
    for (const [i, { tool, count }] of toolsInUse().entries()) {
      await expect(tools.nth(i)).toHaveAttribute('href', `/projects/tools/${tool}/`);
      await expect(tools.nth(i)).toContainText(TOOL_LABELS[tool]);
      await expect(tools.nth(i).locator('.chip__count')).toHaveText(String(count));
    }
  });

  test('How I work and Experience appear only once they have entries', async ({ page }) => {
    await page.goto('/about/');
    const steps = about.process ?? [];
    const experience = about.experience ?? [];
    await expect(page.locator('.about-steps li')).toHaveCount(steps.length);
    await expect(page.locator('#about-process')).toHaveCount(steps.length ? 1 : 0);
    await expect(page.locator('.about-experience li')).toHaveCount(experience.length);
    await expect(page.locator('#about-experience')).toHaveCount(experience.length ? 1 : 0);
  });

  test('the résumé is linked from About and Contact, once there is one', async ({ page }) => {
    const { resume } = site();
    for (const path of ['/about/', '/contact/']) {
      await page.goto(path);
      const links = page.locator('main a[download]');
      await expect(links, path).toHaveCount(resume ? 1 : 0);
      if (resume) await expect(links, path).toHaveAttribute('href', resume);
    }
  });
});
