// Full-page reference screenshots of every page type at three widths.
//
//   node scripts/capture-screens.mjs <base-url> <out-dir>
//   node scripts/capture-screens.mjs http://localhost:4321 docs/reference/screens/v2
//
// docs/reference/screens/v2/ is the signed-off look of the v2 redesign; recapture
// and compare after visual changes. v1-parity/ holds the retired v1 contract.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2]?.replace(/\/$/, '');
const outDir = process.argv[3];
if (!base || !outDir) {
  console.error('usage: node scripts/capture-screens.mjs <base-url> <out-dir>');
  process.exit(1);
}

const pages = [
  ['home', '/'],
  ['work', '/projects/'],
  ['work-graphic-design', '/projects/graphic-design/'],
  ['work-uiux', '/projects/uiux/'],
  ['project-peachless', '/projects/peachless/'], // logo, palette and brand-book blocks
  ['project-ton', '/projects/ton/'], // prototype block
  ['photography', '/photography/'],
  ['about', '/about/'],
  ['contact', '/contact/'],
  ['404', '/this-page-does-not-exist/'],
];
const widths = [1440, 768, 390];

const browser = await chromium.launch();
for (const width of widths) {
  // Reduced motion: base styles are the final state, so every reveal is
  // already in place and the tagline is fully typed.
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: 'load' });
    // Headless Chromium hides scrollbars but would still reserve the stable
    // gutter, leaving a blank strip down the right edge of every capture.
    await page.addStyleTag({ content: 'html { scrollbar-gutter: auto; }' });
    // Scroll through the page so lazy images load.
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    // Some lazy images never come into view on their own (the home reel's
    // tiles past its clipped edge), so load every image now, and never wait
    // longer than 15s for them.
    await page.evaluate(() => {
      for (const img of document.images) img.loading = 'eager';
      const loaded = Promise.all([
        document.fonts.ready,
        ...Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })),
      ]);
      return Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 15_000))]);
    });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400); // header condense + island hydration settle
    mkdirSync(`${outDir}/${width}`, { recursive: true });
    await page.screenshot({ path: `${outDir}/${width}/${name}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
console.log('captured', pages.length * widths.length, 'screenshots into', outDir);
