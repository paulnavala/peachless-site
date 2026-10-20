import { expect, type Page } from '@playwright/test';

/**
 * Wait until the Astro island containing `selector` has hydrated — Astro drops the
 * island's `ssr` attribute once it has — so keyboard/mouse handlers are live.
 */
export async function waitForIsland(page: Page, selector: string) {
  await expect(
    page.locator('astro-island').filter({ has: page.locator(selector) }).first()
  ).not.toHaveAttribute('ssr');
}
