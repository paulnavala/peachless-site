import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * The builder's canvas is the real built page in a sandboxed, script-free frame:
 * with no server, nothing else can show the real components. The parent writes
 * to it, measures it and scrolls it, and the frame stays passive, because WebKit
 * won't deliver a parent's listeners to a frame without allow-scripts. These
 * specs pin what that design depends on, in every engine.
 */

interface FrameOptions {
  src?: string;
  width?: number;
  height?: number;
  id?: string;
}

async function openFrame(page: Page, { src = '/about/', width = 1440, height = 900, id = 'canvas' }: FrameOptions = {}) {
  await page.evaluate(
    async ({ src, width, height, id }) => {
      const frame = document.createElement('iframe');
      frame.id = id;
      frame.setAttribute('sandbox', 'allow-same-origin');
      frame.style.cssText = `display:block;border:0;width:${width}px;height:${height}px`;
      frame.src = src;
      document.body.append(frame);
      // Polled, not a load listener: WebKit's load events for sandboxed frames
      // aren't reliable.
      const deadline = performance.now() + 20_000;
      while (performance.now() < deadline) {
        const doc = frame.contentDocument;
        if (doc && doc.URL !== 'about:blank' && doc.readyState === 'complete') return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Frame ${src} never became ready`);
    },
    { src, width, height, id }
  );
}

test.beforeEach(async ({ page }) => {
  // Any same-origin document will host the frame; the builder's page does later.
  await page.goto('/this-page-does-not-exist/');
  await page.evaluate(() => document.body.replaceChildren());
});

test('the parent can read a frame that never fired a load event for it', async ({ page }) => {
  await openFrame(page);
  const h1 = await page.evaluate(() => {
    const doc = document.querySelector<HTMLIFrameElement>('#canvas')!.contentDocument!;
    return doc.querySelector('h1')!.textContent;
  });
  expect(h1?.length).toBeGreaterThan(0);
});

test('none of the page’s own scripts run, so it shows its final state', async ({ page }) => {
  await openFrame(page, { src: '/' });
  const classes = await page.evaluate(() => {
    const doc = document.querySelector<HTMLIFrameElement>('#canvas')!.contentDocument!;
    return doc.documentElement.className;
  });
  expect(classes).not.toContain('img-fade');
  expect(classes).not.toContain('reveal-on');
});

test('a hostile handler in content can’t run', async ({ page }) => {
  await openFrame(page);
  const fired = await page.evaluate(async () => {
    const doc = document.querySelector<HTMLIFrameElement>('#canvas')!.contentDocument!;
    doc.body.insertAdjacentHTML(
      'beforeend',
      `<img src="/nothing.png" onerror="parent.document.title='pwned'"><script>parent.document.title='pwned'<\/script>`
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    return document.title === 'pwned';
  });
  expect(fired).toBe(false);
});

test('media queries follow the frame, so device widths are real', async ({ page }) => {
  await openFrame(page, { src: '/', width: 390, id: 'phone' });
  await openFrame(page, { src: '/', width: 1440, id: 'desktop' });
  const matches = await page.evaluate(() =>
    ['phone', 'desktop'].map((id) => {
      const view = document.querySelector<HTMLIFrameElement>(`#${id}`)!.contentWindow!;
      return { innerWidth: view.innerWidth, tablet: view.matchMedia('(min-width: 48em)').matches };
    })
  );
  expect(matches).toEqual([
    { innerWidth: 390, tablet: false },
    { innerWidth: 1440, tablet: true },
  ]);
});

test('the site’s fonts load in the frame', async ({ page }) => {
  await openFrame(page, { src: '/' });
  const loaded = await page.evaluate(async () => {
    const doc = document.querySelector<HTMLIFrameElement>('#canvas')!.contentDocument!;
    await doc.fonts.ready;
    return [...doc.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replaceAll('"', ''));
  });
  expect(loaded.some((family) => family.startsWith('Inter'))).toBe(true);
  expect(loaded.some((family) => family.startsWith('Cormorant'))).toBe(true);
});

test('the parent can write to the page and measure the result', async ({ page }) => {
  await openFrame(page);
  const widths = await page.evaluate(() => {
    const doc = document.querySelector<HTMLIFrameElement>('#canvas')!.contentDocument!;
    const h1 = doc.querySelector('h1')!;
    const inline = doc.createElement('span');
    inline.textContent = 'x';
    h1.replaceChildren(inline);
    const short = inline.getBoundingClientRect().width;
    inline.textContent = 'a much longer heading';
    return { short, long: inline.getBoundingClientRect().width };
  });
  expect(widths.short).toBeGreaterThan(0);
  expect(widths.long).toBeGreaterThan(widths.short);
});

test('the parent can scroll the frame', async ({ page }) => {
  await openFrame(page, { src: '/', height: 700 });
  const scrolled = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('#canvas')!;
    frame.contentWindow!.scrollTo(0, 600);
    return frame.contentWindow!.scrollY;
  });
  expect(scrolled).toBe(600);
});

test('an injected sheet hides the scrollbar and freezes motion without !important', async ({ page }) => {
  await openFrame(page, { src: '/' });
  const after = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('#canvas')!;
    const doc = frame.contentDocument!;
    const animated = () => [...doc.querySelectorAll('*')].filter((el) => getComputedStyle(el).animationName !== 'none').length;
    const before = animated();
    const style = doc.createElement('style');
    // :is() takes its strongest argument's specificity, so this outranks every
    // rule on the site without !important (the style guard forbids it).
    style.textContent = `
      html { scrollbar-width: none; scrollbar-gutter: auto; }
      html::-webkit-scrollbar { display: none; }
      :is(#canvas-frozen, *), :is(#canvas-frozen, *)::before, :is(#canvas-frozen, *)::after {
        animation: none; transition: none; scroll-behavior: auto;
      }`;
    doc.head.append(style);
    return { before, moving: animated(), width: doc.documentElement.clientWidth, frame: frame.clientWidth };
  });
  expect(after.before).toBeGreaterThan(0);
  expect(after.moving).toBe(0);
  // reset.css reserves a scrollbar gutter, which would narrow a 390 view on Windows.
  expect(after.width).toBe(after.frame);
});

test('scaling the frame leaves the layout alone and coordinates map back', async ({ page }) => {
  await openFrame(page, { src: '/', width: 1440 });
  const result = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('#canvas')!;
    const doc = frame.contentDocument!;
    const scale = 0.6;
    const h1 = doc.querySelector('h1')!;
    const before = h1.getBoundingClientRect();
    frame.style.transformOrigin = '0 0';
    frame.style.transform = `scale(${scale})`;
    const after = h1.getBoundingClientRect();
    const outer = frame.getBoundingClientRect();
    // A point on the page, in the parent's coordinates, mapped back into the frame.
    const parentX = outer.left + (after.left + after.width / 2) * scale;
    const parentY = outer.top + (after.top + after.height / 2) * scale;
    const hit = doc.elementFromPoint((parentX - outer.left) / scale, (parentY - outer.top) / scale);
    return {
      sameLayout: before.width === after.width && before.left === after.left,
      viewport: frame.contentWindow!.innerWidth,
      outerWidth: outer.width,
      hitInsideHeading: !!hit && h1.contains(hit),
    };
  });
  expect(result.sameLayout).toBe(true);
  expect(result.viewport).toBe(1440);
  expect(result.outerWidth).toBeCloseTo(864, 0);
  expect(result.hitInsideHeading).toBe(true);
});

test('a section can be cloned from one frame into another with its scoped styles', async ({ page }) => {
  await openFrame(page, { src: '/about/', id: 'target' });
  await openFrame(page, { src: '/projects/', id: 'source' });
  const result = await page.evaluate(() => {
    const docOf = (id: string) => document.querySelector<HTMLIFrameElement>(`#${id}`)!.contentDocument!;
    const source = docOf('source').querySelector('.cta-band')!;
    const target = docOf('target');
    const clone = target.importNode(source, true) as HTMLElement;
    target.querySelector('main')!.prepend(clone);
    const view = target.defaultView!;
    return {
      inDocument: target.contains(clone),
      paddingTop: view.getComputedStyle(clone).paddingTop,
      sourcePaddingTop: docOf('source').defaultView!.getComputedStyle(source).paddingTop,
    };
  });
  expect(result.inDocument).toBe(true);
  expect(result.paddingTop).toBe(result.sourcePaddingTop);
});

test('islands show their server-rendered markup without hydrating', async ({ page }) => {
  await openFrame(page, { src: '/contact/', id: 'contact' });
  await openFrame(page, { src: '/photography/', id: 'photos' });
  const result = await page.evaluate(() => {
    const docOf = (id: string) => document.querySelector<HTMLIFrameElement>(`#${id}`)!.contentDocument!;
    return {
      formFields: docOf('contact').querySelectorAll('form input, form textarea').length,
      photos: docOf('photos').querySelectorAll('.pg-masonry img').length,
      stillIslands: docOf('contact').querySelectorAll('astro-island[ssr]').length,
    };
  });
  expect(result.formFields).toBeGreaterThan(0);
  expect(result.photos).toBeGreaterThan(0);
  expect(result.stillIslands).toBeGreaterThan(0);
});
