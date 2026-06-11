import { test, expect } from '@playwright/test';

test.describe('/projects/uiux', () => {
  test('renders all three projects with case-study links', async ({ page }) => {
    await page.goto('/projects/uiux');
    await expect(page.locator('#portfolio-uiux .project')).toHaveCount(3);
    await expect(page.locator('#portfolio-uiux [data-count]')).toContainText('3');
    await expect(
      page.locator('.project [data-internal-link]').first()
    ).toHaveAttribute('href', '/projects/cern');
  });

  test('filter pills narrow the list', async ({ page }) => {
    await page.goto('/projects/uiux');
    const pill = page.locator('.portfolio__filters .pill[data-filter="cern"]');
    await pill.click();
    await expect(pill).toHaveClass(/is-active/);
    await expect(page.locator('#portfolio-uiux .project:visible')).toHaveCount(1);
  });

  test('modal opens with Figma embed and closes on Escape', async ({ page }) => {
    await page.goto('/projects/uiux');
    await page.locator('[data-action="open-modal"]').first().click();
    const modal = page.locator('#portfolio-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.portfolio-modal__iframe')).toHaveAttribute(
      'src',
      /figma\.com\/embed/
    );
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });
});
