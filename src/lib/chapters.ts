/**
 * A project story's chapters: every block with a heading becomes a numbered,
 * linkable chapter, and three or more get an "In this story" list in the hero.
 * Pure (no astro imports), so e2e specs reuse exactly the site's ids.
 */

/** The heading a guidelines block shows when the editor leaves it empty. */
export const GUIDELINES_HEADING = 'Brand guidelines';

/** Show the table of contents from this many chapters. */
export const TOC_MIN_CHAPTERS = 3;

/** Ids the page already uses: a chapter must never take one. */
export const RESERVED_IDS = new Set([
  'main',
  'top',
  'mobile-menu',
  'project-toc-title',
  'next-project-title',
  'next-step-title',
  'footer-cta-title',
  'footer-explore',
]);

export interface Chapter {
  /** Index of the block in the story. */
  block: number;
  id: string;
  title: string;
}

type StoryBlock = { type: string; heading?: string };

export function headingOf(block: StoryBlock): string | undefined {
  if (block.type === 'guidelines') return block.heading || GUIDELINES_HEADING;
  if (['text', 'gallery', 'logo', 'palette'].includes(block.type)) return block.heading || undefined;
  return undefined;
}

/** "What I’d do differently" → "what-id-do-differently"; "Brașov" → "brasov". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function storyChapters(blocks: StoryBlock[]): Chapter[] {
  const used = new Set(RESERVED_IDS);
  const chapters: Chapter[] = [];
  blocks.forEach((block, i) => {
    const title = headingOf(block);
    if (!title) return;
    const base = slugify(title) || `chapter-${chapters.length + 1}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    chapters.push({ block: i, id, title });
  });
  return chapters;
}
