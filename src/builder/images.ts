/**
 * Images an editor has chosen but the site hasn't built yet. They stay in the
 * browser until saved, and the canvas shows them from there.
 */
import { setImageUrl } from './canvas/controller';

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

/** Holds an image for a page, and returns the file name its YAML should use. */
export async function uploadImage(pageId: string, file: File): Promise<string> {
  const name = `${slug(file.name)}${extension(file.name)}`;
  const path = `src/content/pages/${pageId}/${name}`;
  pending.set(path, { path, file });
  setImageUrl(name, URL.createObjectURL(file));
  return name;
}

export const pendingImages = (): PendingImage[] => [...pending.values()];

export function clearPendingImages(): void {
  pending.clear();
}

export async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
