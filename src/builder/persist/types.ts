/**
 * The contract between the builder and wherever its work is kept. The canvas and
 * panels only ever talk to a Backend, so they don't know about GitHub, and a demo
 * can stand in on hosts where sign-in isn't possible.
 *
 * Files are text the builder edits (YAML). Images are binary and go by path.
 * Paths are repo-relative, with forward slashes.
 */

export const REPO = { owner: 'paulnavala', name: 'peachless-site', main: 'main' } as const;

/** The one branch the builder's work lives on until it is published. */
export const DRAFT_BRANCH = 'builder/draft';

/** Cloudflare's branch alias turns the slash into a dash. */
export const DRAFT_PREVIEW_URL = 'https://builder-draft.peachless.pages.dev';

/** Check runs on a commit. Cloudflare's result is a check run, not a commit status. */
export const PREVIEW_CHECK = 'Cloudflare Pages';
export const TEST_CHECK = 'build-test';

/** How long a preview may take before we call it stuck (uncached builds can run long). */
export const PREVIEW_TIMEOUT_MS = 25 * 60 * 1000;

export interface RepoFile {
  path: string;
  text: string;
  /** The Git blob id, so a later save can tell whether someone else changed it. */
  oid: string;
}

export interface DraftInfo {
  prNumber: number;
  prUrl: string;
  /** The commit the draft branch is at. */
  headOid: string;
  /** The commit on main the draft was cut from. */
  baseOid: string;
}

/** What the builder works from. */
export interface RepoSnapshot {
  /** The commit these files were read at: the draft's head, or main's. */
  headOid: string;
  /** Main's head when this was read. */
  mainOid: string;
  /** Every text file the builder can edit, by path. */
  files: Record<string, RepoFile>;
  /** Every image beside those files: path to blob id. */
  images: Record<string, string>;
  /** The open draft, if there is one. */
  draft: DraftInfo | null;
  /** False when this account can read but not push. */
  canWrite: boolean;
  /** The signed-in account, for display. */
  login: string;
}

export interface FileChange {
  path: string;
  /** New contents of a text file. */
  text?: string;
  /** New contents of a binary file, as base64. */
  base64?: string;
  /** Remove the file. */
  delete?: true;
}

export type DraftStatus =
  /** Cloudflare hasn't reported yet: it creates the check run when it finishes. */
  | { state: 'building'; since: number }
  /** `previewUrl` is null in the demo, which has nothing to preview. */
  | { state: 'ready'; previewUrl: string | null; tests: 'passed' | 'running' | 'failed' }
  /** The preview build failed. */
  | { state: 'failed'; detailsUrl?: string; details: string }
  /** It has been far too long. */
  | { state: 'stuck'; since: number };

export type PublishResult =
  | { state: 'published'; mergeOid: string }
  /** Someone changed a file this draft also changed, on main. */
  | { state: 'conflict'; paths: string[] }
  /** Main moved in a way that only needs the draft re-cut, then try again. */
  | { state: 'stale' };

export type LiveStatus = { state: 'waiting' } | { state: 'live' } | { state: 'failed'; details: string };

export type BackendErrorKind =
  /** Not signed in, or the token is no longer good. */
  | 'auth'
  /** There's no such file at that commit, which isn't the same as not being able to look. */
  | 'missing'
  /** Signed in, but this account can't push. */
  | 'forbidden'
  /** The draft moved since it was read (another tab, another device). */
  | 'moved'
  | 'network'
  | 'unknown';

/** Thrown by a Backend. `message` is plain language, written for the editor. */
export class BackendError extends Error {
  constructor(
    readonly kind: BackendErrorKind,
    message: string,
    /** The raw detail, for a "copy details" button. Never shown as the message. */
    readonly details?: string
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export interface Backend {
  readonly kind: 'github' | 'demo';
  /** Reads the draft if there is one, otherwise main. */
  load(): Promise<RepoSnapshot>;
  /** A file's bytes at a commit or branch: an image the site hasn't built, or an older version. */
  readImage(path: string, ref: string): Promise<Blob>;
  /** Every file the draft changes, as GitHub has it, so nothing relies on one browser's memory. */
  draftFiles(draft: DraftInfo): Promise<string[]>;
  /** Commits to the draft branch, making the branch and its pull request if needed. */
  saveDraft(changes: FileChange[], message: string, expectedHeadOid: string | null): Promise<DraftInfo>;
  draftStatus(draft: DraftInfo, since: number): Promise<DraftStatus>;
  /** Merges the draft. Never call this before draftStatus says ready. */
  publish(draft: DraftInfo, changedPaths: string[]): Promise<PublishResult>;
  /** Whether a merge commit has finished deploying. */
  liveStatus(mergeOid: string): Promise<LiveStatus>;
  /** Throws away the draft: closes its pull request and deletes the branch. */
  discard(draft: DraftInfo): Promise<void>;
}
