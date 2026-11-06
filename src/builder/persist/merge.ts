/**
 * Three-way merges, for when main moved on while a draft was open. They work on
 * raw documents, the way the files hold them: `base` is what the draft started
 * from, `ours` is the draft and `theirs` is main.
 *
 * Where both sides changed the same thing differently, `merged` keeps ours and
 * `conflicts` says so, so the result is always a whole document.
 */
import type { SectionType } from '../../lib/content-schema';
import { SECTIONS } from '../../lib/section-catalogue';

type Doc = Record<string, unknown>;

export interface MergeConflict {
  /** Where in the document: `title`, `cover.alt`, `blocks.2`, `sections.<id>`. */
  path: string;
  /** The section's id, to take the editor to it. */
  section?: string;
  message: string;
}

export interface MergeResult<T> {
  merged: T;
  conflicts: MergeConflict[];
}

const isDoc = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Same data, whatever order the keys are in. A key set to undefined counts as absent. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => same(item, b[i]));
  if (isDoc(a) && isDoc(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => same(a[key], b[key]));
  return false;
}

const capitalised = (text: string) => text[0].toUpperCase() + text.slice(1);

function clash(name: string, ours: unknown, theirs: unknown): string {
  if (ours === undefined) return `You removed ${name}, but it changed somewhere else. Choose whether to keep it.`;
  if (theirs === undefined) return `${capitalised(name)} was removed somewhere else, but you changed it here. Choose whether to keep it.`;
  return `${capitalised(name)} changed here and somewhere else. Choose which version to keep.`;
}

const SPOKEN: Record<string, string> = { seo: 'search', alt: 'image description' };

/** A key path as a reader would say it: `cover.alt` is "the cover image description". */
const fieldName = (path: readonly string[]) =>
  `the ${path.map((key) => SPOKEN[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).join(' ')}`;

/** One value, on three sides. Nothing here looks inside it. */
function pick(base: unknown, ours: unknown, theirs: unknown): { value: unknown; clashed: boolean } {
  if (same(ours, theirs) || same(theirs, base)) return { value: ours, clashed: false };
  if (same(ours, base)) return { value: theirs, clashed: false };
  return { value: ours, clashed: true };
}

const lengthsMatch = (lists: unknown[]): lists is unknown[][] =>
  lists.every(Array.isArray) && lists.every((list) => (list as unknown[]).length === (lists[0] as unknown[]).length);

// A block's type decides its fields, so its keys don't merge one by one.
function mergeBlocks(base: unknown[], ours: unknown[], theirs: unknown[], conflicts: MergeConflict[]): unknown[] {
  return ours.map((block, i) => {
    const { value, clashed } = pick(base[i], block, theirs[i]);
    if (clashed) {
      conflicts.push({ path: `blocks.${i}`, message: clash(`block ${i + 1}`, block, theirs[i]) });
    }
    return value;
  });
}

function mergeKeys(base: Doc, ours: Doc, theirs: Doc, at: readonly string[], conflicts: MergeConflict[]): Doc {
  const merged: Doc = {};
  for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    const path = [...at, key];
    const [o, t, b] = [ours[key], theirs[key], base[key]];
    const { value, clashed } = pick(b, o, t);
    let result = value;
    if (clashed && isDoc(o) && isDoc(t)) {
      result = mergeKeys(isDoc(b) ? b : {}, o, t, path, conflicts);
    } else if (clashed && key === 'blocks' && !at.length && lengthsMatch([b, o, t])) {
      result = mergeBlocks(b as unknown[], o as unknown[], t as unknown[], conflicts);
    } else if (clashed) {
      conflicts.push({ path: path.join('.'), message: clash(fieldName(path), o, t) });
    }
    if (result !== undefined) merged[key] = result;
  }
  return merged;
}

/** Key by key, for site.yaml and project files. A project's `blocks` match by index. */
export function mergeObject<T extends Doc>(base: Doc | null | undefined, ours: T, theirs: Doc): MergeResult<T> {
  const conflicts: MergeConflict[] = [];
  return { merged: mergeKeys(base ?? {}, ours, theirs, [], conflicts) as T, conflicts };
}

interface SectionLike extends Doc {
  id: string;
}

const sectionsOf = (doc: Doc | null | undefined) => (Array.isArray(doc?.sections) ? (doc.sections as SectionLike[]) : []);

const idsOf = (sections: readonly SectionLike[]) => sections.map((section) => section.id);

function sectionName(section: Doc | undefined): string {
  const name = SECTIONS[section?.type as SectionType]?.name;
  if (!name) return 'this section';
  return /section$/i.test(name) ? `the ${name}` : `the ${name} section`;
}

/** Did this side move anything that both it and the base still have? */
function reordered(base: readonly string[], side: readonly string[]): boolean {
  const kept = base.filter((id) => side.includes(id));
  return side.filter((id) => base.includes(id)).some((id, i) => id !== kept[i]);
}

function mergeOrder(base: string[], ours: string[], theirs: string[], kept: ReadonlySet<string>): string[] {
  const followTheirs = reordered(base, theirs) && !reordered(base, ours);
  const [lead, other] = followTheirs ? [theirs, ours] : [ours, theirs];
  const order = lead.filter((id) => kept.has(id));
  // What only the other side has goes after the section it followed there.
  other.forEach((id, i) => {
    if (!kept.has(id) || order.includes(id)) return;
    const before = other.slice(0, i).findLast((earlier) => order.includes(earlier));
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, id);
  });
  return order;
}

function mergeSections(base: SectionLike[], ours: SectionLike[], theirs: SectionLike[], conflicts: MergeConflict[]): SectionLike[] {
  const index = (sections: SectionLike[]) => new Map(sections.map((section) => [section.id, section]));
  const [b, o, t] = [index(base), index(ours), index(theirs)];
  const kept = new Map<string, SectionLike>();

  for (const id of new Set([...o.keys(), ...t.keys()])) {
    const { value, clashed } = pick(b.get(id), o.get(id), t.get(id));
    if (clashed) {
      const name = sectionName(o.get(id) ?? t.get(id));
      conflicts.push({ path: `sections.${id}`, section: id, message: clash(name, o.get(id), t.get(id)) });
    }
    if (value !== undefined) kept.set(id, value as SectionLike);
  }

  return mergeOrder(idsOf(base), idsOf(ours), idsOf(theirs), new Set(kept.keys())).map((id) => kept.get(id)!);
}

/** Section by section, matched by id. The page's other fields merge key by key. */
export function mergePage<T extends Doc>(base: Doc | null | undefined, ours: T, theirs: Doc): MergeResult<T> {
  const conflicts: MergeConflict[] = [];
  const withoutSections = ({ sections: _sections, ...rest }: Doc) => rest;
  const fields = mergeKeys(withoutSections(base ?? {}), withoutSections(ours), withoutSections(theirs), [], conflicts);
  const sections = mergeSections(sectionsOf(base), sectionsOf(ours), sectionsOf(theirs), conflicts);
  return { merged: { ...fields, sections } as unknown as T, conflicts };
}
