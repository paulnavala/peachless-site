/**
 * The builder's working day: open the site, keep the editor's work safe, save a
 * draft, watch its preview build, publish. The panels show this and call it; only
 * this module talks to the Backend.
 *
 * Nothing here commits on its own. Each save starts a build, and Cloudflare allows
 * only so many, so work stays on this computer until an editor saves it.
 */
import { reactive, watch } from 'vue';
import { parse } from 'yaml';
import { reloadCanvas } from './canvas/controller';
import { clearPendingImages, pendingImages, reclaimImage, restoreImages, showImage, toBase64, type PendingImage } from './images';
import { claimTab, clearLocal, readLocal, writeLocal, type LocalPage } from './local';
import { canSignIn, readToken, signIn } from './persist/auth';
import { DemoBackend } from './persist/demo';
import { GithubBackend } from './persist/github';
import { mergeObject, mergePage, type MergeConflict } from './persist/merge';
import { BackendError, DRAFT_BRANCH, REPO, type Backend, type DraftInfo, type DraftStatus, type FileChange, type RepoSnapshot } from './persist/types';
import { blocksOf, dirtyPages, dirtySite, loadPages, loadSite, markSaved, page, pageUrl, PROJECT, state, type RawPage, type RawSection, type RawSite } from './store';
import { validatePage, validateProject, type Problem } from './validate';
import { newYaml, patchYaml } from './yaml';

const PAGE_FILE = /^src\/content\/pages\/([a-z0-9-]+)\/index\.yaml$/;
const PROJECT_FILE = /^src\/content\/projects\/([a-z0-9-]+)\/index\.yaml$/;
const SITE_FILE = 'src/content/site/site.yaml';
const IMAGE_FILE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
const POLL_MS = 15_000;
const AUTOSAVE_MS = 400;

export type Blocker = Problem & { page: string };

export const session = reactive({
  phase: 'starting' as 'starting' | 'signed-out' | 'ready' | 'failed' | 'other-tab',
  /** What went wrong, in plain words. */
  error: '',
  /** The raw detail, for "copy details". */
  details: '',
  kind: 'demo' as Backend['kind'],
  login: '',
  canWrite: false,
  draft: null as DraftInfo | null,
  status: null as DraftStatus | null,
  /** What's happening right now, in the editor's words. */
  busy: '',
  /** What stops this from being saved. */
  blockers: [] as Blocker[],
  /** Someone changed what this draft changed: what to decide. */
  conflicts: [] as MergeConflict[],
  /** Just published, and on its way to the live site. */
  publishing: false,
  /** A short confirmation. */
  notice: '',
  /** Work was found on this computer, and picked back up. */
  restored: false,
  /** The site's been updated since this copy of the builder loaded. */
  outOfDate: false,
  /** The editor has read the note about demo mode. */
  demoNoted: false,
});

let backend: Backend | null = null;
let snapshot: RepoSnapshot | null = null;
let pollTimer = 0;
let autosaveTimer = 0;
let savedAt = Date.now();

const fail = (error: unknown) => {
  session.error = error instanceof Error ? error.message : 'Something went wrong.';
  session.details = String((error as { details?: string }).details ?? error);
};

function pagesFrom(files: RepoSnapshot['files']) {
  return Object.values(files).flatMap((file) => {
    const id = PAGE_FILE.exec(file.path)?.[1];
    if (id) return [{ id, path: file.path, raw: parse(file.text) as RawPage }];
    const project = PROJECT_FILE.exec(file.path)?.[1];
    if (!project) return [];
    const doc = parse(file.text) as { title: string; blocks?: Record<string, unknown>[] };
    const sections = (doc.blocks ?? []).map((block, i) => ({ id: `block-${i}`, ...block }) as RawSection);
    return [{ id: `${PROJECT}${project}`, path: file.path, raw: { title: doc.title, story: true, sections }, project: doc }];
  });
}

/** Picks up work left on this computer, merging if the site moved on since. */
function restoreLocal(current: RepoSnapshot): void {
  const local = readLocal();
  if (!local) return;
  for (const [id, work] of Object.entries(local.pages)) {
    const entry = state.pages[id];
    if (!entry) {
      state.pages[id] = { id, path: work.path, raw: work.raw, saved: '' };
    } else if (local.headOid === current.headOid) {
      entry.raw = work.raw;
    } else {
      // Where a merge can't decide, it keeps what's here: this work is the editor's.
      const merged = mergePage(JSON.parse(work.base || '{}'), work.raw as unknown as Record<string, unknown>, entry.raw as unknown as Record<string, unknown>);
      entry.raw = merged.merged as unknown as RawPage;
    }
  }
  session.restored = dirtyPages.value.length > 0;
  state.revision++;
}

function autosave(): void {
  clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    if (!snapshot) return;
    const pages: Record<string, LocalPage> = {};
    for (const entry of dirtyPages.value) pages[entry.id] = { path: entry.path, base: entry.saved, raw: entry.raw };
    writeLocal({ headOid: snapshot.headOid, pages });
  }, AUTOSAVE_MS);
}

/** Images in a draft aren't on the built site yet, so the canvas fetches them. */
async function showDraftImages(): Promise<void> {
  if (!backend || !snapshot?.draft) return;
  for (const entry of Object.values(state.pages)) {
    for (const section of entry.raw.sections) {
      for (const element of section.elements ?? []) {
        if (element.type !== 'image' || typeof element.image !== 'string') continue;
        const path = `src/content/pages/${entry.id}/${element.image}`;
        await backend.readImage(path, DRAFT_BRANCH).then((file) => showImage(path, file), () => undefined);
      }
    }
  }
}

function watchDraft(): void {
  window.clearTimeout(pollTimer);
  const draft = session.draft;
  if (!draft || !backend) {
    session.status = null;
    return;
  }
  const tick = async () => {
    if (!backend || session.draft !== draft) return;
    try {
      session.status = await backend.draftStatus(draft, savedAt);
    } catch {
      // A missed look isn't worth interrupting anyone for: try again next time.
    }
    const status = session.status;
    if (!status || status.state === 'building' || (status.state === 'ready' && status.tests === 'running')) {
      pollTimer = window.setTimeout(tick, POLL_MS);
    }
  };
  void tick();
}

async function open(using: Backend): Promise<void> {
  backend = using;
  session.kind = using.kind;
  snapshot = await using.load();
  session.login = snapshot.login;
  session.canWrite = snapshot.canWrite;
  session.draft = snapshot.draft;
  loadPages(pagesFrom(snapshot.files));
  const site = snapshot.files[SITE_FILE];
  if (site) loadSite(site.path, parse(site.text) as RawSite);
  await restoreImages();
  restoreLocal(snapshot);
  await showDraftImages();
  session.phase = 'ready';
  watchDraft();
}

export async function connect(using: Backend): Promise<void> {
  try {
    await open(using);
  } catch (error) {
    if (error instanceof BackendError && error.kind === 'auth') {
      session.phase = 'signed-out';
      return;
    }
    session.phase = 'failed';
    fail(error);
  }
}

export async function start(): Promise<void> {
  if (!(await claimTab())) {
    session.phase = 'other-tab';
    return;
  }
  watch(() => state.revision, autosave);
  const token = readToken();
  if (token) await connect(new GithubBackend(token));
  else if (canSignIn()) session.phase = 'signed-out';
  else await connect(new DemoBackend());
}

/** Straight from a click, or the browser blocks the sign-in window. */
export async function startSignIn(): Promise<void> {
  session.error = '';
  try {
    const token = await signIn();
    session.phase = 'starting';
    await connect(new GithubBackend(token));
  } catch (error) {
    fail(error);
  }
}

export const hasUnsaved = (): boolean => dirtyPages.value.length > 0 || dirtySite.value;

function saveMessage(titles: string[]): string {
  const list = new Intl.ListFormat('en-GB').format(titles);
  return `Update ${list || 'the site'}`;
}

export async function saveDraft(): Promise<void> {
  if (!backend || !snapshot || session.busy) return;
  const known = new Set([...Object.keys(snapshot.images), ...pendingImages().map((image) => image.path)]);
  const entries = dirtyPages.value;

  session.blockers = entries.flatMap((entry) => {
    const check = entry.project
      ? validateProject(entry.id.slice(PROJECT.length), { ...entry.project, blocks: entry.raw.sections }, known)
      : validatePage(entry.id, entry.raw, known, { isNew: !snapshot!.files[entry.path] });
    return check.problems.map((problem) => ({ ...problem, page: entry.id }));
  });
  if (session.blockers.length) {
    state.panel = 'checks';
    return;
  }

  session.busy = 'Saving your draft…';
  session.error = '';
  try {
    const changes: FileChange[] = [];
    for (const image of pendingImages()) changes.push({ path: image.path, base64: await toBase64(image.file) });
    for (const entry of entries) {
      const file = snapshot.files[entry.path];
      const doc = entry.project ? { ...entry.project, blocks: blocksOf(entry.raw) } : entry.raw;
      changes.push({ path: entry.path, text: file ? patchYaml(file.text, doc) : newYaml(doc) });
    }
    if (dirtySite.value && state.site) {
      changes.push({ path: state.site.path, text: patchYaml(snapshot.files[state.site.path].text, state.site.raw) });
    }

    const draft = await backend.saveDraft(changes, saveMessage(entries.map((e) => e.raw.title)), session.draft?.headOid ?? null);

    for (const change of changes) {
      if (change.text === undefined) continue;
      snapshot.files[change.path] = { path: change.path, text: change.text, oid: snapshot.files[change.path]?.oid ?? '' };
    }
    snapshot.headOid = draft.headOid;
    session.draft = draft;
    savedAt = Date.now();
    markSaved();
    clearLocal();
    await clearPendingImages();
    session.restored = false;
    session.notice = 'Draft saved. Building a preview…';
    watchDraft();
  } catch (error) {
    fail(error);
  } finally {
    session.busy = '';
  }
}

async function waitForLive(mergeOid: string): Promise<void> {
  session.publishing = true;
  const tick = async () => {
    if (!backend) return;
    const live = await backend.liveStatus(mergeOid).catch(() => ({ state: 'waiting' as const }));
    if (live.state === 'waiting') {
      pollTimer = window.setTimeout(tick, POLL_MS);
      return;
    }
    session.publishing = false;
    if (live.state === 'failed') {
      fail(new BackendError('unknown', 'The site couldn’t be updated. What’s live hasn’t changed.', live.details));
      return;
    }
    session.notice = 'Published. It’s live.';
    await open(backend);
    await reloadCanvas();
  };
  await tick();
}

export async function publish(): Promise<void> {
  if (!backend || !session.draft || session.busy || hasUnsaved()) return;
  session.busy = 'Publishing…';
  session.error = '';
  session.conflicts = [];
  try {
    const paths = await backend.draftFiles(session.draft);
    const result = await backend.publish(session.draft, paths);
    if (result.state === 'published') {
      window.clearTimeout(pollTimer);
      session.draft = null;
      session.status = null;
      await waitForLive(result.mergeOid);
    } else {
      await recut(paths);
    }
  } catch (error) {
    fail(error);
  } finally {
    session.busy = '';
  }
}

/** A file as it was at a commit. Null means it wasn't there; failing to look throws. */
async function fileAt(path: string, ref: string): Promise<Record<string, unknown> | null> {
  try {
    return parse(await (await backend!.readImage(path, ref)).text()) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BackendError && error.kind === 'missing') return null;
    throw error;
  }
}

/** The document at a path, as this tab holds it. */
function documentAt(path: string): Record<string, unknown> | null {
  const pageId = PAGE_FILE.exec(path)?.[1];
  if (pageId) return (state.pages[pageId]?.raw as unknown as Record<string, unknown>) ?? null;
  const project = PROJECT_FILE.exec(path)?.[1];
  if (project) {
    const entry = state.pages[`${PROJECT}${project}`];
    return entry ? { ...entry.project, blocks: blocksOf(entry.raw) } : null;
  }
  return path === SITE_FILE ? ((state.site?.raw as unknown as Record<string, unknown>) ?? null) : null;
}

/** Puts a document back as unsaved work. */
function restoreDocument(path: string, doc: Record<string, unknown>): void {
  const pageId = PAGE_FILE.exec(path)?.[1];
  const project = PROJECT_FILE.exec(path)?.[1];
  if (pageId) {
    const raw = doc as unknown as RawPage;
    if (state.pages[pageId]) state.pages[pageId].raw = raw;
    else state.pages[pageId] = { id: pageId, path, raw, saved: '' };
  } else if (project) {
    const entry = state.pages[`${PROJECT}${project}`];
    if (!entry) return;
    entry.project = doc;
    entry.raw.sections = (doc.blocks as Record<string, unknown>[]).map((block, i) => ({ id: `block-${i}`, ...block }) as RawSection);
  } else if (state.site) {
    state.site.raw = doc as unknown as RawSite;
  }
}

/**
 * The live site moved on under this draft. Merges everything the draft holds with
 * what's live, then starts afresh from there, so nobody's work is undone. Only the
 * draft's own files are carried over: the rest stay as they are live.
 *
 * Everything comes into hand before anything is thrown away. If any of it can't be
 * read this stops, with the draft still whole.
 */
async function recut(paths: string[]): Promise<void> {
  const draft = session.draft;
  if (!backend || !draft) return;
  const carried = new Map<string, Record<string, unknown>>();
  const images: PendingImage[] = [];
  const conflicts: MergeConflict[] = [];

  for (const path of paths) {
    if (IMAGE_FILE.test(path)) {
      images.push({ path, file: await backend.readImage(path, DRAFT_BRANCH) });
      continue;
    }
    const ours = documentAt(path);
    if (!ours) continue;
    const theirs = await fileAt(path, REPO.main);
    if (!theirs) {
      carried.set(path, ours);
      continue;
    }
    const base = await fileAt(path, draft.baseOid);
    const result = PAGE_FILE.test(path) ? mergePage(base, ours, theirs) : mergeObject(base, ours, theirs);
    carried.set(path, result.merged);
    conflicts.push(...result.conflicts);
  }

  await backend.discard(draft);
  await open(backend);
  for (const [path, doc] of carried) restoreDocument(path, doc);
  for (const image of images) reclaimImage(image);
  state.revision++;
  await reloadCanvas();
  session.conflicts = conflicts;
  session.notice = conflicts.length
    ? ''
    : 'The live site changed while you worked. Your changes are combined with it: save your draft again to get a fresh preview.';
}

export async function discardDraft(): Promise<void> {
  if (!backend || !session.draft || session.busy) return;
  session.busy = 'Throwing away your draft…';
  session.error = '';
  try {
    await backend.discard(session.draft);
    clearLocal();
    await clearPendingImages();
    await open(backend);
    await reloadCanvas();
    session.notice = 'Draft thrown away.';
  } catch (error) {
    fail(error);
  } finally {
    session.busy = '';
  }
}

/** The page's address on the draft's preview. */
export function previewLink(previewUrl: string): string {
  return previewUrl + pageUrl(page.value?.id ?? 'home');
}

