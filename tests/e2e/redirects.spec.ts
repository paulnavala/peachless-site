import { test, expect } from '@playwright/test';

const cases = [
  ['/uiux', '/projects/uiux'],
  ['/projects/ui-ux', '/projects/uiux'],
  ['/projects/graphic-design', '/projects/logo-design'],
  ['/home', '/'],
];

for (const [from, to] of cases) {
  test(`redirects ${from} -> ${to}`, async ({ page }) => {
    await page.goto(from);
    await page.waitForURL(`**${to === '/' ? '/' : to}`);
    expect(new URL(page.url()).pathname.replace(/\/$/, '') || '/').toBe(to);
  });
}
