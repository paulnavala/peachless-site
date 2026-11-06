/**
 * What makes a page valid, in the builder's plain language. Pure, so the same
 * rules run live in the builder and fail the build: nothing else stands between
 * an editor and production, because CI doesn't gate Cloudflare's deploy.
 * zod can't do this: it never sees the folder a page lives in.
 */
import type { GridElement, SectionType } from './content-schema';
import { offGrid, overlapping, tooNarrow } from './grid-plan';
import { allowedOn, PAGE_IDS, SECTIONS, type BuiltInPage } from './section-catalogue';

export interface PageProblem {
  /** Stable, for tests and for grouping in the Checks panel. */
  rule: 'opener' | 'next-step' | 'once' | 'reach' | 'required' | 'ids' | 'grid';
  message: string;
  /** The section to select when the editor clicks the problem. */
  section?: string;
}

interface SectionLike {
  id: string;
  type: SectionType;
  hidden?: boolean;
  /** A custom section's elements, which decide what it can do for a page. */
  elements?: readonly GridElement[];
}

const holds = (section: SectionLike, type: GridElement['type']) => !!section.elements?.some((element) => element.type === type);

/** A custom section can open a page with a heading of its own. */
export const opensPage = (section: SectionLike) => !!SECTIONS[section.type].opener || holds(section, 'heading');

/** A custom section can end a page with a button of its own. */
export const endsPage = (section: SectionLike) => !!SECTIONS[section.type].nextStep || holds(section, 'button');

export function checkPage(pageId: string, sections: readonly SectionLike[]): PageProblem[] {
  const problems: PageProblem[] = [];
  const visible = sections.filter((s) => !s.hidden);
  const name = (s: SectionLike) => SECTIONS[s.type].name;

  const openers = visible.filter((s) => SECTIONS[s.type].opener);
  const opensWithGrid = visible[0]?.type === 'grid' && opensPage(visible[0]);
  if (openers.length === 0 && !opensWithGrid) {
    problems.push({ rule: 'opener', message: 'This page has no title. Add a page opener, such as a Page header.' });
  } else if (openers.length > 0 && visible[0] !== openers[0]) {
    problems.push({ rule: 'opener', message: `${name(openers[0])} holds the page title, so it has to come first.`, section: openers[0].id });
  }
  for (const extra of openers.slice(1)) {
    problems.push({ rule: 'opener', message: `A page has one title. Remove ${name(extra)}, or the other opener.`, section: extra.id });
  }

  const last = visible.at(-1);
  if (last && !endsPage(last)) {
    problems.push({ rule: 'next-step', message: 'Pages end by sending people somewhere. Finish with Closing links.', section: last.id });
  }

  const seen = new Set<SectionType>();
  for (const section of visible) {
    if (SECTIONS[section.type].once && seen.has(section.type)) {
      problems.push({ rule: 'once', message: `A page can only have one ${name(section)}.`, section: section.id });
    }
    seen.add(section.type);
  }

  for (const section of visible) {
    if (!allowedOn(section.type, pageId)) {
      const home = SECTIONS[section.type].page;
      problems.push({
        rule: 'reach',
        message: home ? `${name(section)} only works on the ${home} page.` : `${name(section)} can’t go on this page.`,
        section: section.id,
      });
    }
  }

  if ((PAGE_IDS as readonly string[]).includes(pageId)) {
    for (const [type, def] of Object.entries(SECTIONS)) {
      if (def.required && def.page === (pageId as BuiltInPage) && !seen.has(type as SectionType)) {
        problems.push({ rule: 'required', message: `This page needs its ${def.name}.` });
      }
    }
  }

  for (const section of visible) {
    const elements = section.elements ?? [];
    if (overlapping(elements).length) {
      problems.push({ rule: 'grid', message: 'Two elements overlap. Move one so each has its own space.', section: section.id });
    }
    if (offGrid(elements).length) {
      problems.push({ rule: 'grid', message: 'An element runs past the grid’s right edge.', section: section.id });
    }
    if (tooNarrow(elements).length) {
      problems.push({ rule: 'grid', message: 'An element is too narrow for its words on a tablet. Widen it.', section: section.id });
    }
  }

  const ids = new Set<string>();
  for (const section of sections) {
    if (ids.has(section.id)) problems.push({ rule: 'ids', message: `Two sections share the name “${section.id}”.`, section: section.id });
    ids.add(section.id);
  }

  return problems;
}
