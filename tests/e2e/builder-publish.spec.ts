import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext, Page } from '@playwright/test';
import { DRAFT_BRANCH, PREVIEW_CHECK, REPO, TEST_CHECK } from '../../src/builder/persist/types';
import { createFakeGithub, fakeAccount, FAKE_TOKEN, routeFakeGithub, type FakeGithub } from './fake-github';
import { expect, test } from './fixtures';
import { publishedProjects } from './content';

/**
 * Saving and publishing, against a fake GitHub that holds real state and refuses
 * what GitHub refuses. The site's own files go in, so a save is checked line by
 * line against the real YAML. Only the live sign-in can't be tested here.
 */
const HOME = 'src/content/pages/home/index.yaml';
const ABOUT = 'src/content/pages/about/index.yaml';

test.use({ viewport: { width: 1600, height: 950 } });

async function siteFiles(request: APIRequestContext) {
  const { files, images } = (await (await request.get('/admin/builder/site.json')).json()) as {
    files: Record<string, string>;
    images: Record<string, string>;
  };
  const pictures = Object.keys(images).map((path) => [path, new Uint8Array([1, 2, 3])] as const);
  return { ...files, ...Object.fromEntries(pictures) };
}

async function githubWith(request: APIRequestContext, options: Partial<Parameters<typeof createFakeGithub>[0]> = {}) {
  return createFakeGithub({ files: await siteFiles(request), instantChecks: true, ...options });
}

async function openBuilder(page: Page, fake: FakeGithub) {
  await routeFakeGithub(page, fake);
  await page.addInitScript((account) => localStorage.setItem('sveltia-cms.user', account), fakeAccount());
  await page.goto('/admin/builder/');
  await page.waitForFunction(() => !document.querySelector('.canvas__status') && document.querySelector('.overlay'));
}

async function editStatement(page: Page, text: string) {
  await page.getByRole('tab', { name: 'Layers' }).click();
  await page.locator('.layer__name', { hasText: 'Big statement' }).click();
  await page.getByLabel('Statement', { exact: true }).fill(text);
}

const save = (page: Page) => page.getByRole('button', { name: 'Save draft' }).click();
const preview = (page: Page) => page.getByRole('link', { name: 'Preview' });
const publish = (page: Page) => page.getByRole('button', { name: 'Publish' });

/** Lines that differ between two versions of a file. */
const changedLines = (before: string, after: string) => {
  const a = before.replaceAll('\r\n', '\n').split('\n');
  const b = after.replaceAll('\r\n', '\n').split('\n');
  return { lengthDelta: b.length - a.length, lines: b.filter((line, i) => line !== a[i]) };
};

test.describe('saving', () => {
  test('a save opens a draft, and changes one line of one file', async ({ page, request }) => {
    const fake = await githubWith(request);
    const before = fake.read(REPO.main, HOME)!;
    await openBuilder(page, fake);
    await editStatement(page, 'A brand new statement.');
    await expect(page.getByText('Unsaved changes, kept on this computer')).toBeVisible();

    await save(page);
    await expect(preview(page)).toBeVisible();

    const pull = fake.pulls().at(-1)!;
    expect(pull.draft).toBe(true);
    expect(pull.head).toBe(DRAFT_BRANCH);
    expect(fake.read(REPO.main, HOME), 'the live site is untouched').toBe(before);
    const { lengthDelta, lines } = changedLines(before, fake.read(DRAFT_BRANCH, HOME)!);
    expect(lengthDelta).toBe(0);
    expect(lines).toEqual(['    heading: A brand new statement.']);
  });

  test('a second save adds to the same draft', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'First.');
    await save(page);
    await expect(preview(page)).toBeVisible();
    await page.getByLabel('Statement', { exact: true }).fill('Second.');
    await save(page);
    await expect(page.getByText('Draft saved')).toBeVisible();
    expect(fake.pulls()).toHaveLength(1);
    expect(fake.read(DRAFT_BRANCH, HOME)).toContain('heading: Second.');
  });

  test('a page that breaks a rule won’t save, and says what to fix', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await page.getByRole('tab', { name: 'Layers' }).click();
    await page.getByRole('button', { name: 'Move About teaser up' }).click();
    await save(page);
    await expect(page.getByRole('heading', { name: 'Fix these to save' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pages end by sending people somewhere/ }).first()).toBeVisible();
    expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
    expect(fake.log(REPO.main)).toHaveLength(1);
  });

  test('a new page saves as a new file', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await page.getByRole('tab', { name: 'Pages' }).click();
    await page.getByLabel('Page name').fill('Client stories');
    await page.getByRole('button', { name: 'Add page' }).click();
    await save(page);
    await expect(preview(page)).toBeVisible();
    const file = fake.read(DRAFT_BRANCH, 'src/content/pages/client-stories/index.yaml')!;
    expect(file).toContain('title: Client stories');
    expect(file).toContain('type: page-header');
    expect(file).toContain('type: cta-band');
  });

  test('showing a page in the menu changes only the menu', async ({ page, request }) => {
    const fake = await githubWith(request);
    const path = 'src/content/site/site.yaml';
    const before = fake.read(REPO.main, path)!;
    await openBuilder(page, fake);
    await page.getByRole('tab', { name: 'Pages' }).click();
    await page.getByLabel('Page name').fill('Clients');
    await page.getByRole('button', { name: 'Add page' }).click();
    await page.getByLabel('Show this page in the menu').check();
    await save(page);
    await expect(preview(page)).toBeVisible();
    const after = fake.read(DRAFT_BRANCH, path)!;
    expect(after).toContain('href: /clients/');
    // Three lines in the middle of the menu, and nothing else moved.
    expect(after.split('\n').length - before.split('\n').length).toBe(3);
    expect(after.indexOf('label: Clients')).toBeLessThan(after.indexOf('label: Contact'));
  });

  test('a case study’s edit touches only its block, and adds no ids to the file', async ({ page, request }) => {
    const project = publishedProjects().find((p) => p.data.blocks.some((b) => b.type === 'text' && b.heading))!;
    const path = `src/content/projects/${project.id}/index.yaml`;
    const fake = await githubWith(request);
    const before = fake.read(REPO.main, path)!;
    await openBuilder(page, fake);
    await page.getByRole('tab', { name: 'Pages' }).click();
    await page.getByRole('button', { name: project.data.title, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.canvas__status'));
    await page.getByRole('tab', { name: 'Layers' }).click();
    const index = project.data.blocks.findIndex((b) => b.type === 'text' && b.heading);
    await page.locator('.layer__name').nth(index).click();
    await page.getByLabel('Chapter heading').fill('A better heading');
    await save(page);
    await expect(preview(page)).toBeVisible();
    const after = fake.read(DRAFT_BRANCH, path)!;
    const { lengthDelta, lines } = changedLines(before, after);
    expect(lengthDelta).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('A better heading');
    expect(after).not.toMatch(/^\s*-?\s*id: /m);
  });

  test('an image goes up with the save, and the canvas shows it straight away', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await page.getByRole('tab', { name: 'Pages' }).click();
    await page.getByLabel('Page name').fill('Gallery notes');
    await page.getByRole('button', { name: 'Add page' }).click();
    await page.getByRole('tab', { name: 'Add' }).click();
    await page.locator('.item', { hasText: 'Custom section' }).click();
    await expect(page.locator('.element-outline')).toHaveCount(2);
    await page.locator('.item', { hasText: 'Image' }).first().click();

    const picture = fileURLToPath(new URL('../../src/content/site/images/portrait.jpg', import.meta.url));
    await page.setInputFiles('#image-file', { name: 'My Portrait.JPG', mimeType: 'image/jpeg', buffer: readFileSync(picture) });
    await page.getByLabel('Describe the image').fill('A portrait');
    await expect
      .poll(() => page.locator('.canvas__frame').evaluate((f) => (f as HTMLIFrameElement).contentDocument!.querySelector('[data-element-type="image"] img')?.getAttribute('src')))
      .toMatch(/^blob:/);

    await save(page);
    await expect(preview(page)).toBeVisible();
    const file = fake.read(DRAFT_BRANCH, 'src/content/pages/gallery-notes/index.yaml')!;
    expect(file).toContain('image: my-portrait.jpg');
    expect(fake.read(DRAFT_BRANCH, 'src/content/pages/gallery-notes/my-portrait.jpg')).toBeDefined();
  });

  test('an image with no description won’t save', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await page.getByRole('tab', { name: 'Pages' }).click();
    await page.getByLabel('Page name').fill('Notes');
    await page.getByRole('button', { name: 'Add page' }).click();
    await page.getByRole('tab', { name: 'Add' }).click();
    await page.locator('.item', { hasText: 'Custom section' }).click();
    await expect(page.locator('.element-outline')).toHaveCount(2);
    await page.locator('.item', { hasText: 'Image' }).first().click();
    await save(page);
    await expect(page.getByRole('button', { name: /Choose an image|Add a description/ }).first()).toBeVisible();
    expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
  });
});

test.describe('publishing', () => {
  test('publish merges the draft and clears it away', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Going live.');
    await save(page);
    await expect(publish(page)).toBeEnabled();
    await publish(page).click();
    await expect(page.getByText('Everything is published')).toBeVisible();
    expect(fake.read(REPO.main, HOME)).toContain('heading: Going live.');
    expect(fake.pulls().at(-1)!.state).toBe('MERGED');
    expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
  });

  test('can’t publish over unsaved changes', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Saved.');
    await save(page);
    await expect(publish(page)).toBeVisible();
    await page.getByLabel('Statement', { exact: true }).fill('Not saved yet.');
    await expect(publish(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
  });

  test('a failed preview blocks publishing, and says the draft is safe', async ({ page, request }) => {
    const fake = await githubWith(request, { instantChecks: false });
    await openBuilder(page, fake);
    await editStatement(page, 'This won’t build.');
    await save(page);
    await expect(page.getByText('Building a preview…')).toBeVisible();
    await expect(publish(page)).toBeDisabled();

    fake.setCheck(fake.head(DRAFT_BRANCH)!, { name: PREVIEW_CHECK, status: 'completed', conclusion: 'failure' });
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('.canvas__status') && document.querySelector('.overlay'));
    await expect(page.getByRole('alert').filter({ hasText: 'The preview couldn’t be built.' })).toContainText('Your draft is safe and the live site hasn’t changed.');
    await expect(publish(page)).toBeDisabled();
    expect(fake.read(REPO.main, HOME)).not.toContain('This won’t build.');
  });

  test('failing checks warn, and take a second press', async ({ page, request }) => {
    const fake = await githubWith(request, { instantChecks: false });
    await openBuilder(page, fake);
    await editStatement(page, 'Worth a look.');
    await save(page);
    await expect(page.getByText('Building a preview…')).toBeVisible();
    const head = fake.head(DRAFT_BRANCH)!;
    fake.setCheck(head, { name: PREVIEW_CHECK, status: 'completed', conclusion: 'success' });
    fake.setCheck(head, { name: TEST_CHECK, status: 'completed', conclusion: 'failure' });
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('.canvas__status') && document.querySelector('.overlay'));
    await expect(page.getByText('The automatic checks found a problem.')).toBeVisible();
    await publish(page).click();
    expect(fake.read(REPO.main, HOME)).not.toContain('Worth a look.');
    await publish(page).click();
    await expect.poll(() => fake.read(REPO.main, HOME)).toContain('Worth a look.');
  });

  test('a CMS edit to another file doesn’t get in the way', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Mine.');
    await save(page);
    await expect(publish(page)).toBeEnabled();
    const edited = fake.read(REPO.main, ABOUT)!.replace('title: About', 'title: About me');
    fake.push(REPO.main, { [ABOUT]: edited }, 'Update About');
    await publish(page).click();
    await expect(page.getByText('Everything is published')).toBeVisible();
    expect(fake.read(REPO.main, HOME)).toContain('heading: Mine.');
    expect(fake.read(REPO.main, ABOUT)).toContain('title: About me');
  });

  test('a CMS edit to the same file is combined with mine, and undone by neither', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Mine.');
    await save(page);
    await expect(publish(page)).toBeEnabled();

    const home = fake.read(REPO.main, HOME)!;
    fake.push(REPO.main, { [HOME]: home.replace('heading: Selected work', 'heading: Sneak peek') }, 'A CMS edit');
    await publish(page).click();

    await expect(page.getByText('Your changes are combined with it')).toBeVisible();
    expect(fake.read(REPO.main, HOME), 'nothing went live yet').not.toContain('Mine.');
    await save(page);
    await expect(publish(page)).toBeEnabled();
    await publish(page).click();
    await expect(page.getByText('Everything is published')).toBeVisible();
    const live = fake.read(REPO.main, HOME)!;
    expect(live).toContain('heading: Mine.');
    expect(live).toContain('heading: Sneak peek');
  });

  test('a clash keeps the whole draft, every file of it', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Mine.');
    // A second page in the same draft, which the clash below has nothing to do with.
    await page.getByRole('tab', { name: 'Pages' }).click();
    await page.getByLabel('Page name').fill('Second page');
    await page.getByRole('button', { name: 'Add page' }).click();
    await save(page);
    await expect(publish(page)).toBeEnabled();

    const home = fake.read(REPO.main, HOME)!;
    fake.push(REPO.main, { [HOME]: home.replace('heading: Selected work', 'heading: Sneak peek') }, 'A CMS edit');
    await publish(page).click();
    await expect(page.getByText('Your changes are combined with it')).toBeVisible();

    await save(page);
    await expect(publish(page)).toBeEnabled();
    expect(fake.read(DRAFT_BRANCH, HOME)).toContain('heading: Mine.');
    expect(fake.read(DRAFT_BRANCH, 'src/content/pages/second-page/index.yaml')).toContain('title: Second page');
  });

  test('when both change the same thing, it says so and keeps mine', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Mine.');
    await save(page);
    await expect(publish(page)).toBeEnabled();
    const home = fake.read(REPO.main, HOME)!;
    const theirs = home.replace(/heading: Design isn.*/, 'heading: Theirs.');
    fake.push(REPO.main, { [HOME]: theirs }, 'A CMS edit');
    await publish(page).click();
    await expect(page.getByText('Someone changed the same thing on the live site.')).toBeVisible();
    await page.getByRole('button', { name: 'Keep my version' }).click();
    await save(page);
    await expect(publish(page)).toBeEnabled();
    expect(fake.read(DRAFT_BRANCH, HOME)).toContain('heading: Mine.');
  });

  test('discarding a draft leaves the live site as it was', async ({ page, request }) => {
    const fake = await githubWith(request);
    const before = fake.read(REPO.main, HOME);
    await openBuilder(page, fake);
    await editStatement(page, 'Changed my mind.');
    await save(page);
    await expect(publish(page)).toBeEnabled();
    await page.getByRole('button', { name: 'Discard draft' }).click();
    await expect(page.getByText('Everything is published')).toBeVisible();
    expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
    expect(fake.read(REPO.main, HOME)).toBe(before);
    expect(fake.pulls().at(-1)!.state).toBe('CLOSED');
  });
});

test.describe('keeping work safe', () => {
  test('unsaved work survives a reload', async ({ page, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Don’t lose this.');
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('.canvas__status') && document.querySelector('.overlay'));
    await expect(page.getByText('Your unsaved changes are back.')).toBeVisible();
    await expect
      .poll(() => page.locator('.canvas__frame').evaluate((f) => (f as HTMLIFrameElement).contentDocument!.querySelector('.manifesto__title')?.textContent))
      .toBe('Don’t lose this.');
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
  });

  test('a saved draft picks up where it left off, on any computer', async ({ page, browser, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Saved here.');
    await save(page);
    await expect(publish(page)).toBeEnabled();

    const elsewhere = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    await openBuilder(elsewhere, fake);
    await expect(publish(elsewhere)).toBeEnabled();
    await expect
      .poll(() => elsewhere.locator('.canvas__frame').evaluate((f) => (f as HTMLIFrameElement).contentDocument!.querySelector('.manifesto__title')?.textContent))
      .toBe('Saved here.');
    await elsewhere.close();
  });

  test('a second tab is told to use the first', async ({ page, context, request }) => {
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    const second = await context.newPage();
    await routeFakeGithub(second, fake);
    await second.goto('/admin/builder/');
    await expect(second.getByRole('heading', { name: 'The builder is open in another tab' })).toBeVisible();
    await second.close();
  });
});

test.describe('being a step behind', () => {
  const builtFrom = async (page: Page, commit: string) => {
    await page.route('**/admin/builder/', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/<meta name="built-from"[^>]*>/, `<meta name="built-from" content="${commit}">`);
      await route.fulfill({ response, body });
    });
  };

  test('says so when the live site hasn’t caught up with main', async ({ page, request }) => {
    const fake = await githubWith(request);
    await builtFrom(page, 'an-older-commit');
    await openBuilder(page, fake);
    await expect(page.getByText('The site was updated moments ago.')).toBeVisible();
  });

  test('says nothing when this builder came from main', async ({ page, request }) => {
    const fake = await githubWith(request);
    await builtFrom(page, fake.head(REPO.main)!);
    await openBuilder(page, fake);
    await expect(page.locator('.overlay')).toBeAttached();
    await expect(page.getByText('The site was updated moments ago.')).toHaveCount(0);
  });
});

test.describe('access', () => {
  test('an account that can’t push is told why, and can’t save', async ({ page, request }) => {
    const fake = await githubWith(request, { permission: 'READ' });
    await openBuilder(page, fake);
    await expect(page.getByText('This account can look but can’t save.')).toBeVisible();
    await editStatement(page, 'Trying anyway.');
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  test('the token only ever goes to GitHub', async ({ page, request }) => {
    const fake = await githubWith(request);
    const leaks: string[] = [];
    page.on('request', async (r) => {
      const hasToken = JSON.stringify(await r.allHeaders()).includes(FAKE_TOKEN) || r.url().includes(FAKE_TOKEN) || (r.postData() ?? '').includes(FAKE_TOKEN);
      if (hasToken && !r.url().startsWith('https://api.github.com/')) leaks.push(r.url());
    });
    await openBuilder(page, fake);
    await editStatement(page, 'Secret.');
    await save(page);
    await expect(preview(page)).toBeVisible();
    expect(leaks).toEqual([]);
  });
});

test.describe('the Content-Security-Policy', () => {
  /** astro preview doesn't read public/_headers, so the header goes on here. */
  const withPolicy = async (page: Page) => {
    const headers = readFileSync(fileURLToPath(new URL('../../public/_headers', import.meta.url)), 'utf8').replaceAll('\r\n', '\n');
    const policy = /^\/admin\/builder\/\n\s+Content-Security-Policy: (.+)$/m.exec(headers)![1];
    await page.route('**/admin/builder/', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
    });
  };

  test('lets the builder run, with nothing refused', async ({ page, request }) => {
    const refused: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) refused.push(m.text().slice(0, 240));
    });
    await withPolicy(page);
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    await editStatement(page, 'Under policy.');
    await save(page);
    await expect(preview(page)).toBeVisible();
    expect(refused).toEqual([]);
  });

  test('keeps the page’s canvas working under it', async ({ page, request }) => {
    await withPolicy(page);
    const fake = await githubWith(request);
    await openBuilder(page, fake);
    expect(await page.locator('.canvas__frame').evaluate((f) => (f as HTMLIFrameElement).contentDocument!.querySelector('h1')?.className)).toBe('tagline');
  });
});
