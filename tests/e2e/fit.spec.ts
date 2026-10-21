import type { Locator } from '@playwright/test';
import { test, expect } from './fixtures';
import { publishedPhotos, publishedProjects } from './content';
import { waitForIsland } from './utils';

/**
 * Fit and finish (v2.3): every element fits wherever the content lands. Each
 * check sits at a width (or window height) where the layout once broke, and
 * reads its cases from the content files, so it holds as projects change.
 */
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const projects = publishedProjects();
const withBlock = (type: string, frames?: string[]) =>
  projects.filter((p) => p.data.blocks.some((b) => b.type === type && (!frames || frames.includes(b.frame ?? 'none'))));

/** How many items sit on each visual row, top to bottom (by vertical centre). */
const rows = (items: Locator) =>
  items.evaluateAll((els) => {
    const mids = els.map((e) => {
      const r = e.getBoundingClientRect();
      return Math.round((r.top + r.bottom) / 2);
    });
    const lines: number[] = [];
    for (const m of mids) if (!lines.some((l) => Math.abs(l - m) <= 2)) lines.push(m);
    return lines.map((l) => mids.filter((m) => Math.abs(l - m) <= 2).length);
  });

/** Lines of text an element is set in. */
const lineCount = (el: Locator) =>
  el.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top))).size;
  });

const rect = (el: Locator) => el.evaluate((node) => node.getBoundingClientRect().toJSON() as DOMRect);

const openViewer = async (page: import('@playwright/test').Page, id: string) => {
  await page.goto(`/projects/${id}/`);
  await page.locator('.gv-thumbs').scrollIntoViewIfNeeded();
  await waitForIsland(page, '.gv-thumbs');
  await page.locator('.gv-thumb').first().click();
  await expect(page.locator('.gv-dialog')).toHaveAttribute('open', '');
};

test.describe('wide screens (1440)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of ['/projects/', '/projects/graphic-design/', '/projects/uiux/']) {
    test(`${path}: a lone last card keeps the 4:3 cover`, async ({ page }) => {
      await page.goto(path);
      const lone = page.locator('.work-grid__lone .project-card__media');
      test.skip((await lone.count()) === 0, 'no lone card on this page');
      const { width, height } = await rect(lone);
      expect(Math.abs(width / height - 4 / 3)).toBeLessThan(0.02);
    });
  }

  test('the footer: link columns end on the right edge, the legal row is one line', async ({ page }) => {
    await page.goto('/projects/');
    const main = await rect(page.locator('.site-footer__main'));
    const last = await rect(page.locator('.site-footer__col').last());
    expect(Math.abs(last.right - main.right)).toBeLessThanOrEqual(1);
    expect(await rows(page.locator('.site-footer__legal > *'))).toEqual([3]);
  });

  test('summaries are never cut short', async ({ page }) => {
    for (const path of ['/', '/projects/']) {
      await page.goto(path);
      const clipped = await page
        .locator('.project-card__summary, .deck-card__summary')
        .evaluateAll((els) => els.filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent));
      expect(clipped, path).toEqual([]);
    }
  });

  test('cropped screenshot covers and prototype stills keep their top', async ({ page }) => {
    for (const p of projects) {
      await page.goto(`/projects/${p.id}/`);
      const positions = await page
        .locator('.project-hero__media .media--cover, .proto__frame .media--cover')
        .evaluateAll((els) => els.map((e) => getComputedStyle(e).objectPosition));
      for (const position of positions) expect(position, p.id).toBe('50% 0%');
    }
  });

  test('the photo collage ends on one line', async ({ page }) => {
    await page.goto('/');
    const items = page.locator('.photo-strip__item');
    test.skip((await items.count()) !== 5, 'the five-photo collage is not on the page');
    const lead = await rect(items.nth(0));
    const last = await rect(items.nth(4));
    expect(Math.abs(lead.bottom - last.bottom)).toBeLessThanOrEqual(1);
  });
});

test.describe('next story and contents (1024 and 1440)', () => {
  for (const width of [1024, 1440]) {
    test(`${width}px: next-story titles take at most two lines; no chapter sits alone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const p of projects) {
        await page.goto(`/projects/${p.id}/`);
        expect(await lineCount(page.locator('.next-project__title')), p.id).toBeLessThanOrEqual(2);
        const chapters = page.locator('.project-toc li');
        if ((await chapters.count()) === 0) continue;
        const perRow = await rows(chapters);
        if (perRow.length > 1) expect(perRow.at(-1), `${p.id}: ${perRow.join(' + ')}`).toBeGreaterThan(1);
      }
    });
  }
});

test.describe('phones', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the footer: each email label sits above its address', async ({ page }) => {
    await page.goto('/projects/');
    const stacked = await page.locator('.site-footer__email').evaluateAll((links) =>
      links.map((link) => {
        const label = link.querySelector('.site-footer__email-label')!.getBoundingClientRect();
        const text = [...link.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())!;
        const range = document.createRange();
        range.selectNodeContents(text);
        return range.getBoundingClientRect().top >= label.bottom - 1;
      })
    );
    expect(stacked.length).toBeGreaterThan(0);
    expect(stacked.every(Boolean)).toBe(true);
  });

  test('summaries are never cut short', async ({ page }) => {
    for (const path of ['/', '/projects/']) {
      await page.goto(path);
      const clipped = await page
        .locator('.project-card__summary, .deck-card__summary')
        .evaluateAll((els) => els.filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent));
      expect(clipped, path).toEqual([]);
    }
  });

  test('filter chips and closing links never leave one behind on a row', async ({ page }) => {
    for (const path of ['/projects/', '/photography/']) {
      await page.goto(path);
      const chips = await rows(page.locator('.filter-chips li'));
      if (chips.length > 1) expect(chips.at(-1), `${path} chips: ${chips.join(' + ')}`).toBeGreaterThan(1);
      const links = await rows(page.locator('.cta-band__actions > *'));
      if (links.length > 1) expect(links.every((n) => n === 1), `${path} links: ${links.join(' + ')}`).toBe(true);
    }
  });

  test('the contact message box opens with room for several lines', async ({ page }) => {
    await page.goto('/contact/');
    const lines = await page
      .locator('textarea')
      .evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    expect(lines).toBeGreaterThanOrEqual(5);
  });

  test('the menu opens with its brand and Close exactly over the header row', async ({ page }) => {
    await page.goto('/');
    const brand = await rect(page.locator('.site-header__brand'));
    const toggle = await rect(page.locator('[data-menu-open]'));
    await page.locator('[data-menu-open]').click();
    await expect(page.locator('.mobile-menu')).toHaveAttribute('open', '');
    const menuBrand = await rect(page.locator('.mobile-menu__brand'));
    const close = await rect(page.locator('[data-menu-close]'));
    expect(Math.abs(menuBrand.top + menuBrand.height / 2 - (brand.top + brand.height / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(close.top + close.height / 2 - (toggle.top + toggle.height / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(close.right - toggle.right)).toBeLessThanOrEqual(1);
  });

  for (const p of withBlock('guidelines')) {
    test(`${p.id}: the brand book's page list stays on screen, thumbnails pair up`, async ({ page }) => {
      await page.goto(`/projects/${p.id}/`);
      const perRow = await rows(page.locator('.gv-thumb'));
      expect(Math.max(...perRow)).toBe(2);
      await openViewer(page, p.id);
      await page.locator('.gv-menu__toggle').click();
      const list = await rect(page.locator('.gv-menu__list'));
      expect(list.left).toBeGreaterThanOrEqual(0);
      expect(list.right).toBeLessThanOrEqual(390);
    });
  }

  test('dark overlays darken the scrollbar gutter, the light menu does not', async ({ page }) => {
    await page.goto('/photography/');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__item').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-scroll-locked', 'dark');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
    await page.goto('/');
    await page.locator('[data-menu-open]').click();
    await expect(page.locator('html')).toHaveAttribute('data-scroll-locked', '');
  });
});

test.describe('the narrowest phones (320)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('stacked hero buttons share one width', async ({ page }) => {
    await page.goto('/');
    const [first, second] = await Promise.all([0, 1].map((i) => rect(page.locator('.home-hero__actions .btn').nth(i))));
    expect(second.top).toBeGreaterThan(first.top);
    expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(1);
  });

  test('the lightbox close button never shrinks', async ({ page }) => {
    await page.goto('/photography/');
    await waitForIsland(page, '.pg-masonry');
    await page.locator('.pg-masonry__item').first().click();
    const count = publishedPhotos().length;
    for (let i = 1; i <= count; i++) {
      // Paging waits for the next photo, so check the one that is showing.
      await expect(page.locator('.pg-modal__count')).toHaveText(`${i} / ${count}`);
      const { width, height } = await rect(page.locator('.pg-modal__close'));
      expect([Math.round(width), Math.round(height)], (await page.locator('.pg-modal__title').textContent()) ?? '').toEqual([44, 44]);
      if (i < count) await page.keyboard.press('ArrowRight');
    }
  });

  for (const p of withBlock('prototype', ['none', 'browser'])) {
    test(`${p.id}: the prototype's launch button sits under a small still`, async ({ page }) => {
      await page.goto(`/projects/${p.id}/`);
      const frame = await rect(page.locator('[data-proto-frame]').first());
      const button = await rect(page.locator('[data-proto-launch]').first());
      expect(button.top).toBeGreaterThanOrEqual(frame.bottom);
    });
  }
});

test.describe('the launch button over a large still (1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const p of withBlock('prototype', ['none', 'browser'])) {
    test(`${p.id}: the launch card floats over the still`, async ({ page }) => {
      await page.goto(`/projects/${p.id}/`);
      const frame = await rect(page.locator('[data-proto-frame]').first());
      const button = await rect(page.locator('[data-proto-launch]').first());
      expect(button.top).toBeGreaterThan(frame.top);
      expect(button.bottom).toBeLessThan(frame.bottom);
    });
  }
});

test.describe('palette names (768 at rest, 1024 with a chip widened)', () => {
  for (const p of withBlock('palette')) {
    test(`${p.id}: names and values stay inside their chips`, async ({ page }) => {
      const inside = () =>
        page.locator('.paint-chip').evaluateAll((chips) =>
          chips.every((chip) => {
            const c = chip.getBoundingClientRect();
            const parts = [chip.querySelector('.paint-chip__name')!, chip.querySelector('.paint-chip__copy')!];
            return parts.every((el) => el.getBoundingClientRect().right <= c.right + 0.5);
          })
        );
      await page.setViewportSize({ width: 768, height: 900 });
      await page.goto(`/projects/${p.id}/`);
      await page.locator('.paint-chip').first().hover();
      expect(await inside()).toBe(true);
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.locator('.paint-chip').first().hover();
      expect(await inside()).toBe(true);
    });
  }
});

test.describe('short windows (1280×600)', () => {
  test.use({ viewport: { width: 1280, height: 600 } });

  test('the sticky About portrait fits under the header', async ({ page }) => {
    await page.goto('/about/');
    const fits = await page.locator('.about__portrait').evaluate(
      (el) => parseFloat(getComputedStyle(el).top) + el.getBoundingClientRect().height <= innerHeight
    );
    expect(fits).toBe(true);
  });

  for (const p of withBlock('prototype', ['phone'])) {
    test(`${p.id}: the prototype phone fits the window`, async ({ page }) => {
      await page.goto(`/projects/${p.id}/`);
      const phone = await rect(page.locator('.proto__phone'));
      expect(phone.height).toBeLessThanOrEqual(600 - 64);
    });
  }

  for (const p of withBlock('guidelines')) {
    test(`${p.id}: a brand-book page fits the window`, async ({ page }) => {
      await openViewer(page, p.id);
      const image = await rect(page.locator('.gv-image'));
      expect(image.top).toBeGreaterThanOrEqual(0);
      expect(image.bottom).toBeLessThanOrEqual(600);
    });
  }
});

test('a landscape phone (740×360) still fits a whole brand-book page', async ({ page }) => {
  const book = withBlock('guidelines')[0];
  test.skip(!book, 'no published project has a guidelines block');
  await page.setViewportSize({ width: 740, height: 360 });
  await openViewer(page, book.id);
  const image = await rect(page.locator('.gv-image'));
  expect(image.bottom).toBeLessThanOrEqual(360);
});

test('a spaced dash never starts a line: it is glued to the word before', async ({ page }) => {
  for (const p of projects) {
    await page.goto(`/projects/${p.id}/`);
    const loose = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement?.closest('script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      const found: string[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const m = n.textContent!.match(/.{0,20} [—–] .{0,10}/);
        if (m) found.push(m[0]);
      }
      return found;
    });
    expect(loose, p.id).toEqual([]);
  }
});
