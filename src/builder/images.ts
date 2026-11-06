/**
 * Images an editor has chosen but the site hasn't built yet. They stay in the
 * browser until saved, and the canvas shows them from there.
 */
import { setImageUrl } from './canvas/controller';
import { forgetImages, keepImage, keptImages } from './local';

export interface PendingImage {
  /** Repo-relative path the image will be saved to. */
  path: string;
  file: Blob;
}

const pending = new Map<string, PendingImage>();

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'image';

const extension = (name: string) => /\.[a-z0-9]+$/i.exec(name)?.[0].toLowerCase() ?? '.jpg';

const fileName = (path: string) => path.split('/').pop()!;

function hold(image: PendingImage): void {
  pending.set(image.path, image);
  setImageUrl(fileName(image.path), URL.createObjectURL(image.file));
}

/** Holds an image for a page, and returns the file name its YAML should use. */
export async function uploadImage(pageId: string, file: File): Promise<string> {
  const name = `${slug(file.name)}${extension(file.name)}`;
  const image = { path: `src/content/pages/${pageId}/${name}`, file };
  hold(image);
  // Kept so a closed tab doesn't lose it. If this fails, it's still held here.
  await keepImage(image.path, file).catch(() => undefined);
  return name;
}

/** Picks images back up after a reload. */
export async function restoreImages(): Promise<void> {
  try {
    for (const image of await keptImages()) hold(image);
  } catch {
    // Without IndexedDB there's nothing to pick up.
  }
}

/** Takes back an image a draft held, so the next save carries it. */
export function reclaimImage(image: PendingImage): void {
  hold(image);
  void keepImage(image.path, image.file).catch(() => undefined);
}

/** Shows an image that's in the repo but not built yet. */
export function showImage(path: string, file: Blob): void {
  setImageUrl(fileName(path), URL.createObjectURL(file));
}

export const pendingImages = (): PendingImage[] => [...pending.values()];

export async function clearPendingImages(): Promise<void> {
  pending.clear();
  await forgetImages().catch(() => undefined);
}

export async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
