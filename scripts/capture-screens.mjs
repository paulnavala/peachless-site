import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2]; // e.g. https://www.peachless.design or http://localhost:4321
const outDir = process.argv[3]; // e.g. docs/reference/screens/live
const pages = [
  ['home', '/'],
  ['about', '/about'],
  ['contact', '/contact'],
  ['projects', '/projects'],
  ['uiux', '/projects/uiux'],
  ['logo-design', '/projects/logo-design'],
  ['guidelines', '/projects/guidelines'],
  ['photography', '/photography'],
];
const widths = [1440, 768, 390];

const browser = await chromium.launch();
for (const width of widths) {
  // reducedMotion: the site CSS forces reveal-on-scroll elements (elegant-footer,
  // portfolio cards, masonry items) to opacity:1 under prefers-reduced-motion, so
  // full-page captures no longer photograph them in their hidden pre-reveal state.
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
  });
  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    // Scroll through the page so IntersectionObserver reveals + lazy media fire.
    await page.evaluate(async () => {
      const step = 600;
      const height = document.body.scrollHeight;
      for (let y = 0; y <= height; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 900)); // footer reveal transition is 700ms
      window.scrollTo(0, 0);
    });
    // Wait for every <img> currently in the DOM to finish loading/decoding.
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
              })
          )
      )
    );
    // Best-effort settle: scroll-triggered embeds (Figma iframes) may keep the
    // network busy indefinitely, so don't fail the capture on this.
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500); // let reveal animations + tagline settle
    mkdirSync(`${outDir}/${width}`, { recursive: true });
    await page.screenshot({ path: `${outDir}/${width}/${name}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
console.log('captured', pages.length * widths.length, 'screenshots into', outDir);
