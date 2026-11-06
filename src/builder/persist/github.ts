/**
 * The builder's work on GitHub, straight from the browser. Everything saved goes
 * to one draft branch with a draft pull request, and publishing squashes it into
 * main. The calls follow Sveltia's GitHub backend, so they are ones a `public_repo`
 * token is known to be allowed to make.
 *
 * Nothing here commits by itself: Cloudflare's free plan runs one build at a time,
 * and every commit that isn't marked to skip one starts a build.
 */
import { API_ROOT, MESSAGES } from './auth';
import {
  BackendError,
  DRAFT_BRANCH,
  DRAFT_PREVIEW_URL,
  PREVIEW_CHECK,
  PREVIEW_TIMEOUT_MS,
  REPO,
  TEST_CHECK,
  type Backend,
  type DraftInfo,
  type DraftStatus,
  type FileChange,
  type LiveStatus,
  type PublishResult,
  type RepoFile,
  type RepoSnapshot,
} from './types';

const WORDS = {
  forbidden: 'This account can look but can’t save. Ask your developer for access.',
  busy: 'GitHub asked us to slow down. Wait a few minutes and try again.',
  unknown: 'GitHub didn’t accept that. Your work is still here, so try again.',
  settling: 'GitHub needs a moment before this can go live. Try publishing again.',
  held: 'GitHub is holding this back from going live. Ask your developer to take a look.',
  missingImage: 'That image couldn’t be found.',
  nothing: 'There’s nothing new to save.',
};

/** Per commit: GitHub drops a request whose body takes more than about ten seconds. */
const MAX_COMMIT_BASE64 = 2_000_000;

/** Both GitHub Actions and Cloudflare honour this at the start of a message. */
const SKIP_BUILD = '[skip ci] ';

const IMAGE_FILE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

const WRITE_PERMISSIONS = ['ADMIN', 'MAINTAIN', 'WRITE'];

/** A check that finished without a problem. Anything else that finished failed. */
const PASSED = ['success', 'neutral', 'skipped'];

const MERGE_TRIES = 4;

const q = JSON.stringify;
const REPO_PATH = `/repos/${REPO.owner}/${REPO.name}`;
const REPOSITORY = `repository(owner: ${q(REPO.owner)}, name: ${q(REPO.name)})`;
const MAIN_REF = `refs/heads/${REPO.main}`;
const DRAFT_REF = `refs/heads/${DRAFT_BRANCH}`;

const PULL_FIELDS = `
  id number url title isDraft state merged isCrossRepository mergeStateStatus
  mergeCommit { oid }
  commits(first: 1) { nodes { commit { parents(first: 1) { nodes { oid } } } } }
`;

const OPEN_PULLS = `pullRequests(headRefName: ${q(DRAFT_BRANCH)}, baseRefName: ${q(REPO.main)}, states: OPEN, first: 10) { nodes { ${PULL_FIELDS} } }`;

const FOLDER = '... on Tree { entries { name type oid object { ... on Tree { entries { name type oid } } } } }';

const contentAt = (side: string, rev: string) => `
  ${side}Pages: object(expression: ${q(`${rev}:src/content/pages`)}) { ${FOLDER} }
  ${side}Projects: object(expression: ${q(`${rev}:src/content/projects`)}) { ${FOLDER} }
  ${side}Site: object(expression: ${q(`${rev}:src/content/site/site.yaml`)}) { oid }
`;

/*
 * A selection can't filter by name, so reading the YAML here would have GitHub read
 * every image beside it too. This lists both sides by id; `blobsQuery` then reads
 * just the text of the side that's wanted, which makes a load two calls.
 */
const LOAD = `
  query {
    viewer { login }
    ${REPOSITORY} {
      id
      viewerPermission
      main: ref(qualifiedName: ${q(MAIN_REF)}) { target { oid } }
      draft: ref(qualifiedName: ${q(DRAFT_REF)}) { target { oid } }
      ${OPEN_PULLS}
      ${contentAt('main', REPO.main)}
      ${contentAt('draft', DRAFT_BRANCH)}
    }
  }
`;

const BRANCHES = `query { ${REPOSITORY} { id main: ref(qualifiedName: ${q(MAIN_REF)}) { target { oid } } draft: ref(qualifiedName: ${q(DRAFT_REF)}) { target { oid } } ${OPEN_PULLS} } }`;

const CREATE_REF = 'mutation($input: CreateRefInput!) { createRef(input: $input) { ref { name } } }';

const COMMIT = 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }';

const MARK_READY = 'mutation($input: MarkPullRequestReadyForReviewInput!) { markPullRequestReadyForReview(input: $input) { pullRequest { isDraft } } }';

const blobsQuery = (oids: string[]) =>
  `query { ${REPOSITORY} { ${oids.map((oid, i) => `b${i}: object(oid: ${q(oid)}) { ... on Blob { text isTruncated } }`).join(' ')} } }`;

/** One path at three commits: main, where the draft started, and the draft. */
const fileOids = (paths: string[], draft: DraftInfo) =>
  paths
    .flatMap((path, i) =>
      Object.entries({ m: REPO.main, b: draft.baseOid, h: draft.headOid }).map(
        ([side, rev]) => `${side}${i}: object(expression: ${q(`${rev}:${path}`)}) { oid }`
      )
    )
    .join(' ');

const FILES_FIELD = 'files(first: 100) { nodes { path } }';

const pullQuery = (number: number) => `query { ${REPOSITORY} { pullRequest(number: ${number}) { ${PULL_FIELDS} ${FILES_FIELD} } } }`;

const publishQuery = (draft: DraftInfo, paths: string[]) => `
  query {
    ${REPOSITORY} {
      draft: ref(qualifiedName: ${q(DRAFT_REF)}) { target { oid } }
      pullRequest(number: ${draft.prNumber}) { ${PULL_FIELDS} ${FILES_FIELD} }
      ${fileOids(paths, draft)}
    }
  }
`;

const overlapQuery = (draft: DraftInfo, paths: string[]) => `query { ${REPOSITORY} { ${fileOids(paths, draft)} } }`;

interface GraphqlError {
  type?: string;
  message?: string;
}

interface Target {
  target: { oid: string };
}

interface Entry {
  name: string;
  type: string;
  oid: string;
  object?: { entries?: Entry[] } | null;
}

type Folder = { entries?: Entry[] } | null;

interface Pull {
  id: string;
  number: number;
  url: string;
  title: string;
  isDraft: boolean;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  merged: boolean;
  isCrossRepository: boolean;
  mergeStateStatus: string;
  mergeCommit: { oid: string } | null;
  commits: { nodes: { commit: { parents: { nodes: { oid: string }[] } } }[] };
}

type PullWithFiles = Pull & { files: { nodes: { path: string }[] } };

interface Branches {
  id: string;
  main: Target | null;
  draft: Target | null;
  pullRequests: { nodes: Pull[] };
}

interface LoadData {
  viewer: { login: string };
  repository: (Branches & { viewerPermission: string } & Record<string, unknown>) | null;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  details_url?: string | null;
  output?: { title?: string | null; summary?: string | null; text?: string | null };
}

/** A file on its way into a commit. */
interface Change {
  path: string;
  /** Base64. A deletion has none. */
  contents?: string;
  image: boolean;
}

export interface GithubOptions {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** How long to wait before asking again: it grows, and wanders so tabs don't keep in step. */
export const pollDelay = (attempt: number, random: () => number = Math.random): number =>
  Math.min(30_000, 1000 * 2 ** attempt) * (0.5 + random() / 2);

function encodeText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function prepare(change: FileChange): Change {
  const { path, text, base64 } = change;
  if (change.delete) return { path, image: false };
  if (base64 !== undefined) return { path, contents: base64, image: true };
  if (text !== undefined) return { path, contents: encodeText(text), image: false };
  throw new BackendError('unknown', WORDS.unknown, `A change to ${path} has no contents.`);
}

const sizeOf = (changes: Change[]) => changes.reduce((total, { contents = '' }) => total + contents.length, 0);

/**
 * Images first, a commit at a time, so a page never lands before its pictures.
 * All the text and every deletion go in the last commit together: it is the one
 * that changes the site. An image over the limit goes in a commit of its own.
 */
function commitGroups(changes: Change[]): Change[][] {
  const groups: Change[][] = [];
  for (const image of changes.filter((change) => change.image)) {
    const last = groups.at(-1);
    if (last && sizeOf(last) + sizeOf([image]) <= MAX_COMMIT_BASE64) last.push(image);
    else groups.push([image]);
  }
  const rest = changes.filter((change) => !change.image);
  const last = groups.at(-1);
  if (last && sizeOf(last) + sizeOf(rest) <= MAX_COMMIT_BASE64) last.push(...rest);
  else if (rest.length) groups.push(rest);
  return groups;
}

function commitMessage(message: string) {
  const [headline, ...body] = message.split('\n');
  return { headline, ...(body.join('\n').trim() ? { body: body.join('\n').trim() } : {}) };
}

/** Which files sit beside the YAML, from a two-level listing. */
function listFiles(folder: string, tree: Folder) {
  const yaml: { path: string; oid: string }[] = [];
  const images: Record<string, string> = {};
  for (const entry of tree?.entries ?? []) {
    if (entry.type === 'blob' && IMAGE_FILE.test(entry.name)) images[`${folder}/${entry.name}`] = entry.oid;
    for (const child of entry.object?.entries ?? []) {
      const path = `${folder}/${entry.name}/${child.name}`;
      if (child.type !== 'blob') continue;
      if (child.name === 'index.yaml') yaml.push({ path, oid: child.oid });
      else if (IMAGE_FILE.test(child.name)) images[path] = child.oid;
    }
  }
  return { yaml, images };
}

/** A fork can open a pull request from a branch of the same name. Those aren't ours. */
const ownPull = (nodes: Pull[]) => nodes.find((pull) => !pull.isCrossRepository) ?? null;

/** The draft's first commit sits on the commit it was cut from. */
const forkPoint = (pull: Pull) => pull.commits.nodes[0]?.commit.parents.nodes[0]?.oid;

const toDraft = (pull: Pull, headOid: string): DraftInfo => ({
  prNumber: pull.number,
  prUrl: pull.url,
  headOid,
  baseOid: forkPoint(pull) ?? '',
});

const filesOf = (pull: PullWithFiles) => pull.files.nodes.map(({ path }) => path);

const latest = (runs: CheckRun[], name: string) =>
  runs.filter((run) => run.name === name).reduce<CheckRun | undefined>((newest, run) => (!newest || run.id > newest.id ? run : newest), undefined);

function testState(run: CheckRun | undefined): 'passed' | 'running' | 'failed' {
  if (!run || run.status !== 'completed') return 'running';
  return PASSED.includes(run.conclusion ?? '') ? 'passed' : 'failed';
}

const runDetails = (run: CheckRun) =>
  [`${run.name}: ${run.conclusion ?? run.status}`, run.output?.title, run.output?.summary, run.output?.text].filter(Boolean).join('\n');

export class GithubBackend implements Backend {
  readonly kind = 'github';

  private readonly send: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** The repository, and the commit of main the editor is looking at. */
  private loaded: { repositoryId: string; mainOid: string } | null = null;

  /** Where a save stopped part-way: its images landed, its pages didn't. */
  private stopped: { from: string; at: string } | null = null;

  constructor(
    private readonly token: string,
    { fetch: send, now = Date.now, sleep = (ms) => new Promise((done) => setTimeout(done, ms)) }: GithubOptions = {}
  ) {
    this.send = send ?? ((...args) => globalThis.fetch(...args));
    this.now = now;
    this.sleep = sleep;
  }

  /** Details are for pasting to someone, so the token never goes in them. */
  private clean(details: string): string {
    return details.replaceAll(this.token, '[token]');
  }

  private async request(
    method: string,
    path: string,
    { body, accept = 'application/json', allow = [], retry = method === 'GET' }: { body?: unknown; accept?: string; allow?: number[]; retry?: boolean } = {}
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.send(`${API_ROOT}${path}`, {
        method,
        cache: 'no-cache',
        // A redirect could take the token somewhere else, and GitHub's API doesn't need one.
        redirect: 'error',
        headers: {
          Authorization: `token ${this.token}`,
          Accept: accept,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new BackendError('network', MESSAGES.network, this.clean(`${method} ${path}\n${String(error)}`));
    }
    if (response.ok || allow.includes(response.status)) return response;
    // Sveltia's experience: GitHub's GraphQL answers an occasional 502 that a second try cures.
    if (response.status === 502 && retry) {
      await this.sleep(1000);
      return this.request(method, path, { body, accept, allow, retry: false });
    }
    throw await this.refusal(method, path, response);
  }

  private async refusal(method: string, path: string, response: Response): Promise<BackendError> {
    const { status, headers } = response;
    const details = this.clean(`${method} ${path}\n${status}\n${await response.text().catch(() => '')}`);
    if (status === 401) return new BackendError('auth', MESSAGES.auth, details);
    // A spent rate limit shares its status with a real refusal.
    if (status === 429 || headers.get('retry-after') !== null || headers.get('x-ratelimit-remaining') === '0') {
      return new BackendError('network', WORDS.busy, details);
    }
    if (status === 403) return new BackendError('forbidden', WORDS.forbidden, details);
    if (status >= 500) return new BackendError('network', MESSAGES.network, details);
    return new BackendError('unknown', WORDS.unknown, details);
  }

  private graphqlRefusal(errors: GraphqlError[]): BackendError {
    const details = this.clean(JSON.stringify(errors, null, 2));
    if (errors.some(({ type }) => type === 'RATE_LIMITED')) return new BackendError('network', WORDS.busy, details);
    if (errors.some(({ type, message = '' }) => type === 'FORBIDDEN' || /permission|not accessible/i.test(message))) {
      return new BackendError('forbidden', WORDS.forbidden, details);
    }
    return new BackendError('unknown', WORDS.unknown, details);
  }

  /** GraphQL reports most failures with a 200, so the caller decides what they mean. */
  private async graphql<T>(query: string, variables?: unknown): Promise<{ data: T | null; errors: GraphqlError[] }> {
    // A mutation might have landed even if its answer was a 502, so only queries repeat.
    const response = await this.request('POST', '/graphql', { body: { query, variables }, retry: variables === undefined });
    try {
      const { data = null, errors = [] } = (await response.json()) as { data?: T | null; errors?: GraphqlError[] };
      return { data, errors };
    } catch (error) {
      throw new BackendError('unknown', WORDS.unknown, this.clean(String(error)));
    }
  }

  private async read<T>(query: string): Promise<T> {
    const { data, errors } = await this.graphql<T>(query);
    // A path a commit doesn't have is a question answered, not a failure.
    const failures = errors.filter(({ type }) => type !== 'NOT_FOUND');
    if (failures.length || !data) throw this.graphqlRefusal(errors);
    return data;
  }

  private async write<T>(query: string, input: unknown): Promise<T> {
    const { data, errors } = await this.graphql<T>(query, { input });
    if (errors.length || !data) throw this.graphqlRefusal(errors);
    return data;
  }

  private async readBlob(oid: string): Promise<string> {
    const response = await this.request('GET', `${REPO_PATH}/git/blobs/${oid}`, { accept: 'application/vnd.github.raw' });
    return response.text();
  }

  private async readFiles(yaml: { path: string; oid: string }[]): Promise<Record<string, RepoFile>> {
    if (!yaml.length) return {};
    type Read = { text?: string | null; isTruncated?: boolean } | null;
    const { repository } = await this.read<{ repository: Record<string, Read> }>(blobsQuery(yaml.map(({ oid }) => oid)));
    const files = await Promise.all(
      yaml.map(async ({ path, oid }, i): Promise<[string, RepoFile]> => {
        const blob = repository[`b${i}`];
        // GraphQL stops at 512 KB. Saving what it gave would cut the file short.
        const text = typeof blob?.text === 'string' && !blob.isTruncated ? blob.text : await this.readBlob(oid);
        return [path, { path, text, oid }];
      })
    );
    return Object.fromEntries(files);
  }

  async load(): Promise<RepoSnapshot> {
    const { viewer, repository } = await this.read<LoadData>(LOAD);
    const mainOid = repository?.main?.target.oid;
    if (!repository || !mainOid) throw new BackendError('unknown', WORDS.unknown, `${REPO.owner}/${REPO.name} has no ${REPO.main}.`);

    const pull = ownPull(repository.pullRequests.nodes);
    const draftHead = repository.draft?.target.oid;
    const onDraft = !!pull && !!draftHead;
    const side = onDraft ? 'draft' : 'main';

    const pages = listFiles('src/content/pages', repository[`${side}Pages`] as Folder);
    const projects = listFiles('src/content/projects', repository[`${side}Projects`] as Folder);
    const site = repository[`${side}Site`] as { oid: string } | null;
    const yaml = [...pages.yaml, ...projects.yaml, ...(site ? [{ path: 'src/content/site/site.yaml', oid: site.oid }] : [])];

    this.loaded = { repositoryId: repository.id, mainOid };
    return {
      headOid: onDraft ? draftHead : mainOid,
      mainOid,
      files: await this.readFiles(yaml),
      images: { ...pages.images, ...projects.images },
      draft: onDraft ? toDraft(pull, draftHead) : null,
      canWrite: WRITE_PERMISSIONS.includes(repository.viewerPermission),
      login: viewer.login,
    };
  }

  async readImage(path: string, ref: string): Promise<Blob> {
    const file = path.split('/').map(encodeURIComponent).join('/');
    const response = await this.request('GET', `${REPO_PATH}/contents/${file}?ref=${encodeURIComponent(ref)}`, {
      accept: 'application/vnd.github.raw+json',
      allow: [404],
    });
    if (response.status === 404) throw new BackendError('missing', WORDS.missingImage, `${path} at ${ref}`);
    const type = IMAGE_TYPES[path.split('.').at(-1)?.toLowerCase() ?? ''] ?? '';
    return new Blob([await response.arrayBuffer()], { type });
  }

  async draftFiles(draft: DraftInfo): Promise<string[]> {
    const { repository } = await this.read<{ repository: { pullRequest: PullWithFiles | null } }>(pullQuery(draft.prNumber));
    if (!repository.pullRequest) throw new BackendError('moved', MESSAGES.moved);
    return filesOf(repository.pullRequest);
  }

  private async branches(): Promise<Branches> {
    const { repository } = await this.read<{ repository: Branches }>(BRANCHES);
    return repository;
  }

  private async deleteBranch(): Promise<void> {
    // GitHub answers 422 for a branch that's already gone.
    await this.request('DELETE', `${REPO_PATH}/git/refs/heads/${DRAFT_BRANCH}`, { allow: [404, 422] });
  }

  /**
   * Starts the draft from the commit the editor loaded, not main's latest: then a
   * change that reached main in between shows up at publish instead of being
   * overwritten here unseen.
   */
  private async cutBranch(): Promise<string> {
    const { repositoryId, mainOid } = this.loaded ?? (await this.currentMain());
    const create = () => this.graphql(CREATE_REF, { input: { repositoryId, name: DRAFT_REF, oid: mainOid } });

    let { errors } = await create();
    if (errors.some(({ message = '' }) => /already exists/i.test(message))) {
      if (ownPull((await this.branches()).pullRequests.nodes)) throw new BackendError('moved', MESSAGES.moved);
      // Left over from a save that stopped early, or a draft closed on GitHub. Moving
      // it instead could be refused: main may hold workflow changes this token can't push.
      await this.deleteBranch();
      ({ errors } = await create());
    }
    if (errors.length) throw this.graphqlRefusal(errors);
    return mainOid;
  }

  private async currentMain() {
    const { id, main } = await this.branches();
    if (!main) throw new BackendError('unknown', WORDS.unknown, `${REPO.main} is missing.`);
    return { repositoryId: id, mainOid: main.target.oid };
  }

  private async commitOnce(changes: Change[], message: string, expectedHeadOid: string): Promise<string> {
    const additions = changes.filter(({ contents }) => contents !== undefined).map(({ path, contents }) => ({ path, contents }));
    const deletions = changes.filter(({ contents }) => contents === undefined).map(({ path }) => ({ path }));
    const { data, errors } = await this.graphql<{ createCommitOnBranch: { commit: { oid: string } } | null }>(COMMIT, {
      input: {
        branch: { repositoryNameWithOwner: `${REPO.owner}/${REPO.name}`, branchName: DRAFT_BRANCH },
        expectedHeadOid,
        fileChanges: { additions, deletions },
        message: commitMessage(message),
      },
    });
    const oid = data?.createCommitOnBranch?.commit.oid;
    if (oid && !errors.length) return oid;

    // Like Sveltia, look at the branch rather than trust the wording of the error.
    const stale = errors.some(({ type }) => type === 'STALE_DATA');
    const head = stale ? undefined : await this.branches().then(({ draft }) => draft?.target.oid ?? null, () => expectedHeadOid);
    if (stale || head !== expectedHeadOid) throw new BackendError('moved', MESSAGES.moved, this.clean(JSON.stringify(errors, null, 2)));
    throw this.graphqlRefusal(errors);
  }

  private async commit(changes: Change[], message: string, from: string, start: string): Promise<string> {
    const groups = commitGroups(changes);
    let head = start;
    for (const [i, group] of groups.entries()) {
      const last = i === groups.length - 1;
      // Only the last commit is worth a build, and it's the one the status follows.
      head = await this.commitOnce(group, last ? message : `${SKIP_BUILD}${message}`, head);
      this.stopped = last ? null : { from, at: head };
    }
    return head;
  }

  private async openPull(title: string): Promise<{ number: number; html_url: string } | null> {
    const response = await this.request('POST', `${REPO_PATH}/pulls`, {
      body: { title, head: DRAFT_BRANCH, base: REPO.main, draft: true, body: 'Made in the site builder.' },
      allow: [422],
    });
    return response.ok ? ((await response.json()) as { number: number; html_url: string }) : null;
  }

  async saveDraft(changes: FileChange[], message: string, expectedHeadOid: string | null): Promise<DraftInfo> {
    if (!changes.length) throw new BackendError('unknown', WORDS.nothing);
    const prepared = changes.map(prepare);

    if (expectedHeadOid === null) {
      const baseOid = await this.cutBranch();
      const headOid = await this.commit(prepared, message, baseOid, baseOid);
      const pull = await this.openPull(message);
      if (pull) return { prNumber: pull.number, prUrl: pull.html_url, headOid, baseOid };
      return this.existingDraft(headOid);
    }

    // After a save that stopped part-way, the caller still holds the head it started from.
    const start = this.stopped?.from === expectedHeadOid ? this.stopped.at : expectedHeadOid;
    const headOid = await this.commit(prepared, message, expectedHeadOid, start);
    const { pullRequests } = await this.branches();
    const pull = ownPull(pullRequests.nodes);
    if (pull) return toDraft(pull, headOid);
    await this.openPull(message);
    return this.existingDraft(headOid);
  }

  private async existingDraft(headOid: string): Promise<DraftInfo> {
    const pull = ownPull((await this.branches()).pullRequests.nodes);
    if (!pull) throw new BackendError('unknown', WORDS.unknown, 'No pull request came out of that save.');
    return toDraft(pull, headOid);
  }

  private async checkRuns(oid: string): Promise<CheckRun[]> {
    // A commit this new may not have reached every server yet, which only means no news.
    const response = await this.request('GET', `${REPO_PATH}/commits/${oid}/check-runs?per_page=100`, { allow: [404, 422] });
    return response.ok ? ((await response.json()) as { check_runs: CheckRun[] }).check_runs : [];
  }

  async draftStatus(draft: DraftInfo, since: number): Promise<DraftStatus> {
    const runs = await this.checkRuns(draft.headOid);
    const preview = latest(runs, PREVIEW_CHECK);
    if (preview?.status !== 'completed') {
      return { state: this.now() - since > PREVIEW_TIMEOUT_MS ? 'stuck' : 'building', since };
    }
    if (preview.conclusion !== 'success') {
      return { state: 'failed', detailsUrl: preview.details_url ?? undefined, details: runDetails(preview) };
    }
    return { state: 'ready', previewUrl: DRAFT_PREVIEW_URL, tests: testState(latest(runs, TEST_CHECK)) };
  }

  async liveStatus(mergeOid: string): Promise<LiveStatus> {
    const run = latest(await this.checkRuns(mergeOid), PREVIEW_CHECK);
    if (run?.status !== 'completed') return { state: 'waiting' };
    return run.conclusion === 'success' ? { state: 'live' } : { state: 'failed', details: runDetails(run) };
  }

  /** Files both sides changed since the draft started, and not to the same thing. */
  private overlapping(paths: string[], oids: Record<string, unknown>): string[] {
    const oid = (alias: string) => (oids[alias] as { oid: string } | null)?.oid ?? null;
    return paths.filter((_, i) => {
      const [main, base, head] = [oid(`m${i}`), oid(`b${i}`), oid(`h${i}`)];
      return head !== base && main !== base && main !== head;
    });
  }

  private async clashes(draft: DraftInfo, paths: string[]): Promise<string[]> {
    if (!paths.length) return [];
    const { repository } = await this.read<{ repository: Record<string, unknown> }>(overlapQuery(draft, paths));
    return this.overlapping(paths, repository);
  }

  private async finish(mergeOid: string, branchIsThisDraft = true): Promise<PublishResult> {
    this.loaded = null;
    // Already gone if the repository deletes merged branches. If it stays, the next save clears it.
    if (branchIsThisDraft) await this.deleteBranch().catch(() => undefined);
    return { state: 'published', mergeOid };
  }

  async publish(draft: DraftInfo, changedPaths: string[]): Promise<PublishResult> {
    type Data = { repository: { draft: Target | null; pullRequest: PullWithFiles | null } & Record<string, unknown> };
    const { repository } = await this.read<Data>(publishQuery(draft, changedPaths));
    const pull = repository.pullRequest;

    // The answer to an earlier try can get lost after the merge went through. Every
    // draft shares one branch, so by now it may hold a newer draft, which isn't ours to delete.
    if (pull?.merged && pull.mergeCommit) return this.finish(pull.mergeCommit.oid, repository.draft?.target.oid === draft.headOid);
    if (pull?.state !== 'OPEN' || repository.draft?.target.oid !== draft.headOid) throw new BackendError('moved', MESSAGES.moved);

    // The caller's list lives in one browser, so GitHub's own list has the last word.
    const unlisted = filesOf(pull).filter((path) => !changedPaths.includes(path));
    const paths = [...this.overlapping(changedPaths, repository), ...(await this.clashes(draft, unlisted))];
    if (paths.length) return { state: 'conflict', paths };

    if (pull.isDraft) await this.write(MARK_READY, { pullRequestId: pull.id });
    return this.merge(draft, pull);
  }

  private async merge(draft: DraftInfo, pull: Pull): Promise<PublishResult> {
    let refusal = '';
    for (let attempt = 0; attempt < MERGE_TRIES; attempt++) {
      if (attempt) await this.sleep(pollDelay(attempt));
      const response = await this.request('PUT', `${REPO_PATH}/pulls/${draft.prNumber}/merge`, {
        body: {
          merge_method: 'squash',
          sha: draft.headOid,
          commit_title: `${pull.title} (#${draft.prNumber})`,
          // Left out, GitHub lists every commit here, skip-build markers and all.
          commit_message: 'Published from the site builder.',
        },
        allow: [405, 409],
      });
      if (response.ok) return this.finish(((await response.json()) as { sha: string }).sha);
      if (response.status === 409) throw new BackendError('moved', MESSAGES.moved, this.clean(await response.text()));
      refusal = await response.text();

      // A 405 covers every reason a merge can't happen, so ask which it was.
      const { repository } = await this.read<{ repository: { pullRequest: PullWithFiles } }>(pullQuery(draft.prNumber));
      const now = repository.pullRequest;
      if (now.merged && now.mergeCommit) return this.finish(now.mergeCommit.oid);
      if (now.mergeStateStatus === 'BEHIND') return { state: 'stale' };
      if (now.mergeStateStatus === 'BLOCKED') throw new BackendError('unknown', WORDS.held, this.clean(refusal));
      if (now.mergeStateStatus === 'DIRTY') {
        // Main changed after the check above, or Git sees something it didn't.
        const paths = await this.clashes(draft, filesOf(now));
        return paths.length ? { state: 'conflict', paths } : { state: 'stale' };
      }
      // Otherwise GitHub is still working it out, which is common just after a change.
    }
    throw new BackendError('network', WORDS.settling, this.clean(refusal));
  }

  async discard(draft: DraftInfo): Promise<void> {
    // Whatever else the branch holds now is someone's newer work.
    const branch = (await this.branches()).draft;
    if (branch && branch.target.oid !== draft.headOid) throw new BackendError('moved', MESSAGES.moved);

    const closed = await this.request('PATCH', `${REPO_PATH}/pulls/${draft.prNumber}`, { body: { state: 'closed' }, allow: [422] });
    // GitHub won't close what it has already merged.
    if (!closed.ok) throw new BackendError('moved', MESSAGES.moved, this.clean(await closed.text()));
    await this.deleteBranch();
    this.loaded = null;
    this.stopped = null;
  }
}
