import { test, expect } from './fixtures';
import { hiddenProjects, nextOf, publishedProjects } from './content';
import { storyChapters, TOC_MIN_CHAPTERS } from '../../src/lib/chapters';

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

    test(`/projects/${project.id}/ has chapters, its own colour and its device frames`, async ({ page }) => {
      await page.goto(`/projects/${project.id}/`);
      const article = page.locator('article.project');
      await expect(article).toHaveAttribute('style', project.data.accent ? /--project-tint:\s*#[0-9a-f]{6}/i : /--project-tint:/);

      // Every headed block is an anchored chapter; three or more get a list.
      const chapters = storyChapters(project.data.blocks);
      for (const c of chapters) await expect(page.locator(`main [id="${c.id}"] h2`).first()).toHaveText(c.title);
      const toc = page.locator('.project-toc a');
      if (chapters.length >= TOC_MIN_CHAPTERS) {
        await expect(toc).toHaveCount(chapters.length);
        for (const [i, c] of chapters.entries()) await expect(toc.nth(i)).toHaveAttribute('href', `#${c.id}`);
      } else {
        await expect(toc).toHaveCount(0);
      }

      for (const block of project.data.blocks) {
        if (block.type === 'gallery' && block.frame && block.frame !== 'none') {
          await expect(page.locator(`.gallery-block--${block.frame} .device--${block.frame}`)).toHaveCount(block.images.length);
        }
        if (block.type === 'prototype' && block.frame && block.frame !== 'none') {
          await expect(page.locator(`[data-prototype].proto--${block.frame} .device--${block.frame}`)).toHaveCount(1);
        }
      }
    });
  }

  const phoneGallery = publishedProjects().find((p) => p.data.blocks.some((b) => b.type === 'gallery' && b.frame === 'phone'));
  test('a phone gallery is a keyboard-scrollable rail on small screens', async ({ page }) => {
    test.skip(!phoneGallery, 'no phone gallery');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${phoneGallery!.id}/`);
    const rail = page.locator('.gallery-block__rail').first();
    await rail.scrollIntoViewIfNeeded();
    await expect(rail).toHaveAttribute('tabindex', '0');
    await rail.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });

  for (const project of hiddenProjects()) {
    test(`hidden /projects/${project.id}/ has no page`, async ({ page }) => {
      const response = await page.goto(`/projects/${project.id}/`);
      expect(response?.status()).toBe(404);
    });
  }
});
