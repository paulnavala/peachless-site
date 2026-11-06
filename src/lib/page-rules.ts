/**
 * What makes a page valid, in the builder's plain language. Pure, so the same
 * rules run live in the builder and fail the build: nothing else stands between
 * an editor and production, because CI doesn't gate Cloudflare's deploy.
 * zod can't do this: it never sees the folder a page lives in.
 */
import type { SectionType } from './content-schema';
import { allowedOn, PAGE_IDS, SECTIONS, type BuiltInPage } from './section-catalogue';

export interface PageProblem {
  /** Stable, for tests and for grouping in the Checks panel. */
  rule: 'opener' | 'next-step' | 'once' | 'reach' | 'required' | 'ids';
  message: string;
  /** The section to select when the editor clicks the problem. */
  section?: string;
}

interface SectionLike {
  id: string;
  type: SectionType;
  hidden?: boolean;
}

export function checkPage(pageId: string, sections: readonly SectionLike[]): PageProblem[] {
  const problems: PageProblem[] = [];
  const visible = sections.filter((s) => !s.hidden);
  const name = (s: SectionLike) => SECTIONS[s.type].name;

  const openers = visible.filter((s) => SECTIONS[s.type].opener);
  if (openers.length === 0) {
    problems.push({ rule: 'opener', message: 'This page has no title. Add a page opener, such as a Page header.' });
  } else if (visible[0] !== openers[0]) {
    problems.push({ rule: 'opener', message: `${name(openers[0])} holds the page title, so it has to come first.`, section: openers[0].id });
  }
  for (const extra of openers.slice(1)) {
    problems.push({ rule: 'opener', message: `A page has one title. Remove ${name(extra)}, or the other opener.`, section: extra.id });
  }

  const last = visible.at(-1);
  if (last && !SECTIONS[last.type].nextStep) {
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

  const ids = new Set<string>();
  for (const section of sections) {
    if (ids.has(section.id)) problems.push({ rule: 'ids', message: `Two sections share the name “${section.id}”.`, section: section.id });
    ids.add(section.id);
  }

  return problems;
}
