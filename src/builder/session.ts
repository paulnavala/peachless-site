/**
 * The builder's working day: load the site, keep the editor's work safe, save a
 * draft, watch its preview build, publish. The panels show this and call it;
 * only this module talks to the Backend.
 */
import { reactive } from 'vue';
import { parse } from 'yaml';
import type { Backend, DraftInfo, DraftStatus, RepoSnapshot } from './persist/types';
import { loadPages, type RawPage } from './store';

const PAGE_FILE = /^src\/content\/pages\/([a-z0-9-]+)\/index\.yaml$/;

export const session = reactive({
  phase: 'starting' as 'starting' | 'signed-out' | 'ready' | 'failed',
  /** What went wrong, in plain words. */
  error: '',
  /** The raw detail, for "copy details". */
  details: '',
  kind: 'demo' as Backend['kind'],
  login: '',
  canWrite: false,
  draft: null as DraftInfo | null,
  status: null as DraftStatus | null,
  busy: false,
});

let backend: Backend | null = null;
let snapshot: RepoSnapshot | null = null;

export const repoSnapshot = (): RepoSnapshot | null => snapshot;

function pagesFrom(files: RepoSnapshot['files']) {
  return Object.values(files).flatMap((file) => {
    const id = PAGE_FILE.exec(file.path)?.[1];
    return id ? [{ id, path: file.path, raw: parse(file.text) as RawPage }] : [];
  });
}

export async function connect(using: Backend): Promise<void> {
  backend = using;
  session.kind = using.kind;
  try {
    snapshot = await using.load();
    session.login = snapshot.login;
    session.canWrite = snapshot.canWrite;
    session.draft = snapshot.draft;
    loadPages(pagesFrom(snapshot.files));
    session.phase = 'ready';
  } catch (error) {
    session.phase = 'failed';
    session.error = error instanceof Error ? error.message : 'The site didn’t load.';
    session.details = String((error as { details?: string }).details ?? error);
  }
}
