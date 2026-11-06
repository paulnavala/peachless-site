import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { readToken } from '../../src/builder/persist/auth';
import { DemoBackend } from '../../src/builder/persist/demo';
import { GithubBackend, pollDelay } from '../../src/builder/persist/github';
import {
  BackendError,
  DRAFT_BRANCH,
  DRAFT_PREVIEW_URL,
  PREVIEW_CHECK,
  PREVIEW_TIMEOUT_MS,
  REPO,
  TEST_CHECK,
  type DraftInfo,
  type FileChange,
} from '../../src/builder/persist/types';
import { blobOid, createFakeGithub, fakeAccount, FAKE_TOKEN, routeFakeGithub, type FakeOptions, type FakeRequest } from '../e2e/fake-github';

/**
 * The builder's whole relationship with GitHub, against a fake that holds real
 * state and refuses what GitHub refuses. A save that goes wrong here costs a
 * designer her work, or puts something on the live site she didn't mean to.
 */
const HOME = 'src/content/pages/home/index.yaml';
const ABOUT = 'src/content/pages/about/index.yaml';
const SITE = 'src/content/site/site.yaml';
const PROJECT = 'src/content/projects/blend/index.yaml';

/** A PNG's opening bytes: a NUL in there is what makes it binary. */
const image = (seed: number) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, seed]);

const files = () => ({
  [HOME]: 'title: Home\n',
  [ABOUT]: 'title: About\n',
  'src/content/pages/about/portrait.jpg': image(1),
  'src/content/pages/images/shared.webp': image(2),
  [PROJECT]: 'title: Blend\n',
  'src/content/projects/blend/logo.png': image(3),
  'src/content/projects/blend/notes.txt': 'Not an image, and not editable',
  [SITE]: 'siteName: peachless.\n',
  'src/content/site/form.yaml': 'endpoint: secret\n',
  'src/content/photos/one/index.yaml': 'title: A photo\n',
  'src/content/pages/home.yaml': 'tagline: An old singleton\n',
  '.github/workflows/ci.yml': 'name: CI\n',
});

function setup(options: Partial<FakeOptions> = {}) {
  const fake = createFakeGithub({ files: files(), ...options });
  const sleep = vi.fn(async () => undefined);
  const backend = new GithubBackend(FAKE_TOKEN, { fetch: fake.fetch, sleep });
  return { fake, backend, sleep };
}

const edit = (path: string, text: string): FileChange => ({ path, text });
const upload = (path: string, bytes: number): FileChange => ({ path, base64: 'A'.repeat(bytes) });

const graphqlCalls = (requests: FakeRequest[]) => requests.filter(({ url }) => url.endsWith('/graphql'));

const calling = (name: string) => (request: FakeRequest) => (request.body ?? '').includes(name);

async function caught(work: Promise<unknown>): Promise<BackendError> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(BackendError);
  return error as BackendError;
}

/** A loaded backend with its first save made. */
async function withDraft(changes = [edit(HOME, 'title: Draft\n')], options: Partial<FakeOptions> = {}) {
  const context = setup(options);
  await context.backend.load();
  const draft = await context.backend.saveDraft(changes, 'First save', null);
  return { ...context, draft };
}

describe('load', () => {
  it('reads main when there’s no draft', async () => {
    const { fake, backend } = setup();
    const snapshot = await backend.load();

    expect(snapshot.headOid).toBe(fake.head(REPO.main));
    expect(snapshot.mainOid).toBe(fake.head(REPO.main));
    expect(snapshot.draft).toBeNull();
    expect(snapshot.canWrite).toBe(true);
    expect(snapshot.login).toBe('patricia');
  });

  it('reads the pages, the projects and the site file, and nothing else', async () => {
    const { backend } = setup();
    const snapshot = await backend.load();
    expect(Object.keys(snapshot.files).sort()).toEqual([ABOUT, HOME, PROJECT, SITE].sort());
    expect(snapshot.files[HOME]).toEqual({ path: HOME, text: 'title: Home\n', oid: blobOid('title: Home\n') });
  });

  it('lists the images beside them with their blob ids', async () => {
    const { backend } = setup();
    const { images } = await backend.load();
    expect(images).toEqual({
      'src/content/pages/about/portrait.jpg': blobOid(image(1)),
      'src/content/pages/images/shared.webp': blobOid(image(2)),
      'src/content/projects/blend/logo.png': blobOid(image(3)),
    });
  });

  it('takes two calls: GraphQL can’t pick files by name, and asking for text everywhere would read every image', async () => {
    const { fake, backend } = setup();
    await backend.load();
    expect(fake.requests).toHaveLength(2);
    expect(graphqlCalls(fake.requests)).toHaveLength(2);
  });

  it('reads the draft when there is one', async () => {
    const { backend, fake, draft } = await withDraft();
    const snapshot = await backend.load();
    expect(snapshot.headOid).toBe(fake.head(DRAFT_BRANCH));
    expect(snapshot.mainOid).toBe(fake.head(REPO.main));
    expect(snapshot.files[HOME].text).toBe('title: Draft\n');
    expect(snapshot.draft).toEqual(draft);
  });

  it('finds the commit the draft started from, even after main moved', async () => {
    const { backend, fake, draft } = await withDraft();
    fake.push(REPO.main, { [SITE]: 'siteName: changed\n' });
    fake.push(REPO.main, { [SITE]: 'siteName: again\n' });
    const snapshot = await backend.load();
    expect(snapshot.draft?.baseOid).toBe(draft.baseOid);
    expect(snapshot.mainOid).not.toBe(draft.baseOid);
  });

  it('finds that commit from a new session too, after several saves', async () => {
    const { fake, backend, draft } = await withDraft();
    const second = await backend.saveDraft([edit(HOME, 'title: Second\n')], 'Second save', draft.headOid);
    const fresh = new GithubBackend(FAKE_TOKEN, { fetch: fake.fetch });
    expect((await fresh.load()).draft).toEqual({ ...second, baseOid: draft.baseOid });
  });

  it('doesn’t take a fork’s pull request for the draft', async () => {
    const { fake, backend } = setup();
    fake.push(DRAFT_BRANCH, { [HOME]: 'title: Left behind\n' });
    fake.openForkPull(DRAFT_BRANCH);
    const snapshot = await backend.load();
    expect(snapshot.draft).toBeNull();
    expect(snapshot.files[HOME].text).toBe('title: Home\n');
  });

  it('reads main when the branch has no pull request', async () => {
    const { fake, backend } = setup();
    fake.push(DRAFT_BRANCH, { [HOME]: 'title: Left behind\n' });
    const snapshot = await backend.load();
    expect(snapshot.draft).toBeNull();
    expect(snapshot.files[HOME].text).toBe('title: Home\n');
  });

  it.each([
    ['ADMIN', true],
    ['MAINTAIN', true],
    ['WRITE', true],
    ['TRIAGE', false],
    ['READ', false],
  ] as const)('with %s permission, canWrite is %s', async (permission, canWrite) => {
    const { backend } = setup({ permission });
    expect((await backend.load()).canWrite).toBe(canWrite);
  });

  it('reads a file too long for GraphQL in full', async () => {
    const long = `title: ${'x'.repeat(600 * 1024)}\n`;
    const { backend } = setup({ files: { ...files(), [HOME]: long } });
    expect((await backend.load()).files[HOME].text).toBe(long);
  });

  it('isn’t put off if GitHub calls a path it doesn’t have an error, not an empty answer', async () => {
    const { fake } = setup();
    const strict: typeof fetch = async (input, init) => {
      const response = await fake.fetch(input, init);
      const answer = (await response.json()) as object;
      const errors = [{ type: 'NOT_FOUND', path: ['repository', 'draftPages'], message: 'Could not resolve' }];
      return new Response(JSON.stringify({ ...answer, errors }));
    };
    const snapshot = await new GithubBackend(FAKE_TOKEN, { fetch: strict }).load();
    expect(snapshot.files[HOME].text).toBe('title: Home\n');
  });

  it('copes with a repository that has no pages yet', async () => {
    const { [HOME]: _home, [ABOUT]: _about, 'src/content/pages/about/portrait.jpg': _p, 'src/content/pages/images/shared.webp': _s, 'src/content/pages/home.yaml': _h, ...rest } = files();
    const { backend } = setup({ files: rest });
    expect(Object.keys((await backend.load()).files).sort()).toEqual([PROJECT, SITE].sort());
  });
});

describe('readImage', () => {
  it('reads an image’s bytes at a commit, with a type a browser can show', async () => {
    const { fake, backend } = setup();
    const blob = await backend.readImage('src/content/projects/blend/logo.png', fake.head(REPO.main)!);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(image(3));
    expect(blob.type).toBe('image/png');
  });

  it('gives an SVG its own type, or a browser won’t draw it', async () => {
    const svg = 'src/content/projects/blend/mark.svg';
    const { fake, backend } = setup({ files: { ...files(), [svg]: '<svg/>' } });
    expect((await backend.readImage(svg, REPO.main)).type).toBe('image/svg+xml');
    expect(fake.requests.at(-1)?.headers.accept).toBe('application/vnd.github.raw+json');
  });

  it('reads from the draft, for an image only the draft has', async () => {
    const path = 'src/content/pages/home/new.png';
    const { backend, draft } = await withDraft([{ path, base64: btoa('picture') }]);
    expect(await (await backend.readImage(path, draft.headOid)).text()).toBe('picture');
  });

  it('copes with spaces in a path', async () => {
    const path = 'src/content/pages/home/my photo.png';
    const { backend } = setup({ files: { ...files(), [path]: image(4) } });
    expect((await backend.readImage(path, REPO.main)).size).toBe(image(4).length);
  });

  it('says so when it isn’t there', async () => {
    const { backend } = setup();
    const error = await caught(backend.readImage('src/content/pages/home/none.png', REPO.main));
    // Not 'network': a merge has to tell "wasn't there" from "couldn't look".
    expect(error.kind).toBe('missing');
    expect(error.message).toBe('That image couldn’t be found.');
  });
});

describe('the journey', () => {
  it('goes from a first save to the live site', async () => {
    const { fake, backend } = setup();
    const start = await backend.load();
    expect(start.draft).toBeNull();

    // The first save makes the branch and a draft pull request.
    const first = await backend.saveDraft([edit(HOME, 'title: First\n')], 'Change the home page', null);
    expect(fake.head(DRAFT_BRANCH)).toBe(first.headOid);
    expect(first.baseOid).toBe(start.mainOid);
    expect(first.prNumber).toBe(1);
    expect(first.prUrl).toBe(`https://github.com/${REPO.owner}/${REPO.name}/pull/1`);
    expect(fake.pulls()).toMatchObject([{ number: 1, draft: true, state: 'OPEN', head: DRAFT_BRANCH, base: REPO.main, title: 'Change the home page' }]);
    expect(fake.read(REPO.main, HOME)).toBe('title: Home\n');

    // The second commits on it, and opens nothing new.
    const second = await backend.saveDraft([edit(HOME, 'title: Second\n'), edit(ABOUT, 'title: Also\n')], 'And the about page', first.headOid);
    expect(second).toEqual({ ...first, headOid: fake.head(DRAFT_BRANCH) });
    expect(second.headOid).not.toBe(first.headOid);
    expect(fake.pulls()).toHaveLength(1);
    expect(fake.read(DRAFT_BRANCH, HOME)).toBe('title: Second\n');

    // A head that moved is refused and changes nothing.
    const stale = await caught(backend.saveDraft([edit(HOME, 'title: Stale\n')], 'From an old tab', first.headOid));
    expect(stale.kind).toBe('moved');
    expect(stale.message).toBe('This draft changed somewhere else, such as another tab. Reload to pick up the latest.');
    expect(fake.head(DRAFT_BRANCH)).toBe(second.headOid);

    // Main moving in a file the draft changed stops the publish.
    const theirs = fake.push(REPO.main, { [HOME]: 'title: From the CMS\n' });
    expect(await backend.publish(second, [HOME, ABOUT])).toEqual({ state: 'conflict', paths: [HOME] });
    expect(fake.head(REPO.main)).toBe(theirs);
    expect(fake.pulls()[0]).toMatchObject({ state: 'OPEN', draft: true });

    // Without an overlap it goes through, and the branch goes with it.
    fake.push(REPO.main, { [HOME]: 'title: Home\n' });
    fake.push(REPO.main, { [SITE]: 'siteName: Elsewhere\n' });
    const published = await backend.publish(second, [HOME, ABOUT]);
    expect(published).toEqual({ state: 'published', mergeOid: fake.head(REPO.main) });
    expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
    expect(fake.read(REPO.main, HOME)).toBe('title: Second\n');
    expect(fake.read(REPO.main, ABOUT)).toBe('title: Also\n');
    expect(fake.read(REPO.main, SITE)).toBe('siteName: Elsewhere\n');
    expect(fake.pulls()[0].state).toBe('MERGED');

    // After that, the next load is back on main.
    const after = await backend.load();
    expect(after.draft).toBeNull();
    expect(after.headOid).toBe(fake.head(REPO.main));

    // And a discard cleans up after itself.
    const unwanted = await backend.saveDraft([edit(HOME, 'title: Unwanted\n')], 'Second thoughts', null);
    expect(fake.pulls()).toHaveLength(2);
    await backend.discard(unwanted);
    expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
    expect(fake.pulls()[1].state).toBe('CLOSED');
    expect((await backend.load()).draft).toBeNull();
  });

  it('only ever sends the token to api.github.com, and never in a URL or a body', async () => {
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method));
    const { fake, backend } = setup();
    const start = await backend.load();
    const first = await backend.saveDraft([edit(HOME, 'title: One\n'), upload('src/content/pages/home/a.png', 400)], 'Save', null);
    const second = await backend.saveDraft([edit(HOME, 'title: Two\n')], 'Save', first.headOid);
    await backend.readImage('src/content/projects/blend/logo.png', start.headOid);
    await backend.draftStatus(second, 0);
    await caught(backend.saveDraft([edit(HOME, 'title: Stale\n')], 'Save', first.headOid));
    const { mergeOid } = (await backend.publish(second, [HOME])) as { mergeOid: string };
    await backend.liveStatus(mergeOid);
    await backend.discard(await backend.saveDraft([edit(HOME, 'title: Three\n')], 'Save', null));

    expect(fake.requests.length).toBeGreaterThan(10);
    for (const { url, headers, body } of fake.requests) {
      expect(new URL(url).origin).toBe('https://api.github.com');
      expect(url).not.toContain(FAKE_TOKEN);
      expect(body ?? '').not.toContain(FAKE_TOKEN);
      expect(headers.authorization).toBe(`token ${FAKE_TOKEN}`);
    }
    for (const spy of consoles) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE_TOKEN);
      spy.mockRestore();
    }
  });

  it('never lets a redirect carry the token elsewhere', async () => {
    const { fake } = setup();
    const send = vi.fn(fake.fetch);
    await new GithubBackend(FAKE_TOKEN, { fetch: send }).load();
    expect(send.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of send.mock.calls) expect(init?.redirect).toBe('error');
  });

  it('asks the browser to check before it reuses an answer: GitHub says to keep them for a minute', async () => {
    const { fake } = setup();
    const send = vi.fn(fake.fetch);
    await new GithubBackend(FAKE_TOKEN, { fetch: send }).draftStatus({ headOid: 'abc' } as DraftInfo, 0);
    expect(send.mock.calls[0][1]?.cache).toBe('no-cache');
  });
});

describe('saving', () => {
  describe('the first save', () => {
    it('starts from the commit the editor loaded, not main’s latest', async () => {
      const { fake, backend } = setup();
      const { mainOid } = await backend.load();
      fake.push(REPO.main, { [SITE]: 'siteName: Newer\n' });

      const draft = await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
      expect(draft.baseOid).toBe(mainOid);
      expect(fake.read(DRAFT_BRANCH, SITE)).toBe('siteName: peachless.\n');
    });

    it('so a change that reached main in between stops the publish, rather than being overwritten', async () => {
      const { fake, backend } = setup();
      await backend.load();
      fake.push(REPO.main, { [HOME]: 'title: From the CMS\n' });

      const draft = await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
      expect(await backend.publish(draft, [HOME])).toEqual({ state: 'conflict', paths: [HOME] });
    });

    it('works without a load, from main’s latest', async () => {
      const { fake, backend } = setup();
      const draft = await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
      expect(draft.baseOid).toBe(fake.log(DRAFT_BRANCH).at(-2)?.oid);
    });

    it('asks for a draft pull request, once', async () => {
      const { fake, backend } = await withDraft();
      await backend.saveDraft([edit(HOME, 'title: Again\n')], 'Save', fake.head(DRAFT_BRANCH)!);
      const opened = fake.requests.filter(({ method, url }) => method === 'POST' && url.endsWith('/pulls'));
      expect(opened).toHaveLength(1);
      expect(JSON.parse(opened[0].body!)).toMatchObject({ head: DRAFT_BRANCH, base: REPO.main, draft: true });
    });

    it('clears a branch left behind by a save that stopped early, then starts again from the top', async () => {
      const { fake, backend } = setup();
      const { mainOid } = await backend.load();
      fake.push(DRAFT_BRANCH, { [HOME]: 'title: Left behind\n', [ABOUT]: 'title: Thrown away\n' });

      const draft = await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
      expect(draft.baseOid).toBe(mainOid);
      expect(fake.read(DRAFT_BRANCH, ABOUT)).toBe('title: About\n');
      expect(fake.log(DRAFT_BRANCH).map(({ message }) => message)).toEqual(['Start', 'Save']);
    });

    it('deletes that branch rather than moving it, as a move can be refused over workflow files', async () => {
      const { fake, backend } = setup();
      await backend.load();
      fake.push(DRAFT_BRANCH, { [HOME]: 'title: Left behind\n' });
      await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
      expect(fake.requests.filter(({ method }) => method === 'PATCH')).toEqual([]);
      expect(fake.requests.filter(({ method }) => method === 'DELETE')).toHaveLength(1);
    });

    it('won’t clear a branch with an open pull request: that’s a draft made in another tab', async () => {
      const { fake, backend } = setup();
      await backend.load();
      const other = new GithubBackend(FAKE_TOKEN, { fetch: fake.fetch });
      await other.load();
      const elsewhere = await other.saveDraft([edit(HOME, 'title: Other tab\n')], 'Save', null);

      const error = await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null));
      expect(error.kind).toBe('moved');
      expect(fake.head(DRAFT_BRANCH)).toBe(elsewhere.headOid);
    });

    it('recovers when the pull request couldn’t be made: the retry starts again', async () => {
      const { fake, backend } = setup();
      await backend.load();
      const makingPull = ({ method, url }: FakeRequest) => method === 'POST' && url.endsWith('/pulls');
      fake.failNext(makingPull, 500);
      expect((await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null))).kind).toBe('network');

      const draft = await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
      expect(draft.prNumber).toBe(1);
      expect(fake.read(DRAFT_BRANCH, HOME)).toBe('title: Mine\n');
    });

    it('sends the editor to reload when the pull request was made but the answer was lost', async () => {
      const fake = createFakeGithub({ files: files() });
      const lossy: typeof fetch = async (input, init) => {
        const response = await fake.fetch(input, init);
        if (init?.method === 'POST' && String(input).endsWith('/pulls')) throw new TypeError('Failed to fetch');
        return response;
      };
      const backend = new GithubBackend(FAKE_TOKEN, { fetch: lossy });
      await backend.load();
      expect((await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null))).kind).toBe('network');

      // Their work is on the draft, and a retry mustn't throw it away.
      const head = fake.head(DRAFT_BRANCH);
      expect((await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null))).kind).toBe('moved');
      expect(fake.head(DRAFT_BRANCH)).toBe(head);
      expect((await backend.load()).files[HOME].text).toBe('title: Mine\n');
    });
  });

  describe('later saves', () => {
    it('go on top of the draft', async () => {
      const { fake, backend, draft } = await withDraft();
      await backend.saveDraft([edit(ABOUT, 'title: Next\n')], 'Next', draft.headOid);
      expect(fake.log(DRAFT_BRANCH).map(({ message }) => message)).toEqual(['Start', 'First save', 'Next']);
      expect(fake.read(DRAFT_BRANCH, HOME)).toBe('title: Draft\n');
    });

    it('spot a head that moved even if GitHub changes its wording', async () => {
      const { fake, backend, draft } = await withDraft();
      fake.push(DRAFT_BRANCH, { [ABOUT]: 'title: Another device\n' });
      fake.failNext(calling('createCommitOnBranch'), 200, { data: { createCommitOnBranch: null }, errors: [{ type: 'SOMETHING_NEW', message: 'Reworded' }] });
      expect((await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', draft.headOid))).kind).toBe('moved');
    });

    it('call a branch that’s gone a move too, so a reload puts things right', async () => {
      const { fake, backend, draft } = await withDraft();
      await new GithubBackend(FAKE_TOKEN, { fetch: fake.fetch }).discard(draft);
      expect((await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', draft.headOid))).kind).toBe('moved');
    });

    it('open a new pull request if the old one was closed but the branch stayed', async () => {
      const { fake, backend, draft } = await withDraft();
      fake.closePull(draft.prNumber);
      const next = await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', draft.headOid);
      expect(next.prNumber).toBe(2);
      expect(next.baseOid).toBe(draft.baseOid);
    });

    it('tell other failures from a move', async () => {
      const { fake, backend, draft } = await withDraft();
      fake.failNext(calling('createCommitOnBranch'), 200, { data: { createCommitOnBranch: null }, errors: [{ type: 'UNPROCESSABLE', message: 'No' }] });
      expect((await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', draft.headOid))).kind).toBe('unknown');
    });
  });

  describe('what goes in each commit', () => {
    const big = (i: number) => upload(`src/content/pages/home/${i}.png`, 900_000);

    it('puts a small save in a single commit, so it lands all at once', async () => {
      const { fake } = await withDraft([upload('src/content/pages/home/a.png', 1000), edit(HOME, 'title: Draft\n')]);
      const [, commit] = fake.log(DRAFT_BRANCH);
      expect(commit.changed.sort()).toEqual([HOME, 'src/content/pages/home/a.png'].sort());
      expect(fake.log(DRAFT_BRANCH)).toHaveLength(2);
    });

    it('sends images first, in commits of at most 2 MB, and the pages last', async () => {
      const { fake } = await withDraft([edit(HOME, 'title: Draft\n'), big(1), edit(ABOUT, 'title: Too\n'), big(2), big(3), big(4), big(5)]);
      const commits = fake.log(DRAFT_BRANCH).slice(1);
      expect(commits).toHaveLength(3);
      expect(commits.map(({ changed }) => changed.filter((path) => path.endsWith('.png')).length)).toEqual([2, 2, 1]);
      expect(commits.at(-1)?.changed).toEqual(expect.arrayContaining([HOME, ABOUT]));
      for (const commit of commits.slice(0, -1)) expect(commit.changed.every((path) => path.endsWith('.png'))).toBe(true);

      for (const { body } of graphqlCalls(fake.requests).filter(calling('createCommitOnBranch'))) {
        const { additions } = JSON.parse(body!).variables.input.fileChanges;
        const size = additions.reduce((total: number, { contents }: { contents: string }) => total + contents.length, 0);
        expect(size).toBeLessThanOrEqual(2_000_000);
      }
    });

    it('gives an image over the limit a commit of its own', async () => {
      const { fake } = await withDraft([upload('src/content/pages/home/huge.png', 3_000_000), big(1), edit(HOME, 'title: Draft\n')]);
      expect(fake.log(DRAFT_BRANCH).slice(1).map(({ changed }) => changed.length)).toEqual([1, 2]);
    });

    it('keeps every page in the same commit, however close to the limit the images are', async () => {
      const { fake } = await withDraft([upload('src/content/pages/home/a.png', 1_999_990), edit(HOME, 'title: Draft\n'), edit(ABOUT, 'title: Too\n')]);
      expect(fake.log(DRAFT_BRANCH).at(-1)?.changed.sort()).toEqual([ABOUT, HOME].sort());
    });

    it('removes files in the last commit, so nothing goes before the page stops using it', async () => {
      const { fake } = await withDraft([big(1), big(2), big(3), { path: 'src/content/pages/about/portrait.jpg', delete: true }, edit(ABOUT, 'title: No photo\n')]);
      const commits = fake.log(DRAFT_BRANCH).slice(1);
      expect(commits.at(-1)?.changed).toContain('src/content/pages/about/portrait.jpg');
      expect(commits.at(-1)?.changed).toContain(ABOUT);
      expect(fake.read(DRAFT_BRANCH, 'src/content/pages/about/portrait.jpg')).toBeUndefined();
    });

    it('only builds the last commit: the free plan runs one build at a time', async () => {
      const { fake } = await withDraft([big(1), big(2), big(3), big(4), big(5), edit(HOME, 'title: Draft\n')]);
      const messages = fake.log(DRAFT_BRANCH).slice(1).map(({ message }) => message);
      expect(messages).toEqual(['[skip ci] First save', '[skip ci] First save', 'First save']);
    });

    it('builds the last commit of a save that has only images', async () => {
      const { fake } = await withDraft([big(1), big(2), big(3)]);
      expect(fake.log(DRAFT_BRANCH).at(-1)?.message).toBe('First save');
    });

    it('builds the head, because the status follows the head', async () => {
      const { fake, draft } = await withDraft([big(1), big(2), big(3), edit(HOME, 'title: Draft\n')], { instantChecks: true });
      expect(draft.headOid).toBe(fake.head(DRAFT_BRANCH));
      const { check_runs } = JSON.parse(String(fake.handle({ method: 'GET', url: `https://api.github.com/repos/${REPO.owner}/${REPO.name}/commits/${draft.headOid}/check-runs`, headers: { authorization: `token ${FAKE_TOKEN}` } }).body));
      expect(check_runs.map(({ name }: { name: string }) => name)).toContain(PREVIEW_CHECK);
    });

    it('writes accents and curly quotes as they are', async () => {
      const text = 'title: “Hi, I’m Patricia” — ș ț ă 🍑\n';
      const { fake } = await withDraft([edit(HOME, text)]);
      expect(fake.read(DRAFT_BRANCH, HOME)).toBe(text);
    });

    it('writes a text file too long to encode in one go', async () => {
      const text = `title: ${'é'.repeat(200_000)}\n`;
      const { fake } = await withDraft([edit(HOME, text)]);
      expect(fake.read(DRAFT_BRANCH, HOME)).toBe(text);
    });

    it('splits a message with several lines into a headline and a body', async () => {
      const { fake, backend, draft } = await withDraft();
      await backend.saveDraft([edit(HOME, 'title: Next\n')], 'Headline\n\nAnd more words', draft.headOid);
      expect(fake.log(DRAFT_BRANCH).at(-1)?.message).toBe('Headline\n\nAnd more words');
    });

    it('refuses to save nothing', async () => {
      const { backend } = setup();
      await backend.load();
      const error = await caught(backend.saveDraft([], 'Empty', null));
      expect(error.message).toBe('There’s nothing new to save.');
    });

    it('refuses a change with no contents rather than wipe the file', async () => {
      const { fake, backend } = setup();
      await backend.load();
      await caught(backend.saveDraft([{ path: HOME }], 'Nothing in it', null));
      expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
    });
  });

  describe('a save that stops part-way', () => {
    const big = (i: number) => upload(`src/content/pages/home/${i}.png`, 1_500_000);
    const changes = [big(1), big(2), big(3), edit(HOME, 'title: Mine\n')];

    /** Lets the first `allowed` commits through, then fails the next. */
    function dropAfter(fake: ReturnType<typeof setup>['fake'], allowed: number) {
      let seen = 0;
      fake.failNext((request) => calling('createCommitOnBranch')(request) && seen++ === allowed, 0);
    }

    it('picks up where it left off, rather than calling its own images a move', async () => {
      const { fake, backend, draft } = await withDraft();
      dropAfter(fake, 1);
      expect((await caught(backend.saveDraft(changes, 'Save', draft.headOid))).kind).toBe('network');
      expect(fake.head(DRAFT_BRANCH)).not.toBe(draft.headOid);

      const done = await backend.saveDraft(changes, 'Save', draft.headOid);
      expect(done.headOid).toBe(fake.head(DRAFT_BRANCH));
      expect(fake.read(DRAFT_BRANCH, HOME)).toBe('title: Mine\n');
    });

    it('still refuses a head that really moved', async () => {
      const { fake, backend, draft } = await withDraft();
      dropAfter(fake, 1);
      await caught(backend.saveDraft(changes, 'Save', draft.headOid));
      fake.push(DRAFT_BRANCH, { [ABOUT]: 'title: Another device\n' });
      expect((await caught(backend.saveDraft(changes, 'Save', draft.headOid))).kind).toBe('moved');
    });

    it('starts afresh when a first save stops', async () => {
      const { fake, backend } = setup();
      const { mainOid } = await backend.load();
      dropAfter(fake, 1);
      await caught(backend.saveDraft(changes, 'Save', null));

      const draft = await backend.saveDraft(changes, 'Save', null);
      expect(draft.baseOid).toBe(mainOid);
      expect(fake.read(DRAFT_BRANCH, HOME)).toBe('title: Mine\n');
    });
  });

  describe('an account that can’t write', () => {
    it('is told so in plain words, on the first save', async () => {
      const { fake, backend } = setup({ permission: 'READ' });
      await backend.load();
      const error = await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null));
      expect(error.kind).toBe('forbidden');
      expect(error.message).toBe('This account can look but can’t save. Ask Paul for access.');
      expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
    });

    it('is told so on a later save too, rather than being told the draft moved', async () => {
      const { fake, backend, draft } = await withDraft();
      fake.setPermission('READ');
      const error = await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', draft.headOid));
      expect(error.kind).toBe('forbidden');
      expect(fake.head(DRAFT_BRANCH)).toBe(draft.headOid);
    });
  });
});

describe('draftStatus', () => {
  const now = 1_000_000_000;

  function status(run?: () => void) {
    const fake = createFakeGithub({ files: files() });
    const backend = new GithubBackend(FAKE_TOKEN, { fetch: fake.fetch, now: () => now });
    const draft = { prNumber: 1, prUrl: '', headOid: fake.head(REPO.main)!, baseOid: fake.head(REPO.main)! };
    return { fake, backend, draft, run };
  }

  const preview = (conclusion: string, rest = {}) => ({ name: PREVIEW_CHECK, status: 'completed' as const, conclusion, ...rest });
  const tests = (status: 'queued' | 'in_progress' | 'completed', conclusion: string | null = null) => ({ name: TEST_CHECK, status, conclusion });

  it('is building until Cloudflare reports: it only reports when it finishes', async () => {
    const { backend, draft } = status();
    expect(await backend.draftStatus(draft, now - 1000)).toEqual({ state: 'building', since: now - 1000 });
  });

  it('is building while only the tests have reported', async () => {
    const { fake, backend, draft } = status();
    fake.setCheck(draft.headOid, tests('completed', 'success'));
    expect((await backend.draftStatus(draft, now)).state).toBe('building');
  });

  it('is building if Cloudflare ever does report one in progress', async () => {
    const { fake, backend, draft } = status();
    fake.setCheck(draft.headOid, { name: PREVIEW_CHECK, status: 'in_progress' });
    expect((await backend.draftStatus(draft, now)).state).toBe('building');
  });

  it('is stuck once it’s taken far too long, and not before', async () => {
    const { backend, draft } = status();
    expect((await backend.draftStatus(draft, now - PREVIEW_TIMEOUT_MS)).state).toBe('building');
    const since = now - PREVIEW_TIMEOUT_MS - 1;
    expect(await backend.draftStatus(draft, since)).toEqual({ state: 'stuck', since });
  });

  it('is ready with the preview address when Cloudflare passes', async () => {
    const { fake, backend, draft } = status();
    fake.setCheck(draft.headOid, preview('success'));
    expect(await backend.draftStatus(draft, now)).toEqual({ state: 'ready', previewUrl: DRAFT_PREVIEW_URL, tests: 'running' });
  });

  it.each([
    ['in progress', tests('in_progress'), 'running'],
    ['queued', tests('queued'), 'running'],
    ['passed', tests('completed', 'success'), 'passed'],
    ['skipped', tests('completed', 'skipped'), 'passed'],
    ['failed', tests('completed', 'failure'), 'failed'],
    ['timed out', tests('completed', 'timed_out'), 'failed'],
    ['cancelled', tests('completed', 'cancelled'), 'failed'],
  ] as const)('reports tests that are %s', async (_, run, expected) => {
    const { fake, backend, draft } = status();
    fake.setCheck(draft.headOid, preview('success'));
    fake.setCheck(draft.headOid, run);
    expect(await backend.draftStatus(draft, now)).toMatchObject({ state: 'ready', tests: expected });
  });

  it('goes by the newest run of a check', async () => {
    const { fake, backend, draft } = status();
    fake.setCheck(draft.headOid, preview('failure'));
    fake.setCheck(draft.headOid, preview('success'));
    fake.setCheck(draft.headOid, tests('completed', 'failure'));
    fake.setCheck(draft.headOid, tests('completed', 'success'));
    expect(await backend.draftStatus(draft, now)).toMatchObject({ state: 'ready', tests: 'passed' });
  });

  it.each(['failure', 'timed_out', 'cancelled', 'action_required'])('has failed when Cloudflare says %s, with the raw text kept for later', async (conclusion) => {
    const { fake, backend, draft } = status();
    fake.setCheck(draft.headOid, preview(conclusion, { details_url: 'https://dash.cloudflare.com/x', output: { title: 'Build failed', summary: 'npm run build exited 1', text: 'A long log' } }));
    expect(await backend.draftStatus(draft, now)).toEqual({
      state: 'failed',
      detailsUrl: 'https://dash.cloudflare.com/x',
      details: `Cloudflare Pages: ${conclusion}\nBuild failed\nnpm run build exited 1\nA long log`,
    });
  });

  it.each([404, 422])('is still building if GitHub doesn’t know the commit yet (%i)', async (code) => {
    const { fake, backend, draft } = status();
    fake.failNext(({ url }) => url.includes('/check-runs'), code, { message: 'No commit found for SHA' });
    expect((await backend.draftStatus(draft, now)).state).toBe('building');
  });

  it('asks about the draft’s own head', async () => {
    const { fake, backend, draft } = status();
    await backend.draftStatus(draft, now);
    expect(fake.requests.at(-1)?.url).toContain(`/commits/${draft.headOid}/check-runs`);
  });
});

describe('publish', () => {
  async function ready(changes = [edit(HOME, 'title: Draft\n')], options: Partial<FakeOptions> = {}) {
    return withDraft(changes, options);
  }

  it('marks the draft ready first: GitHub won’t merge a draft', async () => {
    const { fake, backend, draft } = await ready();
    await backend.publish(draft, [HOME]);
    const calls = fake.requests.map(({ method, body }) => (body?.includes('markPullRequestReadyForReview') ? 'ready' : method));
    expect(calls.indexOf('ready')).toBeGreaterThan(-1);
    expect(calls.indexOf('PUT')).toBeGreaterThan(calls.indexOf('ready'));
  });

  it('squashes, pinned to the head it was told about', async () => {
    const { fake, backend, draft } = await ready();
    await backend.publish(draft, [HOME]);
    const merge = fake.requests.find(({ method }) => method === 'PUT');
    expect(JSON.parse(merge!.body!)).toMatchObject({ merge_method: 'squash', sha: draft.headOid });
    expect(fake.log(REPO.main)).toHaveLength(2);
  });

  it('keeps skip markers out of the message on main, or the deploy might never run', async () => {
    const big = (i: number) => upload(`src/content/pages/home/${i}.png`, 1_500_000);
    const { fake, backend, draft } = await ready([big(1), big(2), edit(HOME, 'title: Draft\n')]);
    expect(fake.log(DRAFT_BRANCH).some(({ message }) => message.startsWith('[skip ci]'))).toBe(true);

    await backend.publish(draft, [HOME]);
    const { message } = fake.log(REPO.main).at(-1)!;
    expect(message).not.toMatch(/skip/i);
    expect(message).toBe('First save (#1)\n\nPublished from the site builder.');
  });

  it('doesn’t mark it ready again on a second try', async () => {
    const { fake, backend, draft } = await ready();
    fake.blockMerge('BEHIND', 2);
    expect(await backend.publish(draft, [HOME])).toEqual({ state: 'stale' });
    expect(fake.pulls()[0].draft).toBe(false);

    expect((await backend.publish(draft, [HOME])).state).toBe('published');
    expect(fake.requests.filter(calling('markPullRequestReadyForReview'))).toHaveLength(1);
  });

  it('deletes the branch itself if the repository doesn’t', async () => {
    const { fake, backend, draft } = await ready(undefined, { deleteBranchOnMerge: false });
    await backend.publish(draft, [HOME]);
    expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
  });

  it('is published even if the branch can’t be deleted', async () => {
    const { fake, backend, draft } = await ready(undefined, { deleteBranchOnMerge: false });
    fake.failNext(({ method }) => method === 'DELETE', 500);
    expect((await backend.publish(draft, [HOME])).state).toBe('published');
  });

  it('forgets the commit it loaded, so the next draft starts from what was published', async () => {
    const { fake, backend, draft } = await ready();
    await backend.publish(draft, [HOME]);
    const next = await backend.saveDraft([edit(HOME, 'title: Next\n')], 'Next', null);
    expect(next.baseOid).toBe(fake.log(REPO.main).at(-1)?.oid);
  });

  describe('deciding what’s in the way', () => {
    it('ignores what main changed elsewhere', async () => {
      const { fake, backend, draft } = await ready();
      fake.push(REPO.main, { [ABOUT]: 'title: Theirs\n' });
      expect((await backend.publish(draft, [HOME])).state).toBe('published');
      expect(fake.read(REPO.main, ABOUT)).toBe('title: Theirs\n');
    });

    it('sees no conflict when main made the very same change', async () => {
      const { fake, backend, draft } = await ready();
      fake.push(REPO.main, { [HOME]: 'title: Draft\n' });
      expect((await backend.publish(draft, [HOME])).state).toBe('published');
    });

    it('ignores a file the draft changed and changed back', async () => {
      const { fake, backend, draft } = await ready([edit(ABOUT, 'title: Changed\n'), edit(HOME, 'title: Draft\n')]);
      const back = await backend.saveDraft([edit(ABOUT, 'title: About\n')], 'Changed my mind', draft.headOid);
      fake.push(REPO.main, { [ABOUT]: 'title: Theirs\n' });
      expect((await backend.publish(back, [HOME, ABOUT])).state).toBe('published');
      expect(fake.read(REPO.main, ABOUT)).toBe('title: Theirs\n');
    });

    it('sees a conflict in a file main removed', async () => {
      const { fake, backend, draft } = await ready();
      fake.push(REPO.main, { [HOME]: null });
      expect(await backend.publish(draft, [HOME])).toEqual({ state: 'conflict', paths: [HOME] });
    });

    it('sees a conflict in a new file main also added', async () => {
      const path = 'src/content/pages/fresh/index.yaml';
      const { fake, backend, draft } = await ready([edit(path, 'title: Mine\n')]);
      fake.push(REPO.main, { [path]: 'title: Theirs\n' });
      expect(await backend.publish(draft, [path])).toEqual({ state: 'conflict', paths: [path] });
    });

    it('sees no conflict in a new file nobody else has', async () => {
      const path = 'src/content/pages/fresh/index.yaml';
      const { backend, draft } = await ready([edit(path, 'title: Mine\n')]);
      expect((await backend.publish(draft, [path])).state).toBe('published');
    });

    it('sees a conflict in an image too', async () => {
      const path = 'src/content/projects/blend/logo.png';
      const { fake, backend, draft } = await ready([{ path, base64: btoa('mine') }]);
      fake.push(REPO.main, { [path]: image(9) });
      expect(await backend.publish(draft, [path])).toEqual({ state: 'conflict', paths: [path] });
    });

    it('names only the files that clash', async () => {
      const { fake, backend, draft } = await ready([edit(HOME, 'title: One\n'), edit(ABOUT, 'title: Two\n'), edit(SITE, 'siteName: Three\n')]);
      fake.push(REPO.main, { [ABOUT]: 'title: Theirs\n' });
      expect(await backend.publish(draft, [HOME, ABOUT, SITE])).toEqual({ state: 'conflict', paths: [ABOUT] });
    });

    it('checks GitHub’s own list of files too: the caller’s lives in one browser', async () => {
      const { fake, backend, draft } = await ready([edit(HOME, 'title: Mine\n'), edit(ABOUT, 'title: Too\n')]);
      fake.push(REPO.main, { [ABOUT]: 'title: Theirs\n' });
      expect(await backend.publish(draft, [])).toEqual({ state: 'conflict', paths: [ABOUT] });
      expect(fake.requests.filter(({ method }) => method === 'PUT')).toEqual([]);
    });

    it('adds what GitHub lists to what the caller listed', async () => {
      const { fake, backend, draft } = await ready([edit(HOME, 'title: Mine\n'), edit(ABOUT, 'title: Too\n')]);
      fake.push(REPO.main, { [HOME]: 'title: Theirs\n', [ABOUT]: 'title: Theirs too\n' });
      expect(await backend.publish(draft, [HOME])).toEqual({ state: 'conflict', paths: [HOME, ABOUT] });
    });

    it('asks once when the caller’s list is complete', async () => {
      const { fake, backend, draft } = await ready();
      const before = fake.requests.length;
      await backend.publish(draft, [HOME]);
      const reads = fake.requests.slice(before).filter(({ body }) => body?.includes('"query":"') && !body.includes('mutation'));
      expect(reads).toHaveLength(1);
    });

    it('leaves the draft a draft when there’s a conflict', async () => {
      const { fake, backend, draft } = await ready();
      fake.push(REPO.main, { [HOME]: 'title: Theirs\n' });
      await backend.publish(draft, [HOME]);
      expect(fake.pulls()[0].draft).toBe(true);
    });

    it('copes with a path that needs escaping', async () => {
      const path = 'src/content/pages/home/a "quoted" name.png';
      const { backend, draft } = await ready([{ path, base64: btoa('mine') }]);
      expect((await backend.publish(draft, [path])).state).toBe('published');
    });
  });

  describe('when the draft moved', () => {
    it('refuses to publish a head it wasn’t told about', async () => {
      const { fake, backend, draft } = await ready();
      fake.push(DRAFT_BRANCH, { [ABOUT]: 'title: Another device\n' });
      expect((await caught(backend.publish(draft, [HOME]))).kind).toBe('moved');
      expect(fake.pulls()[0]).toMatchObject({ state: 'OPEN', draft: true });
      expect(fake.requests.filter(({ method }) => method === 'PUT')).toEqual([]);
    });

    it('treats GitHub’s 409 the same way, if the head moves at the last moment', async () => {
      const { fake, backend, draft } = await ready();
      fake.failNext(({ method }) => method === 'PUT', 409, { message: 'Head branch was modified. Review and try the merge again.' });
      const error = await caught(backend.publish(draft, [HOME]));
      expect(error.kind).toBe('moved');
      expect(error.details).toContain('Head branch was modified');
    });

    it('reports a closed draft as a move', async () => {
      const { fake, backend, draft } = await ready();
      fake.closePull(draft.prNumber);
      expect((await caught(backend.publish(draft, [HOME]))).kind).toBe('moved');
    });

    it('reports a discarded draft as a move', async () => {
      const { backend, draft } = await ready();
      await backend.discard(draft);
      expect((await caught(backend.publish(draft, [HOME]))).kind).toBe('moved');
    });
  });

  describe('when GitHub answers 405', () => {
    it('is published if it was merged already, as when an answer got lost', async () => {
      const { fake, backend, draft } = await ready();
      await backend.publish(draft, [HOME]);
      const again = await backend.publish(draft, [HOME]);
      expect(again).toEqual({ state: 'published', mergeOid: fake.head(REPO.main) });
      expect(fake.log(REPO.main)).toHaveLength(2);
    });

    it('leaves a newer draft alone when an old one turns out to be published already', async () => {
      const { fake, backend, draft } = await ready();
      await backend.publish(draft, [HOME]);
      const newer = await backend.saveDraft([edit(HOME, 'title: Newer\n')], 'Newer', null);

      expect((await backend.publish(draft, [HOME])).state).toBe('published');
      expect(fake.head(DRAFT_BRANCH)).toBe(newer.headOid);
      expect(fake.pulls()[1].state).toBe('OPEN');
    });

    it('is a conflict when main changes the same file at the last moment', async () => {
      const fake = createFakeGithub({ files: files() });
      const lateChange: typeof fetch = async (input, init) => {
        if (init?.method === 'PUT') fake.push(REPO.main, { [HOME]: 'title: Just now\n' });
        return fake.fetch(input, init);
      };
      const backend = new GithubBackend(FAKE_TOKEN, { fetch: lateChange, sleep: async () => undefined });
      await backend.load();
      const draft = await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
      expect(await backend.publish(draft, [HOME])).toEqual({ state: 'conflict', paths: [HOME] });
      expect(fake.pulls()[0].state).toBe('OPEN');
    });

    it('is stale when main only needs catching up with', async () => {
      const { fake, backend, draft } = await ready();
      fake.blockMerge('BEHIND', 9);
      expect(await backend.publish(draft, [HOME])).toEqual({ state: 'stale' });
    });

    it('is stale when GitHub calls it dirty but no file clashes, so a fresh cut can settle it', async () => {
      const { fake, backend, draft } = await ready();
      fake.blockMerge('DIRTY', 9);
      expect(await backend.publish(draft, [HOME])).toEqual({ state: 'stale' });
    });

    it.each(['UNKNOWN', 'CLEAN', 'UNSTABLE', 'HAS_HOOKS', 'DRAFT'])('tries again while GitHub says %s, waiting a little longer each time', async (state) => {
      const { fake, backend, draft, sleep } = await ready();
      fake.blockMerge(state, 2);
      expect((await backend.publish(draft, [HOME])).state).toBe('published');
      expect(sleep).toHaveBeenCalledTimes(2);
      const [first, second] = sleep.mock.calls.map(([ms]: unknown[]) => ms as number);
      expect(first).toBeGreaterThan(0);
      expect(second).toBeGreaterThan(0);
    });

    it('gives up in the end, in plain words and without calling it a conflict', async () => {
      const { fake, backend, draft } = await ready();
      fake.blockMerge('UNKNOWN', 99);
      const error = await caught(backend.publish(draft, [HOME]));
      expect(error.kind).toBe('network');
      expect(error.message).toBe('GitHub needs a moment before this can go live. Try publishing again.');
      expect(error.details).toContain('Base branch was modified');
    });

    it('says so when something on GitHub is holding it back', async () => {
      const { fake, backend, draft } = await ready();
      fake.blockMerge('BLOCKED', 9);
      const error = await caught(backend.publish(draft, [HOME]));
      expect(error.kind).toBe('unknown');
      expect(error.message).toBe('GitHub is holding this back from going live. Ask Paul to take a look.');
    });
  });

  it('never touches main’s other history', async () => {
    const { fake, backend, draft } = await ready();
    const theirs = fake.push(REPO.main, { [SITE]: 'siteName: Theirs\n' });
    await backend.publish(draft, [HOME]);
    expect(fake.log(REPO.main).map(({ oid }) => oid)).toContain(theirs);
  });

  it('never uses the update-branch endpoint, which this token may be refused', async () => {
    const { fake, backend, draft } = await ready();
    fake.blockMerge('BEHIND', 9);
    await backend.publish(draft, [HOME]);
    expect(fake.requests.filter(({ url }) => url.includes('update-branch'))).toEqual([]);
  });

  it('is refused for an account that can’t write, and leaves everything as it was', async () => {
    const { fake, backend, draft } = await ready();
    fake.setPermission('READ');
    const head = fake.head(REPO.main);
    expect((await caught(backend.publish(draft, [HOME]))).kind).toBe('forbidden');
    expect(fake.head(REPO.main)).toBe(head);
    expect(fake.pulls()[0]).toMatchObject({ state: 'OPEN', draft: true });
  });
});

describe('liveStatus', () => {
  function live() {
    const fake = createFakeGithub({ files: files() });
    return { fake, backend: new GithubBackend(FAKE_TOKEN, { fetch: fake.fetch }), oid: fake.head(REPO.main)! };
  }

  it('waits until Cloudflare reports', async () => {
    const { backend, oid } = live();
    expect(await backend.liveStatus(oid)).toEqual({ state: 'waiting' });
  });

  it('waits while a run is going', async () => {
    const { fake, backend, oid } = live();
    fake.setCheck(oid, { name: PREVIEW_CHECK, status: 'in_progress' });
    expect(await backend.liveStatus(oid)).toEqual({ state: 'waiting' });
  });

  it('is live when the deploy passes', async () => {
    const { fake, backend, oid } = live();
    fake.setCheck(oid, { name: PREVIEW_CHECK, status: 'completed', conclusion: 'success' });
    expect(await backend.liveStatus(oid)).toEqual({ state: 'live' });
  });

  it('doesn’t wait for the tests, which don’t gate a deploy', async () => {
    const { fake, backend, oid } = live();
    fake.setCheck(oid, { name: PREVIEW_CHECK, status: 'completed', conclusion: 'success' });
    fake.setCheck(oid, { name: TEST_CHECK, status: 'in_progress' });
    expect(await backend.liveStatus(oid)).toEqual({ state: 'live' });
  });

  it('has failed when the deploy fails, with the raw text', async () => {
    const { fake, backend, oid } = live();
    fake.setCheck(oid, { name: PREVIEW_CHECK, status: 'completed', conclusion: 'failure', output: { title: 'Build failed' } });
    expect(await backend.liveStatus(oid)).toEqual({ state: 'failed', details: 'Cloudflare Pages: failure\nBuild failed' });
  });
});

describe('discard', () => {
  it('closes the pull request and deletes the branch', async () => {
    const { fake, backend, draft } = await withDraft();
    await backend.discard(draft);
    expect(fake.pulls()[0].state).toBe('CLOSED');
    expect(fake.head(DRAFT_BRANCH)).toBeUndefined();
  });

  it('leaves main alone', async () => {
    const { fake, backend, draft } = await withDraft();
    const head = fake.head(REPO.main);
    await backend.discard(draft);
    expect(fake.head(REPO.main)).toBe(head);
  });

  it('is fine if the branch is already gone', async () => {
    const { fake, backend, draft } = await withDraft();
    fake.failNext(({ method }) => method === 'DELETE', 422, { message: 'Reference does not exist' });
    await expect(backend.discard(draft)).resolves.toBeUndefined();
  });

  it('can be done twice, as when the first answer got lost', async () => {
    const { backend, draft } = await withDraft();
    await backend.discard(draft);
    await expect(backend.discard(draft)).resolves.toBeUndefined();
  });

  it('is refused for an account that can’t write', async () => {
    const { fake, backend, draft } = await withDraft();
    fake.setPermission('READ');
    expect((await caught(backend.discard(draft))).kind).toBe('forbidden');
    expect(fake.head(DRAFT_BRANCH)).toBe(draft.headOid);
  });

  it('won’t throw away a save it hasn’t seen', async () => {
    const { fake, backend, draft } = await withDraft();
    const elsewhere = fake.push(DRAFT_BRANCH, { [ABOUT]: 'title: Another device\n' });
    expect((await caught(backend.discard(draft))).kind).toBe('moved');
    expect(fake.head(DRAFT_BRANCH)).toBe(elsewhere);
    expect(fake.pulls()[0].state).toBe('OPEN');
  });

  it('won’t throw away a newer draft on the same branch', async () => {
    const { fake, backend, draft } = await withDraft();
    await backend.discard(draft);
    const newer = await backend.saveDraft([edit(HOME, 'title: Newer\n')], 'Newer', null);

    expect((await caught(backend.discard(draft))).kind).toBe('moved');
    expect(fake.head(DRAFT_BRANCH)).toBe(newer.headOid);
    expect(fake.pulls()[1].state).toBe('OPEN');
  });

  it('won’t pretend to discard what went live', async () => {
    const { backend, draft } = await withDraft();
    await backend.publish(draft, [HOME]);
    expect((await caught(backend.discard(draft))).kind).toBe('moved');
  });

  it('forgets the commit it loaded, so the next draft isn’t cut from an old one', async () => {
    const { fake, backend, draft } = await withDraft();
    fake.push(REPO.main, { [SITE]: 'siteName: Newer\n' });
    await backend.discard(draft);
    const next = await backend.saveDraft([edit(HOME, 'title: Next\n')], 'Next', null);
    expect(next.baseOid).toBe(fake.log(REPO.main).at(-1)?.oid);
  });
});

describe('what goes wrong', () => {
  const anything = () => true;

  it('asks an expired token to sign in again', async () => {
    const fake = createFakeGithub({ files: files() });
    const error = await caught(new GithubBackend('gho_expired', { fetch: fake.fetch }).load());
    expect(error.kind).toBe('auth');
    expect(error.message).toBe('You’ve been signed out. Sign in again to keep working.');
  });

  it('says so when GitHub can’t be reached', async () => {
    const { fake, backend } = setup();
    fake.failNext(anything, 0);
    const error = await caught(backend.load());
    expect(error.kind).toBe('network');
    expect(error.message).toBe('Couldn’t reach GitHub. Check your connection and try again.');
  });

  it('calls a refusal forbidden', async () => {
    const { fake, backend } = setup();
    fake.failNext(anything, 403, { message: 'Must have push access' });
    const error = await caught(backend.load());
    expect(error.kind).toBe('forbidden');
    expect(error.message).toBe('This account can look but can’t save. Ask Paul for access.');
    expect(error.details).toContain('Must have push access');
  });

  it.each([
    [403, { 'x-ratelimit-remaining': '0' }],
    [403, { 'retry-after': '60' }],
    [429, {}],
  ])('tells a rate limit from a refusal (%i)', async (status, headers) => {
    const { fake, backend } = setup();
    fake.failNext(anything, status, { message: 'API rate limit exceeded' }, headers);
    const error = await caught(backend.load());
    expect(error.kind).toBe('network');
    expect(error.message).toBe('GitHub asked us to slow down. Wait a few minutes and try again.');
  });

  it('tells a GraphQL rate limit from a refusal', async () => {
    const { fake, backend } = setup();
    fake.failNext(anything, 200, { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] });
    expect((await caught(backend.load())).kind).toBe('network');
  });

  it('tries a read again after a 502, once', async () => {
    const { fake, backend, sleep } = setup();
    fake.failNext(anything, 502);
    await expect(backend.load()).resolves.toBeDefined();
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after a second 502', async () => {
    const { fake, backend } = setup();
    fake.failNext(anything, 502);
    fake.failNext(anything, 502);
    expect((await caught(backend.load())).kind).toBe('network');
  });

  it('doesn’t repeat a commit: it might have landed', async () => {
    const { fake, backend, draft, sleep } = await withDraft();
    fake.failNext(calling('createCommitOnBranch'), 502);
    expect((await caught(backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', draft.headOid))).kind).toBe('network');
    expect(sleep).not.toHaveBeenCalled();
    expect(fake.requests.filter(calling('createCommitOnBranch'))).toHaveLength(2);
  });

  it('treats any server failure as worth another try', async () => {
    const { fake, backend } = setup();
    fake.failNext(anything, 503);
    expect((await caught(backend.load())).kind).toBe('network');
  });

  it('keeps the raw detail for "copy details", without the token', async () => {
    const { fake, backend } = setup();
    fake.failNext(anything, 500, { message: `Oops, token ${FAKE_TOKEN} echoed` });
    const error = await caught(backend.load());
    expect(error.details).toContain('Oops');
    expect(error.details).toContain('POST /graphql');
    expect(error.details).not.toContain(FAKE_TOKEN);
    expect(error.message).not.toContain('Oops');
  });

  it('survives an answer that isn’t JSON', async () => {
    const send = vi.fn<typeof fetch>(async () => new Response('<html>Bad gateway</html>', { status: 200 }));
    expect((await caught(new GithubBackend(FAKE_TOKEN, { fetch: send }).load())).kind).toBe('unknown');
  });

  it('says so when the repository isn’t there', async () => {
    const { fake, backend } = setup();
    fake.failNext(anything, 200, { data: { viewer: { login: 'x' }, repository: null } });
    expect((await caught(backend.load())).kind).toBe('unknown');
  });

  it('never uses a word only a developer would', async () => {
    const { fake, backend, draft } = await withDraft();
    const errors = [
      await caught(new GithubBackend('gho_expired', { fetch: fake.fetch }).load()),
      await caught(backend.saveDraft([edit(HOME, 'title: Old\n')], 'Save', 'stale')),
      await caught(backend.saveDraft([], 'Save', draft.headOid)),
      await caught(backend.readImage('none.png', REPO.main)),
    ];
    for (const status of [0, 403, 429, 500]) {
      fake.failNext(() => true, status);
      errors.push(await caught(backend.load()));
    }
    fake.blockMerge('UNKNOWN', 9);
    errors.push(await caught(backend.publish(draft, [HOME])));
    fake.blockMerge('BLOCKED', 9);
    errors.push(await caught(backend.publish(draft, [HOME])));

    expect(errors).toHaveLength(10);
    for (const { message } of errors) {
      expect(message).not.toMatch(/\b(?:ref|refs|commit|commits|merge|merged|PR|pull request|branch|failed to|graphql|api|\d{3})\b/i);
      expect(message).toMatch(/^[A-Z].*\.$/);
    }
  });
});

describe('pollDelay', () => {
  it('grows with each try', () => {
    expect(pollDelay(0, () => 1)).toBe(1000);
    expect(pollDelay(1, () => 1)).toBe(2000);
    expect(pollDelay(3, () => 1)).toBe(8000);
  });

  it('wanders, so two tabs don’t keep in step', () => {
    expect(pollDelay(2, () => 0)).toBe(2000);
    expect(pollDelay(2, () => 0.5)).toBe(3000);
  });

  it('has a ceiling', () => {
    expect(pollDelay(99, () => 1)).toBe(30_000);
  });
});

describe('the fake, behind a Playwright route', () => {
  /** Playwright can't run here, so this plays the part of `page.route`. */
  async function routed() {
    const fake = createFakeGithub({ files: files() });
    let handler: (route: unknown) => Promise<void> = async () => undefined;
    const route = vi.fn(async (_url: string, fn: typeof handler) => {
      handler = fn;
    });
    await routeFakeGithub({ route } as unknown as Page, fake);

    async function send(method: string, path: string, body: string | null = null, token = FAKE_TOKEN) {
      const fulfill = vi.fn<(answer: { status: number; headers: Record<string, string>; body: string | Uint8Array }) => Promise<void>>(async () => undefined);
      const abort = vi.fn(async () => undefined);
      const request = {
        method: () => method,
        url: () => `https://api.github.com${path}`,
        allHeaders: async () => ({ authorization: `token ${token}` }),
        postData: () => body,
      };
      await handler({ request: () => request, fulfill, abort });
      return { fulfill, abort };
    }
    return { fake, route, send };
  }

  const repo = `/repos/${REPO.owner}/${REPO.name}`;

  it('only takes GitHub’s API', async () => {
    const { route } = await routed();
    expect(route.mock.calls[0][0]).toBe('https://api.github.com/**');
  });

  it('answers a request, with what a cross-origin fetch needs to read it', async () => {
    const { send } = await routed();
    const { fulfill } = await send('POST', '/graphql', JSON.stringify({ query: 'query { viewer { login } }' }));
    const answer = fulfill.mock.calls[0][0];
    expect(answer.status).toBe(200);
    expect(answer.headers['access-control-allow-origin']).toBe('*');
    expect(JSON.parse(String(answer.body))).toEqual({ data: { viewer: { login: 'patricia' } } });
  });

  it('sends an image’s bytes as they are', async () => {
    const { send } = await routed();
    const { fulfill } = await send('GET', `${repo}/contents/src/content/projects/blend/logo.png?ref=main`);
    const { body } = fulfill.mock.calls[0][0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(new Uint8Array(body as Buffer)).toEqual(image(3));
  });

  it('turns away a bad token, as GitHub would', async () => {
    const { send } = await routed();
    expect((await send('GET', '/user', null, 'gho_wrong')).fulfill.mock.calls[0][0].status).toBe(401);
  });

  it('fails the connection when a spec asks it to', async () => {
    const { fake, send } = await routed();
    fake.failNext(() => true, 0);
    const { abort, fulfill } = await send('GET', '/user');
    expect(abort).toHaveBeenCalledWith('failed');
    expect(fulfill).not.toHaveBeenCalled();
  });

  it('gives a page an account the builder can read', () => {
    expect(readToken({ getItem: () => fakeAccount() })).toBe(FAKE_TOKEN);
  });
});

describe('DemoBackend', () => {
  const siteFile = { files: { [HOME]: 'title: Home\n', [ABOUT]: 'title: About\n' } };

  function demo(body: unknown = siteFile, status = 200) {
    const send = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
    return { send, backend: new DemoBackend({ fetch: send }) };
  }

  it('reads the build’s file once, with no token', async () => {
    const { send, backend } = demo();
    await backend.load();
    await backend.load();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(['/admin/builder/site.json']);
  });

  it('says it’s a demo', async () => {
    const { backend } = demo();
    expect(backend.kind).toBe('demo');
    const snapshot = await backend.load();
    expect(snapshot).toMatchObject({ draft: null, canWrite: true, login: 'Demo', images: {} });
    expect(snapshot.files[HOME]).toEqual({ path: HOME, text: 'title: Home\n', oid: 'demo-0' });
  });

  it('passes on image paths, if the build lists them', async () => {
    const { backend } = demo({ ...siteFile, images: { 'src/content/pages/home/a.png': 'abc' } });
    expect((await backend.load()).images).toEqual({ 'src/content/pages/home/a.png': 'abc' });
  });

  it('says so plainly when the file won’t load', async () => {
    const { backend } = demo({}, 404);
    const error = await caught(backend.load());
    expect(error.kind).toBe('network');
    expect(error.message).toBe('Couldn’t load the demo. Reload the page to try again.');
  });

  it('keeps a save in memory, and shows it on the next load', async () => {
    const { send, backend } = demo();
    await backend.load();
    const draft = await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
    const snapshot = await backend.load();
    expect(snapshot.files[HOME].text).toBe('title: Mine\n');
    expect(snapshot.headOid).toBe(draft.headOid);
    expect(snapshot.draft).toEqual(draft);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('hands out copies, so an editor can’t change a save by accident', async () => {
    const { backend } = demo();
    const snapshot = await backend.load();
    snapshot.files[HOME].text = 'Scribbled on';
    expect((await backend.load()).files[HOME].text).toBe('title: Home\n');
  });

  it('adds and removes files', async () => {
    const { backend } = demo();
    await backend.load();
    await backend.saveDraft([edit('src/content/pages/fresh/index.yaml', 'title: New\n'), { path: ABOUT, delete: true }], 'Save', null);
    expect(Object.keys((await backend.load()).files).sort()).toEqual([HOME, 'src/content/pages/fresh/index.yaml'].sort());
  });

  it('keeps an uploaded image for reading back', async () => {
    const path = 'src/content/pages/home/new.png';
    const { backend } = demo();
    await backend.load();
    await backend.saveDraft([{ path, base64: btoa('picture') }], 'Save', null);
    expect(Object.keys((await backend.load()).images)).toEqual([path]);
    expect(await (await backend.readImage(path)).text()).toBe('picture');
  });

  it('says it has no other image to give', async () => {
    const { backend } = demo();
    expect((await caught(backend.readImage('src/content/pages/home/a.png'))).message).toBe('This demo only has the images added in this tab.');
  });

  it('refuses a stale head, as the real thing would', async () => {
    const { backend } = demo();
    await backend.load();
    const first = await backend.saveDraft([edit(HOME, 'title: One\n')], 'Save', null);
    await backend.saveDraft([edit(HOME, 'title: Two\n')], 'Save', first.headOid);
    expect((await caught(backend.saveDraft([edit(HOME, 'title: Three\n')], 'Save', first.headOid))).kind).toBe('moved');
    expect((await caught(backend.saveDraft([edit(HOME, 'title: Three\n')], 'Save', null))).kind).toBe('moved');
  });

  it('is ready with no preview, because there’s nothing to preview', async () => {
    const { backend } = demo();
    expect(await backend.draftStatus()).toEqual({ state: 'ready', previewUrl: null, tests: 'passed' });
  });

  it('never pretends to publish', async () => {
    const { backend } = demo();
    await backend.load();
    await backend.saveDraft([edit(HOME, 'title: Mine\n')], 'Save', null);
    const error = await caught(backend.publish());
    expect(error.kind).toBe('forbidden');
    expect(error.message).toBe('This is a demo, so nothing here can go live. Your changes stay in this tab until you close it.');
  });

  it('never pretends a change went live', async () => {
    const { backend } = demo();
    expect((await caught(backend.liveStatus())).kind).toBe('forbidden');
  });

  it('goes back to the build’s files on discard', async () => {
    const path = 'src/content/pages/home/new.png';
    const { backend } = demo();
    await backend.load();
    await backend.saveDraft([edit(HOME, 'title: Mine\n'), { path, base64: btoa('picture') }, { path: ABOUT, delete: true }], 'Save', null);
    await backend.discard();
    const snapshot = await backend.load();
    expect(snapshot.draft).toBeNull();
    expect(snapshot.files[HOME].text).toBe('title: Home\n');
    expect(snapshot.files[ABOUT].text).toBe('title: About\n');
    expect(snapshot.images).toEqual({});
  });
});
