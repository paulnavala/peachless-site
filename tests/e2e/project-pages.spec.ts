import { test, expect } from './fixtures';
import { hiddenProjects, nextOf, publishedProjects } from './content';

test.describe('project pages', () => {
  for (const project of publishedProjects()) {
    test(`/projects/${project.id}/ tells its story and leads on`, async ({ page }) => {
      const response = await page.goto(`/projects/${project.id}/`);
      expect(response?.status()).toBe(200);

      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(project.data.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        project.data.seo?.description || project.data.summary
      );
      await expect(page.locator('.project-hero__media img')).toHaveAttribute('alt', project.data.cover.alt);

      const next = nextOf(project.id);
      if (next) {
        const link = page.getByTestId('next-project');
        await expect(link).toHaveAttribute('href', `/projects/${next.id}/`);
        await expect(link).toHaveText(next.data.title);
      }
      await expect(page.locator('main [data-next-step]')).toHaveCount(1);
    });
  }

  for (const project of hiddenProjects()) {
    test(`hidden /projects/${project.id}/ has no page`, async ({ page }) => {
      const response = await page.goto(`/projects/${project.id}/`);
      expect(response?.status()).toBe(404);
    });
  }
});
