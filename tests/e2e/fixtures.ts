import { test as base, expect } from '@playwright/test';

/**
 * Every spec imports `test` from here. The real contact-form endpoint is
 * blocked by default — each submission would email the site owner. Specs that
 * exercise the form register their own `page.route` stub, which wins because
 * later routes take precedence.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://api.web3forms.com/**', (route) => route.abort());
    await use(page);
  },
});

export { expect };
