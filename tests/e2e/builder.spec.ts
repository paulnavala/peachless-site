import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * The builder, driven as an editor would. Demo mode needs no sign-in, so these
 * run against the build with nothing stubbed. builder-publish.spec.ts covers
 * saving and publishing against a fake GitHub.
 */
const PAGES: [string, string][] = [
  ['Home', '/'],
  ['About', '/about/'],
  ['Contact', '/contact/'],
  ['Photography', '/photography/'],
  ['Work', '/projects/'],
];

test.use({ viewport: { width: 1600, height: 950 } });

async function openBuilder(page: Page) {
  await page.goto('/admin/builder/');
  await page.waitForFunction(() => !document.querySelector('.canvas__status') && document.querySelector('.overlay'));
}

async function openPage(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Pages' }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.canvas__status'));
}

/** Runs in the frame's document. Locators can't reach into a sandboxed frame. */
async function inFrame<T, A = undefined>(page: Page, fn: (doc: Document, arg: A) => T, arg?: A): Promise<T> {
  const doc = await page.locator('.canvas__frame').evaluateHandle((frame) => (frame as HTMLIFrameElement).contentDocument!);
  return (await doc.evaluate(fn as never, arg as never)) as T;
}

const number = (page: Page, label: string) => page.locator('.control--number', { hasText: label }).locator('input');

/** Adds a custom section after the first section, and brings it to the top of the canvas. */
async function addCustomSection(page: Page) {
  await page.getByRole('tab', { name: 'Layers' }).click();
  await page.locator('.layer__name').first().click();
  await page.getByRole('tab', { name: 'Add' }).click();
  await page.locator('.item', { hasText: 'Custom section' }).last().click();
  await expect(page.locator('.element-outline')).toHaveCount(2);
  await page.locator('.canvas').evaluate((canvas) => {
    const tag = document.querySelector('.tag--selected')!;
    canvas.scrollTop += tag.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 60;
  });
  await expect(page.locator('.element-outline').first()).toBeInViewport();
}

/** Selects the first element outlined in the selected section. */
async function selectFirstElement(page: Page) {
  const box = (await page.locator('.element-outline').first().boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 12);
  await expect(page.locator('.selected--element')).toBeVisible();
  return box;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
  }
  await page.mouse.up();
}

test.describe('the canvas', () => {
  test('shows the real page, in a sandbox with no scripts', async ({ page }) => {
    await openBuilder(page);
    const frame = page.locator('.canvas__frame');
    await expect(frame).toHaveAttribute('sandbox', 'allow-same-origin');
    expect(await inFrame(page, (doc) => doc.querySelector('h1')?.className)).toBe('tagline');
    expect(await inFrame(page, (doc) => doc.documentElement.classList.contains('reveal-on'))).toBe(false);
  });

  for (const [name, path] of PAGES) {
    test(`matches the build exactly on ${name}`, async ({ page }) => {
      await openBuilder(page);
      await openPage(page, name);
      const { canvas, built } = await page.evaluate(async (url) => {
        const frame = document.querySelector<HTMLIFrameElement>('.canvas__frame')!;
        const html = await (await fetch(url)).text();
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const serialise = (main: Element) => {
          const copy = main.cloneNode(true) as Element;
          copy.querySelectorAll('script, style').forEach((node) => node.remove());
          return copy.innerHTML.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
        };
        return { canvas: serialise(frame.contentDocument!.querySelector('main')!), built: serialise(parsed.querySelector('main')!) };
      }, path);
      expect(canvas).toBe(built);
    });
  }

  test('renders at a true device width', async ({ page }) => {
    await openBuilder(page);
    for (const [device, width] of [['Tablet', 768], ['Phone', 390], ['Desktop', 1440]] as const) {
      await page.getByRole('button', { name: device, exact: true }).click();
      await expect.poll(() => page.locator('.canvas__frame').evaluate((f) => (f as HTMLIFrameElement).contentWindow!.innerWidth)).toBe(width);
    }
  });

  test('scrolls the page when the editor scrolls', async ({ page }) => {
    await openBuilder(page);
    await page.locator('.canvas').evaluate((canvas) => (canvas.scrollTop = 500));
    await expect.poll(() => page.locator('.canvas__frame').evaluate((f) => (f as HTMLIFrameElement).contentWindow!.scrollY)).toBeGreaterThan(400);
  });

  test('a hostile script in content can’t run or reach the parent', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Layers' }).click();
    await page.locator('.layer__name').nth(1).click();
    const payload = '<img src=x onerror="parent.document.title=\'pwned\'">';
    await page.getByLabel('Note beside it').fill(payload);
    await page.waitForTimeout(400);
    expect(await page.title()).not.toBe('pwned');
    expect(await inFrame(page, (doc) => doc.querySelector('.manifesto__lead img') !== null)).toBe(true);
  });
});

test.describe('sections', () => {
  test('selecting one shows crop marks, its form and its toolbar', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Layers' }).click();
    await page.locator('.layer__name').nth(1).click();
    await expect(page.locator('.selected .crop')).toHaveCount(4);
    await expect(page.locator('.panel-title')).toHaveText('Big statement');
    await expect(page.getByRole('toolbar', { name: 'Big statement section' })).toBeVisible();
  });

  test('editing a field updates the page as you type', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Layers' }).click();
    await page.locator('.layer__name').nth(1).click();
    await page.getByLabel('Statement', { exact: true }).fill('A new statement of intent.');
    await expect.poll(() => inFrame(page, (doc) => doc.querySelector('.manifesto__title')?.textContent)).toBe('A new statement of intent.');
  });

  test('a field left empty leaves the page, and comes back when filled', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Layers' }).click();
    await page.locator('.layer__name').nth(2).click();
    await page.getByLabel('Introduction').fill('');
    await expect.poll(() => inFrame(page, (doc) => doc.querySelectorAll('[data-section-type="deck"] [data-field="intro"]').length)).toBe(0);
    await page.getByLabel('Introduction').fill('Back again');
    await expect.poll(() => inFrame(page, (doc) => doc.querySelector('[data-section-type="deck"] [data-field="intro"]')?.textContent)).toBe('Back again');
  });

  test('the Layers panel moves a section, and the page follows', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Layers' }).click();
    const order = () => inFrame(page, (doc) => [...doc.querySelectorAll('main > [data-section]')].map((el) => el.getAttribute('data-section-type')));
    const before = await order();
    await page.getByRole('button', { name: 'Move What I do up' }).click();
    await expect.poll(order).toEqual([before[0], before[1], before[3], before[2], ...before.slice(4)]);
  });

  test('hiding a section takes it off the page, and undo brings it back', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Layers' }).click();
    const count = () => inFrame(page, (doc) => doc.querySelectorAll('[data-section-type="disciplines"]').length);
    await page.getByRole('button', { name: 'Hide What I do' }).click();
    await expect.poll(count).toBe(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(count).toBe(1);
  });

  test('only offers sections this page can take', async ({ page }) => {
    await openBuilder(page);
    await openPage(page, 'About');
    await page.getByRole('tab', { name: 'Add' }).click();
    const names = await page.locator('.item__name').allTextContents();
    expect(names).toContain('Custom section');
    expect(names).toContain('Selected work');
    expect(names).not.toContain('About teaser');
    expect(names).not.toContain('Photo gallery');
    expect(names).not.toContain('Hero');
  });

  test('the Checks panel names a broken page rule and goes to it', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Move About teaser up' }).click();
    await page.getByRole('tab', { name: /Checks/ }).click();
    await page.getByRole('button', { name: /Pages end by sending people somewhere/ }).click();
    await expect(page.locator('.panel-title')).toHaveText('Photo strip');
  });
});

test.describe('custom sections', () => {
  test('a new one arrives with real elements and column guides', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    await expect(page.locator('.guide')).toHaveCount(12);
    expect(await inFrame(page, (doc) => doc.querySelector('[data-section-type="grid"] .grid-heading')?.textContent)).toBe('A heading of your own');
  });

  test('dragging an element snaps it to the columns', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    const box = await selectFirstElement(page);
    await expect(number(page, 'Column')).toHaveValue('1');
    const column = await page.locator('.guide').nth(1).boundingBox();
    const first = await page.locator('.guide').nth(0).boundingBox();
    const step = column!.x - first!.x;
    await drag(page, { x: box.x + 20, y: box.y + 12 }, { x: box.x + 20 + step * 4.2, y: box.y + 12 });
    await expect(number(page, 'Column')).toHaveValue('5');
    expect(await inFrame(page, (doc) => doc.querySelector<HTMLElement>('[data-element="heading"]')?.style.getPropertyValue('--col'))).toBe('5');
  });

  test('a drag is one step of undo, however long it took', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    const box = await selectFirstElement(page);
    await drag(page, { x: box.x + 20, y: box.y + 12 }, { x: box.x + 320, y: box.y + 12 });
    await expect(number(page, 'Column')).not.toHaveValue('1');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(number(page, 'Column')).toHaveValue('1');
  });

  test('dragging onto another element moves it down, and brings it back if you keep going', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    const box = await selectFirstElement(page);
    const rowOf = (id: string) =>
      inFrame(page, (doc, element) => doc.querySelector<HTMLElement>(`[data-element="${element}"]`)?.style.getPropertyValue('--row'), id);
    expect(await rowOf('text')).toBe('3');

    await page.mouse.move(box.x + 20, box.y + 12);
    await page.mouse.down();
    // Down onto the text element, which makes way...
    await page.mouse.move(box.x + 20, box.y + 90, { steps: 8 });
    await expect.poll(() => rowOf('text')).not.toBe('3');
    // ...then back up, and it returns.
    await page.mouse.move(box.x + 20, box.y + 12, { steps: 8 });
    await expect.poll(() => rowOf('text')).toBe('3');
    await page.mouse.up();
  });

  test('resizing from a handle changes its width', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    await selectFirstElement(page);
    const east = (await page.locator('.handle--e').boundingBox())!;
    await drag(page, { x: east.x + 6, y: east.y + 6 }, { x: east.x - 130, y: east.y + 6 });
    await expect(number(page, 'Width')).toHaveValue('4');
    await expect(number(page, 'Column')).toHaveValue('1');
  });

  test('drags land in the right place at a smaller scale', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await openBuilder(page);
    await addCustomSection(page);
    const box = await selectFirstElement(page);
    const step = (await page.locator('.guide').nth(1).boundingBox())!.x - (await page.locator('.guide').nth(0).boundingBox())!.x;
    await drag(page, { x: box.x + 20, y: box.y + 12 }, { x: box.x + 20 + step * 3, y: box.y + 12 });
    await expect(number(page, 'Column')).toHaveValue('4');
  });

  test('every drag has a keyboard and a number equivalent', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    await selectFirstElement(page);
    await page.keyboard.press('ArrowRight');
    await expect(number(page, 'Column')).toHaveValue('2');
    await number(page, 'Width').fill('5');
    await number(page, 'Width').press('Tab');
    await expect.poll(() => inFrame(page, (doc) => doc.querySelector<HTMLElement>('[data-element="heading"]')?.style.getPropertyValue('--w'))).toBe('5');
  });

  test('double-clicking text edits it where it sits', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    const box = await selectFirstElement(page);
    await page.mouse.dblclick(box.x + 40, box.y + 20);
    await expect(page.locator('.text-editor')).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Typed on the page');
    await page.keyboard.press('Enter');
    await expect(page.locator('.text-editor')).toHaveCount(0);
    expect(await inFrame(page, (doc) => doc.querySelector('[data-section-type="grid"] .grid-heading')?.textContent)).toBe('Typed on the page');
  });

  test('Escape abandons an edit in place', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    const box = await selectFirstElement(page);
    await page.mouse.dblclick(box.x + 40, box.y + 20);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Never mind');
    await page.keyboard.press('Escape');
    expect(await inFrame(page, (doc) => doc.querySelector('[data-section-type="grid"] .grid-heading')?.textContent)).toBe('A heading of your own');
  });

  test('new elements fill the first gap', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    await page.locator('.item', { hasText: 'Quote' }).first().click();
    await expect(number(page, 'Column')).toHaveValue('7');
    await expect(number(page, 'Row')).toHaveValue('1');
  });

  test('on a phone it stacks, and offers phone controls instead of a grid', async ({ page }) => {
    await openBuilder(page);
    await addCustomSection(page);
    await selectFirstElement(page);
    await page.getByRole('button', { name: 'Phone', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'On phones' })).toBeVisible();
    await expect(page.locator('.handle')).toHaveCount(0);
    await expect(page.locator('.guide')).toHaveCount(0);
    await page.getByLabel('Hide on phones').check();
    await expect.poll(() => inFrame(page, (doc) => doc.querySelector('[data-element="heading"]')?.hasAttribute('data-phone-hidden'))).toBe(true);
  });
});

test.describe('pages', () => {
  test('a new page opens on a real shell with a title and a way on', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Pages' }).click();
    await page.getByLabel('Page name').fill('Client stories');
    await page.getByRole('button', { name: 'Add page' }).click();
    await expect.poll(() => inFrame(page, (doc) => doc.querySelector('main h1')?.textContent)).toBe('Client stories');
    expect(await inFrame(page, (doc) => doc.querySelector('.site-header') !== null)).toBe(true);
    await page.getByRole('tab', { name: /Checks/ }).click();
    await expect(page.getByText('This page is ready to publish.')).toBeVisible();
  });

  test('won’t take an address the site already uses', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Pages' }).click();
    await page.getByLabel('Page name').fill('Admin');
    await expect(page.getByText('already in use')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add page' })).toBeDisabled();
  });
});

test.describe('accessibility of the builder itself', () => {
  test('passes axe', async ({ page }) => {
    await openBuilder(page);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('iframe').analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('a narrow window gets a plain explanation', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    await page.goto('/admin/builder/');
    await expect(page.getByText('The builder needs a wider window')).toBeVisible();
  });
});
