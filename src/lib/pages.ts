/**
 * From a page document to what a route renders: the sections in order, each
 * with the data it needs, and the page's head. Sections can't load their own
 * data, because some depend on what else the page shows: the hero's reel skips
 * work the deck and the strip already have.
 */
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import {
  getDisciplineCopy,
  getFeaturedPhotos,
  getFeaturedProjects,
  getPageDoc,
  getPortrait,
  getPublishedPhotos,
  getPublishedProjects,
  getSingleton,
  type Photo,
  type Project,
} from './content';
import {
  DISCIPLINES,
  plainPageSchema,
  SECTION_TYPES,
  TOOLS,
  TOOL_LABELS,
  type Discipline,
  type PageDoc,
  type Section,
  type SectionOf,
  type SectionType,
  type Tool,
} from './content-schema';
import { checkPage } from './page-rules';
import { reelPicks, toolCounts, workView } from './project-order';
import { projectTheme } from './project-theme';
import { SAMPLES } from './section-samples';
import { personLd, websiteLd, type JsonLdNode } from './structured-data';

export interface ReelTile {
  href: string;
  label: string;
  image: ImageMetadata;
  fit: 'cover' | 'contain';
  panel: string;
  /** Tile shape, e.g. "4 / 3". */
  ratio: string;
  /** view-transition name (work-<id>) when the project appears nowhere else on the page. */
  vt?: string;
  /** Project colour atmosphere (src/lib/project-theme.ts). */
  theme?: Record<string, string>;
}

export interface DisciplineEntry {
  title: string;
  description: string;
  href: string;
  count: string;
  image?: { image: ImageMetadata; panel: string; fit: 'cover' | 'contain' };
  /** Colour atmosphere of the project the preview comes from. */
  theme?: Record<string, string>;
}

export interface GalleryItem {
  id: string;
  title: string;
  alt: string;
  caption?: string;
  location?: string;
  src: string;
  srcset: string;
  avifSrcset: string;
  width: number;
  height: number;
  modalAfter: string;
  modalBefore?: string;
}

type Link = { label: string; link: string };
export type WorkFilter = 'all' | Discipline | Tool;

/** What each section gets besides its own fields. */
interface SectionData {
  hero: { reel: ReelTile[] };
  grid: { opener: boolean };
  deck: { projects: Project[] };
  disciplines: { entries: DisciplineEntry[] };
  'photo-strip': { photos: Photo[] };
  'about-teaser': { portrait: ImageMetadata; portraitAlt: string };
  'cta-band': { links: Link[] };
  profile: { portrait: ImageMetadata; portraitAlt: string; resume?: string; tools: { tool: Tool; count: number }[] };
  contact: {
    emails: { label: string; address: string }[];
    socials: { label: string; url: string }[];
    resume?: string;
    endpoint: string;
    hiddenFields: Record<string, string>;
  };
  gallery: { items: GalleryItem[] };
  'work-header': {
    heading: string;
    lede?: string;
    current: WorkFilter;
    counts: Record<string, number>;
    labels: { graphicDesign: string; uiux: string };
    tools: { tool: Tool; count: number }[];
  };
  'work-list': { heading: string; projects: Project[] };
  'work-logos': { projects: Project[] };
}

/** The props every section component takes; the rest lands on its root element. */
export interface SectionProps<T extends SectionType> {
  section: SectionOf<T>;
  data: T extends keyof SectionData ? SectionData[T] : undefined;
  /** Ends the page, so it carries [data-next-step]. */
  last?: boolean;
  /** On the first screen: no entrance, and its images load right away. */
  aboveFold?: boolean;
  class?: string;
  [attr: string]: unknown;
}

export interface PlannedSection {
  section: Section;
  data: unknown;
  last: boolean;
  aboveFold: boolean;
  /** Attributes for the section's root element. */
  root: Record<string, string>;
}

export interface LoadedPage {
  head: {
    title?: string;
    description: string;
    canonical?: string;
    preloadSerif: 'normal' | 'italic';
    footerCta: boolean;
    jsonLd?: JsonLdNode[];
  };
  plan: PlannedSection[];
}

export interface WorkViewOptions {
  discipline?: Discipline;
  /** A "Made with" view: the projects made with this tool. */
  tool?: Tool;
  /** For alias URLs (/projects/logo-design/): point search engines at the real page. */
  canonical?: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function reelTiles(projects: Project[], deck: Project[], photos: Photo[], strip: Photo[]): Promise<ReelTile[]> {
  const deckIds = new Set(deck.map((p) => p.id));
  const photoRatio = (w: number, h: number) => (w / h < 0.9 ? '4 / 5' : w / h <= 1.15 ? '1 / 1' : w / h < 1.45 ? '4 / 3' : '3 / 2');
  return reelPicks(projects, deck, photos, strip).map((pick) => {
    if (pick.kind === 'photo') {
      const { image, title } = pick.entry.data;
      return { href: '/photography/', label: title, image, fit: 'cover', panel: 'none', ratio: photoRatio(image.width, image.height) };
    }
    const { cover, title, accent } = pick.entry.data;
    const ratio = cover.fit === 'cover' ? '4 / 3' : cover.image.width / cover.image.height > 1.2 ? '1 / 1' : '4 / 5';
    return {
      href: `/projects/${pick.entry.id}/`,
      label: title,
      image: cover.image,
      fit: cover.fit,
      panel: cover.panel,
      ratio,
      vt: deckIds.has(pick.entry.id) ? undefined : `work-${pick.entry.id}`,
      theme: projectTheme(accent),
    };
  });
}

async function disciplineEntries(projects: Project[], photos: Photo[]): Promise<DisciplineEntry[]> {
  const copy = await getDisciplineCopy();
  const firstOf = (discipline: Discipline) => {
    const list = projects.filter((p) => p.data.disciplines.includes(discipline));
    // Prefer a photographic cover for variety; fall back to the first project.
    const pick = list.find((p) => p.data.cover.fit === 'cover') ?? list[0];
    return { list, pick };
  };
  const uiux = firstOf('uiux');
  const graphic = firstOf('graphic-design');
  // Shared projects lead with their screens, so Graphic design previews a project
  // that is graphic design alone.
  const graphicPreview = graphic.list.find((p) => !p.data.disciplines.includes('uiux')) ?? graphic.list[0];
  const preview = (project?: Project) =>
    project && {
      image: { image: project.data.cover.image, panel: project.data.cover.panel, fit: project.data.cover.fit },
      theme: projectTheme(project.data.accent),
    };
  return [
    { ...copy.uiux, href: '/projects/uiux/', count: plural(uiux.list.length, 'project'), ...preview(uiux.pick) },
    { ...copy.graphicDesign, href: '/projects/graphic-design/', count: plural(graphic.list.length, 'project'), ...preview(graphicPreview) },
    {
      ...copy.photography,
      href: '/photography/',
      count: plural(photos.length, 'photo'),
      image: photos[0] && { image: photos[0].data.image, panel: 'none', fit: 'cover' },
    },
  ];
}

async function galleryItems(): Promise<GalleryItem[]> {
  const entries = await getPublishedPhotos();
  return Promise.all(
    entries.map(async (e) => {
      // `width` pins the fallback <img src> to a sensible variant; without it
      // Astro would point at the full-size original. AVIF first (photos are
      // roughly half the bytes), WebP for older browsers.
      const gridOptions = { src: e.data.image, width: 1200, widths: [480, 640, 800, 1200] };
      const grid = await getImage({ ...gridOptions, format: 'webp' });
      const gridAvif = await getImage({ ...gridOptions, format: 'avif' });
      const after = await getImage({ src: e.data.image, width: Math.min(e.data.image.width, 2400), format: 'webp' });
      const before = e.data.before
        ? await getImage({ src: e.data.before, width: Math.min(e.data.before.width, 2400), format: 'webp' })
        : null;
      return {
        id: e.id,
        title: e.data.title,
        alt: e.data.alt,
        caption: e.data.caption,
        location: e.data.location,
        src: grid.src,
        srcset: grid.srcSet.attribute,
        avifSrcset: gridAvif.srcSet.attribute,
        width: Number(grid.attributes.width),
        height: Number(grid.attributes.height),
        modalAfter: after.src,
        ...(before ? { modalBefore: before.src } : {}),
      };
    })
  );
}

/** A Work view: which projects it lists and what it calls itself. */
async function workViewOf(doc: PageDoc, { discipline, tool }: WorkViewOptions) {
  const header = doc.sections.find((s) => s.type === 'work-header');
  const site = (await getSingleton('site')).data;
  const copy = await getDisciplineCopy();
  const all = await getPublishedProjects();
  const inView = all.filter((p) => (!discipline || p.data.disciplines.includes(discipline)) && (!tool || p.data.tools.includes(tool)));
  // Shared projects open on their screens, so Graphic design leads with its own.
  const projects =
    discipline === 'graphic-design'
      ? [...inView.filter((p) => p.data.disciplines.length === 1), ...inView.filter((p) => p.data.disciplines.length > 1)]
      : inView;
  const named = { 'graphic-design': copy.graphicDesign, uiux: copy.uiux } as const;

  /** A tool's page describes itself from its projects, so it needs no copy of its own. */
  const madeWith = (t: Tool) => {
    const names = projects.slice(0, 3).map((p) => p.data.title);
    const list = new Intl.ListFormat('en-GB').format(projects.length > 3 ? [...names, 'more'] : names);
    return {
      heading: `Made with ${TOOL_LABELS[t]}`,
      lede: `Every project where I used ${TOOL_LABELS[t]}.`,
      description: `Work made with ${TOOL_LABELS[t]} by ${site.ownerName ?? site.siteName}: ${list}.`,
    };
  };
  const view = tool
    ? madeWith(tool)
    : discipline
      ? { heading: named[discipline].title, lede: named[discipline].description, description: named[discipline].description }
      : {
          heading: header?.heading ?? doc.title,
          lede: header?.intro,
          description: doc.seo.description ?? header?.intro ?? header?.heading ?? doc.title,
        };

  // "Keep exploring": the other views, so the page never dead-ends. Three links
  // at most, so they sit on one line or stack.
  const others: Link[] = [
    ...(discipline || tool ? [{ link: '/projects/', label: 'All work' }] : []),
    ...DISCIPLINES.filter((d) => d !== discipline).map((d) => ({ link: `/projects/${d}/`, label: named[d].title })),
    ...(tool ? [] : [{ link: '/photography/', label: copy.photography.title }]),
  ];

  return {
    ...view,
    all,
    others,
    ...workView(projects),
    title: tool || discipline ? view.heading : doc.title,
    current: (tool ?? discipline ?? 'all') as WorkFilter,
    counts: {
      all: all.length,
      ...Object.fromEntries(DISCIPLINES.map((d) => [d, all.filter((p) => p.data.disciplines.includes(d)).length])),
    },
    labels: { graphicDesign: copy.graphicDesign.title, uiux: copy.uiux.title },
  };
}

/** The opener's own words, for a page with no description of its own. */
function openerSummary(section?: Section): string | undefined {
  switch (section?.type) {
    case 'profile':
      return section.statement;
    case 'contact':
      return section.lede ?? section.heading;
    case 'page-header':
      return section.intro ?? section.heading;
    default:
      return undefined;
  }
}

/** Attributes the builder finds a section by, and its design choices. */
function rootAttributes(section: Section): Record<string, string> {
  const { id, type, surface, spaceTop, spaceBottom } = section;
  return {
    'data-section': id,
    'data-section-type': type,
    ...(surface !== 'default' ? { 'data-surface': surface } : {}),
    ...(spaceTop !== 'default' ? { 'data-space-top': spaceTop } : {}),
    ...(spaceBottom !== 'default' ? { 'data-space-bottom': spaceBottom } : {}),
  };
}

/** Sections with what each needs, in order. */
async function planSections(doc: PageDoc, sections: Section[], options: WorkViewOptions) {
  const site = (await getSingleton('site')).data;
  const shows = (type: SectionType) => sections.some((s) => s.type === type);

  const projects = await getPublishedProjects();
  const photos = await getPublishedPhotos();
  const deck = shows('deck') ? await getFeaturedProjects() : [];
  const strip = shows('photo-strip') ? (await getFeaturedPhotos(5)).slice(0, 5) : [];
  const portrait = await getPortrait();
  const work = shows('work-header') ? await workViewOf(doc, options) : null;

  const dataFor = async (section: Section): Promise<unknown> => {
    switch (section.type) {
      case 'hero':
        return { reel: section.reel ? await reelTiles(projects, deck, photos, strip) : [] };
      case 'grid':
        return { opener: section === sections[0] };
      case 'deck':
        return { projects: deck };
      case 'disciplines':
        return { entries: await disciplineEntries(projects, photos) };
      case 'photo-strip':
        return { photos: strip };
      case 'about-teaser':
        return { portrait: portrait.image, portraitAlt: portrait.alt };
      case 'cta-band':
        return { links: section.auto ? (work?.others ?? section.links) : section.links };
      case 'profile':
        return { portrait: portrait.image, portraitAlt: portrait.alt, resume: site.resume, tools: toolCounts(projects, TOOLS) };
      case 'contact': {
        const form = (await getSingleton('form')).data;
        return { emails: site.emails, socials: site.socials, resume: site.resume, endpoint: form.endpoint, hiddenFields: form.hidden };
      }
      case 'gallery':
        return { items: await galleryItems() };
      case 'work-header':
        return { heading: work!.heading, lede: work!.lede, current: work!.current, counts: work!.counts, labels: work!.labels, tools: toolCounts(work!.all, TOOLS) };
      case 'work-list':
        return { heading: work!.heading, projects: work!.large };
      case 'work-logos':
        return { projects: work!.compact };
      default:
        return undefined;
    }
  };

  const plan: PlannedSection[] = await Promise.all(
    sections.map(async (section, i) => ({
      section,
      data: await dataFor(section),
      last: i === sections.length - 1,
      // A Page header is short, so what follows it is on the first screen too.
      aboveFold: i === 0 || (i === 1 && sections[0].type === 'page-header'),
      root: rootAttributes(section),
    }))
  );

  return { plan, work, site, portrait, shows };
}

export async function loadPage(id: string, options: WorkViewOptions = {}): Promise<LoadedPage> {
  const doc = await getPageDoc(id);
  const problems = checkPage(id, doc.sections);
  if (problems.length) throw new Error(`The ${id} page breaks a page rule: ${problems.map((p) => p.message).join(' ')}`);

  const sections = doc.sections.filter((s) => !s.hidden);
  const { plan, work, site, portrait, shows } = await planSections(doc, sections, options);

  const jsonLdFor = async (): Promise<JsonLdNode[] | undefined> => {
    if (id !== 'home' && id !== 'about') return undefined;
    const origin = new URL(import.meta.env.SITE);
    const share = await getImage({ src: portrait.image, width: 800, format: 'jpg' });
    const person = personLd(site, origin, share.src);
    return id === 'home' ? [websiteLd(site, origin), person] : [person];
  };

  const homeTitle = site.ownerName && site.jobTitle ? `${site.ownerName}, ${site.jobTitle}` : undefined;

  return {
    head: {
      title: id === 'home' ? homeTitle : (work?.title ?? doc.title),
      description: work?.description ?? doc.seo.description ?? openerSummary(sections[0]) ?? site.seo.description,
      canonical: options.canonical,
      preloadSerif: shows('hero') ? 'italic' : 'normal',
      footerCta: !shows('contact'),
      jsonLd: await jsonLdFor(),
    },
    plan,
  };
}

/**
 * One real instance of every section, every optional field filled, for the
 * builder's canvas to clone. Custom sections come once per surface, so the
 * accessibility specs can read them on each background.
 */
export async function loadSpecimens(): Promise<PlannedSection[]> {
  const portrait = await getPortrait();
  const surfaces = ['default', 'paper', 'blush', 'inverse'] as const;
  const every = (id: string, surface: string) => ({
    id,
    type: 'grid',
    surface,
    elements: [
      { id: 'a', type: 'heading', col: 1, row: 1, w: 6, h: 2, text: 'A heading', style: 'h2' },
      { id: 'b', type: 'heading', col: 7, row: 1, w: 6, h: 2, text: 'A smaller heading', style: 'h4' },
      { id: 'c', type: 'text', col: 1, row: 3, w: 6, h: 3, body: 'Some **text** with a [link](/about/).' },
      { id: 'd', type: 'image', col: 7, row: 3, w: 6, h: 6, image: 'portrait.jpg', alt: 'A portrait', caption: 'A caption' },
      { id: 'e', type: 'quote', col: 1, row: 6, w: 6, h: 2, quote: 'A kind word.', attribution: 'Someone kind' },
      { id: 'f', type: 'button', col: 1, row: 8, w: 3, h: 1, label: 'A button', link: '/contact/' },
      { id: 'g', type: 'button', col: 4, row: 8, w: 3, h: 1, label: 'Another', link: '/about/', style: 'secondary' },
      { id: 'h', type: 'divider', col: 1, row: 9, w: 12, h: 1 },
    ],
  });
  const raw = [
    ...SECTION_TYPES.filter((type) => type !== 'grid').map((type) => ({ id: `specimen-${type}`, ...SAMPLES[type] })),
    ...surfaces.map((surface) => every(`specimen-grid-${surface}`, surface)),
  ];
  const doc = plainPageSchema.parse({ title: 'Specimens', sections: raw });
  // The real image, now the schema has seen its path.
  for (const section of doc.sections) {
    if (section.type !== 'grid') continue;
    for (const element of section.elements) {
      if (element.type === 'image') (element as { image: unknown }).image = portrait.image;
    }
  }
  return (await planSections(doc, doc.sections, {})).plan;
}
