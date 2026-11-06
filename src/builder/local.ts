/**
 * Keeping an editor's work safe on this computer. Saving to GitHub is a deliberate
 * step, because every save starts a build, so anything not saved yet lives here:
 * a closed tab or a crash loses nothing.
 *
 * Pages go to localStorage. Images are too big for it, so they go to IndexedDB.
 */
import type { RawPage } from './store';

const KEY = 'peachless-builder:work';
const DATABASE = 'peachless-builder';
const IMAGES = 'images';

export interface LocalPage {
  path: string;
  /** The page as it was when this work started, so it can be merged later. */
  base: string;
  raw: RawPage;
}

export interface LocalWork {
  /** The commit this work is based on. */
  headOid: string;
  pages: Record<string, LocalPage>;
}

export function writeLocal(work: LocalWork): boolean {
  try {
    if (Object.keys(work.pages).length) localStorage.setItem(KEY, JSON.stringify(work));
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    // Storage can be full or switched off. The work is still in this tab.
    return false;
  }
}

export function readLocal(): LocalWork | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? (JSON.parse(stored) as LocalWork) : null;
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IMAGES);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withImages<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(IMAGES, mode).objectStore(IMAGES));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const keepImage = (path: string, file: Blob): Promise<unknown> => withImages('readwrite', (store) => store.put(file, path));

export const forgetImages = (): Promise<unknown> => withImages('readwrite', (store) => store.clear());

export async function keptImages(): Promise<{ path: string; file: Blob }[]> {
  const paths = (await withImages('readonly', (store) => store.getAllKeys())) as string[];
  const files = (await withImages('readonly', (store) => store.getAll())) as Blob[];
  return paths.map((path, i) => ({ path, file: files[i] }));
}

/**
 * Two tabs editing the same site would overwrite each other's autosave, so only
 * one gets to edit. Returns false if another tab has it, or the browser can't say.
 */
export function claimTab(): Promise<boolean> {
  if (!('locks' in navigator)) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks.request('peachless-builder', { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      // Held until the tab closes.
      return lock ? new Promise(() => {}) : undefined;
    });
  });
}
