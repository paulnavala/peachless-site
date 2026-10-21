/**
 * Ordering and visibility rules for projects and photos. Pure functions (no
 * astro imports) so unit tests and e2e specs reuse exactly the site's logic.
 */

export interface Orderable {
  id: string;
  data: { order?: number; year?: number; title: string; hidden?: boolean; featured?: boolean };
}

export const isPublished = (entry: { data: { hidden?: boolean } }) => !entry.data.hidden;

/** Drag order first (the CMS writes 1..N), then newest year, then title, then id. */
export function compareProjects(a: Orderable, b: Orderable): number {
  return (
    (a.data.order ?? 0) - (b.data.order ?? 0) ||
    (b.data.year ?? 0) - (a.data.year ?? 0) ||
    a.data.title.localeCompare(b.data.title) ||
    a.id.localeCompare(b.id)
  );
}

export const sortProjects = <T extends Orderable>(entries: T[]): T[] => [...entries].sort(compareProjects);

/** Published entries in display order. */
export const published = <T extends Orderable>(entries: T[]): T[] => sortProjects(entries.filter(isPublished));

/** The project after `id` in display order, wrapping to the first; null when there is only one. */
export function nextProject<T extends Orderable>(ordered: T[], id: string): T | null {
  if (ordered.length < 2) return null;
  const i = ordered.findIndex((p) => p.id === id);
  if (i === -1) return null;
  return ordered[(i + 1) % ordered.length];
}

/** Featured entries for the home page; when none are marked, the first `fallback`. */
export function featured<T extends Orderable>(ordered: T[], fallback = 3): T[] {
  const picked = ordered.filter((p) => p.data.featured);
  return picked.length ? picked : ordered.slice(0, fallback);
}

export type ReelPick<P, Q> = { kind: 'project'; entry: P } | { kind: 'photo'; entry: Q };

/**
 * The home hero's work reel: work the rest of the home page doesn't show yet —
 * projects outside Selected work, photos outside the photo strip — topped up
 * from the shown ones when there aren't enough, alternating project and photo.
 */
export function reelPicks<P extends Orderable, Q extends Orderable>(
  projects: P[],
  shownProjects: P[],
  photos: Q[],
  shownPhotos: Q[],
  counts = { projects: 4, photos: 3 }
): ReelPick<P, Q>[] {
  const unshownFirst = <T extends Orderable>(all: T[], shown: T[]) => {
    const ids = new Set(shown.map((x) => x.id));
    return [...all.filter((x) => !ids.has(x.id)), ...all.filter((x) => ids.has(x.id))];
  };
  const ps = unshownFirst(projects, shownProjects).slice(0, counts.projects);
  const qs = unshownFirst(photos, shownPhotos).slice(0, counts.photos);
  return Array.from({ length: Math.max(ps.length, qs.length) }).flatMap((_, i): ReelPick<P, Q>[] => [
    ...(ps[i] ? [{ kind: 'project' as const, entry: ps[i] }] : []),
    ...(qs[i] ? [{ kind: 'photo' as const, entry: qs[i] }] : []),
  ]);
}
