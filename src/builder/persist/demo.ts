/**
 * For hosts where sign-in isn't possible. It starts from the files the build wrote
 * to site.json and keeps every save in this tab's memory. Nothing here reaches the
 * site, and it never says otherwise: a draft is ready with no preview, and
 * publishing is refused.
 */
import { MESSAGES } from './auth';
import {
  BackendError,
  type Backend,
  type DraftInfo,
  type DraftStatus,
  type FileChange,
  type LiveStatus,
  type PublishResult,
  type RepoFile,
  type RepoSnapshot,
} from './types';

const SITE_FILE = '/admin/builder/site.json';

const NOT_LIVE = 'This is a demo, so nothing here can go live. Your changes stay in this tab until you close it.';

interface SiteFile {
  files: Record<string, string>;
  /** Image paths and their blob ids, if the build lists them. */
  images?: Record<string, string>;
}

function toBlob(base64: string): Blob {
  return new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))]);
}

export class DemoBackend implements Backend {
  readonly kind = 'demo';

  private readonly send: typeof fetch;

  /** What site.json held, for going back to. */
  private original: { files: Record<string, RepoFile>; images: Record<string, string> } | null = null;

  private files: Record<string, RepoFile> = {};
  private images: Record<string, string> = {};
  private uploads = new Map<string, Blob>();
  private draft: DraftInfo | null = null;
  private saves = 0;

  constructor({ fetch: send }: { fetch?: typeof fetch } = {}) {
    this.send = send ?? ((...args) => globalThis.fetch(...args));
  }

  private async readSite(): Promise<NonNullable<DemoBackend['original']>> {
    let site: SiteFile;
    try {
      const response = await this.send(SITE_FILE);
      if (!response.ok) throw new Error(`${SITE_FILE}: ${response.status}`);
      site = (await response.json()) as SiteFile;
    } catch (error) {
      throw new BackendError('network', 'Couldn’t load the demo. Reload the page to try again.', String(error));
    }
    const files = Object.entries(site.files).map(([path, text]): [string, RepoFile] => [path, { path, text, oid: 'demo-0' }]);
    return { files: Object.fromEntries(files), images: site.images ?? {} };
  }

  async load(): Promise<RepoSnapshot> {
    if (!this.original) {
      this.original = await this.readSite();
      this.reset();
    }
    return {
      headOid: this.draft?.headOid ?? 'demo-0',
      mainOid: 'demo-0',
      files: structuredClone(this.files),
      images: { ...this.images },
      draft: this.draft && { ...this.draft },
      // Saving works here, in memory.
      canWrite: true,
      login: 'Demo',
    };
  }

  private reset() {
    this.files = structuredClone(this.original?.files ?? {});
    this.images = { ...this.original?.images };
    this.uploads.clear();
    this.draft = null;
  }

  async readImage(path: string): Promise<Blob> {
    const upload = this.uploads.get(path);
    if (!upload) throw new BackendError('missing', 'This demo only has the images added in this tab.', path);
    return upload;
  }

  async saveDraft(changes: FileChange[], _message: string, expectedHeadOid: string | null): Promise<DraftInfo> {
    if (expectedHeadOid !== (this.draft?.headOid ?? null)) throw new BackendError('moved', MESSAGES.moved);
    const oid = `demo-${++this.saves}`;
    for (const { path, text, base64, delete: remove } of changes) {
      if (remove) {
        delete this.files[path];
        delete this.images[path];
        this.uploads.delete(path);
      } else if (base64 !== undefined) {
        this.images[path] = oid;
        this.uploads.set(path, toBlob(base64));
      } else if (text !== undefined) {
        this.files[path] = { path, text, oid };
      }
    }
    this.draft = { prNumber: 0, prUrl: '', headOid: oid, baseOid: 'demo-0' };
    return { ...this.draft };
  }

  async draftFiles(): Promise<string[]> {
    return [...Object.values(this.files).filter((file) => file.oid !== 'demo-0').map((file) => file.path), ...this.uploads.keys()];
  }

  async draftStatus(): Promise<DraftStatus> {
    return { state: 'ready', previewUrl: null, tests: 'passed' };
  }

  async publish(): Promise<PublishResult> {
    throw new BackendError('forbidden', NOT_LIVE);
  }

  async liveStatus(): Promise<LiveStatus> {
    throw new BackendError('forbidden', NOT_LIVE);
  }

  async discard(): Promise<void> {
    this.reset();
  }
}
