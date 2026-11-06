/**
 * Content model v2: plain zod schemas + constants, shared by
 * src/content.config.ts (build), tests/unit (CMS parity) and tests/e2e.
 * public/admin/config.yml must mirror these field for field —
 * tests/unit/cms-config.spec.ts fails the build when they drift.
 */
import { z } from 'astro/zod';

// Schemas with images take Astro's `image()` helper (tests pass a string stub).
// They are generic over its return type so ImageMetadata survives inference.

// The order is the site's: UI/UX leads wherever disciplines are listed.
export const DISCIPLINES = ['uiux', 'graphic-design'] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  'graphic-design': 'Graphic design',
  uiux: 'UI/UX',
};

/** A project's disciplines in the site's order, whatever order its file lists them in. */
export const sortDisciplines = (disciplines: readonly Discipline[]): Discipline[] =>
  DISCIPLINES.filter((d) => disciplines.includes(d));

/** Disciplines as a reader would say them: "UI/UX & Graphic design". */
export function disciplineList(disciplines: readonly Discipline[]): string {
  const labels = sortDisciplines(disciplines).map((d) => DISCIPLINE_LABELS[d]);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} & ${labels.at(-1)}` : (labels[0] ?? '');
}

// The order is the "Made with" filter's: interface tools first.
export const TOOLS = ['figma', 'xd', 'miro', 'illustrator', 'photoshop', 'indesign', 'canva', 'lightroom'] as const;
export type Tool = (typeof TOOLS)[number];
export const TOOL_LABELS: Record<Tool, string> = {
  photoshop: 'Photoshop',
  illustrator: 'Illustrator',
  indesign: 'InDesign',
  canva: 'Canva',
  xd: 'Adobe XD',
  figma: 'Figma',
  miro: 'Miro',
  lightroom: 'Lightroom',
};

/** A project's tools in the site's order, whatever order its file lists them in. */
export const sortTools = (tools: readonly Tool[]): Tool[] => TOOLS.filter((t) => tools.includes(t));

/** Token-named backgrounds for logos and other transparent artwork. `accent` is
 *  the project's own colour, softened (src/lib/project-theme.ts). */
export const PANELS = ['none', 'accent', 'linen', 'paper', 'blush', 'clay', 'espresso'] as const;
export type Panel = (typeof PANELS)[number];

/** Device frames the site draws around screens (galleries, prototype previews). */
export const FRAMES = ['none', 'phone', 'browser'] as const;
export type Frame = (typeof FRAMES)[number];

/** Folder names a project may not use: they are (or were) static routes. */
export const RESERVED_PROJECT_IDS = [
  'graphic-design',
  'uiux',
  'ui-ux',
  'logo-design',
  'guidelines',
  'index',
  'all',
  'page',
  'projects',
  'tools',
] as const;

/** Folder names a custom page may not use: its address would clash with a route,
 *  a redirect or a folder in public/. tests/unit/content-files.spec.ts checks the
 *  last two against the real ones. */
export const RESERVED_PAGE_IDS = [
  'admin',
  'projects',
  'files',
  'uploads',
  'icons',
  'og',
  'index',
  '404',
  'uiux',
  'sitemap',
  'robots',
] as const;

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
export const FIGMA_RE = /^https:\/\/(www\.)?figma\.com\/(proto|design|file|make|board)\//;
export const LINK_RE = /^(\/|https:\/\/|mailto:)/;
// Only the extension: on upload the CMS tests this against the file's own name,
// so a pattern on the stored path would refuse every upload.
export const PDF_RE = /\.[Pp][Dd][Ff]$/;

const req = (max: number) => z.string().trim().min(1).max(max);
const opt = (max: number) => z.string().trim().max(max).optional();

export const blockSchema = <T extends z.ZodType>(image: () => T) =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      heading: opt(80),
      body: z.string().trim().min(1), // markdown
    }),
    z.object({
      type: z.literal('image'),
      image: image(),
      alt: req(200),
      caption: opt(200),
      size: z.enum(['inline', 'wide', 'full']).default('wide'),
    }),
    z.object({
      type: z.literal('gallery'),
      heading: opt(80),
      frame: z.enum(FRAMES).default('none'),
      images: z.array(z.object({ image: image(), alt: req(200), caption: opt(200) })).min(2).max(12),
    }),
    z.object({
      type: z.literal('quote'),
      quote: req(400),
      attribution: opt(80),
    }),
    z.object({
      type: z.literal('logo'),
      heading: opt(80),
      caption: opt(200),
      variants: z
        .array(z.object({ image: image(), alt: req(200), label: opt(40), panel: z.enum(PANELS).default('linen') }))
        .min(1)
        .max(6),
    }),
    z.object({
      type: z.literal('palette'),
      heading: opt(80),
      swatches: z.array(z.object({ name: req(40), hex: z.string().regex(HEX_RE) })).min(1).max(12),
    }),
    z.object({
      type: z.literal('guidelines'),
      heading: opt(80),
      pages: z.array(z.object({ title: req(80), image: image() })).min(1).max(40),
    }),
    z.object({
      type: z.literal('prototype'),
      url: z.string().regex(FIGMA_RE, 'Paste a figma.com prototype or design link'),
      label: opt(40),
      poster: image().optional(),
      frame: z.enum(FRAMES).default('none'),
    }),
    z.object({
      type: z.literal('before-after'),
      before: image(),
      after: image(),
      alt: req(200),
      caption: opt(200),
    }),
  ]);

export const projectSchema = <T extends z.ZodType>(image: () => T) =>
  z.object({
    title: req(80),
    summary: req(160),
    disciplines: z.array(z.enum(DISCIPLINES)).min(1),
    year: z.number().int().min(2000).max(2100).optional(),
    client: opt(80),
    role: opt(80),
    challenge: opt(160),
    outcome: opt(160),
    tools: z.array(z.enum(TOOLS)).default([]),
    cover: z.object({
      image: image(),
      alt: req(200),
      panel: z.enum(PANELS).default('none'),
      fit: z.enum(['cover', 'contain']).default('cover'),
    }),
    accent: z.string().regex(HEX_RE).optional(),
    featured: z.boolean().default(false),
    compact: z.boolean().default(false),
    hidden: z.boolean().default(false),
    order: z.number().int().min(0).default(0),
    seo: z.object({ title: opt(60), description: opt(160), image: image().optional() }).optional(),
    blocks: z.array(blockSchema(image)).min(1),
  });

export const photoSchema = <T extends z.ZodType>(image: () => T) =>
  z.object({
    title: req(80),
    image: image(),
    alt: req(200),
    before: image().optional(),
    caption: opt(200),
    location: opt(80),
    featured: z.boolean().default(false),
    hidden: z.boolean().default(false),
    order: z.number().int().min(0).default(0),
  });

const seo = z.object({ description: opt(160) }).default({});
const link = z.object({ label: req(40), link: z.string().regex(LINK_RE) });
const disciplineCopy = z.object({ title: req(40), description: req(200) });

/** What each kind of work is called, on Home and on the Work page's own views. */
export const disciplinesSchema = z.object({
  graphicDesign: disciplineCopy,
  uiux: disciplineCopy,
  photography: disciplineCopy,
});


export const siteSchema = <T extends z.ZodType>(image: () => T) =>
  z.object({
    siteName: req(40),
    ownerName: opt(40),
    jobTitle: opt(60),
    portrait: image(),
    portraitAlt: req(200),
    tagline: req(120),
    nav: z
      .array(z.object({ label: req(30), href: z.string().regex(LINK_RE), cta: z.boolean().default(false) }))
      .min(1)
      .max(6),
    emails: z.array(z.object({ label: req(30), address: z.email() })).min(1),
    socials: z.array(z.object({ label: req(30), url: z.url() })).default([]),
    resume: z.string().regex(PDF_RE).optional(),
    cta: z.object({
      eyebrow: opt(60),
      heading: req(80),
      buttonLabel: req(40),
      buttonLink: z.string().regex(LINK_RE),
    }),
    seo: z.object({ description: req(160), image: image().optional() }),
  });

// Developer-only settings (read-only in the CMS).
export const formSchema = z
  .object({
    endpoint: z.string().default(''),
    hidden: z.record(z.string(), z.string()).default({}),
  })
  // Web3Forms rejects every submission without its access_key: fail the build
  // rather than deploy a contact form that can't send.
  .refine((s) => !s.endpoint.includes('web3forms.com') || !!s.hidden.access_key, {
    message: 'access_key is required when the endpoint is Web3Forms',
    path: ['hidden'],
  });

// Pages as data. A section's design choices are token names, never raw values,
// so the style guard's rules hold for anything an editor can build.

/** A section's background: the site's surfaces. `default` is the page itself. */
export const SURFACES = ['default', 'paper', 'blush', 'inverse'] as const;
export type Surface = (typeof SURFACES)[number];

/** Space above or below a section. `default` is whatever the section does by itself. */
export const SPACES = ['default', 'tight', 'none'] as const;
export type Space = (typeof SPACES)[number];

export const SECTION_TYPES = [
  'hero',
  'page-header',
  'grid',
  'manifesto',
  'deck',
  'disciplines',
  'photo-strip',
  'about-teaser',
  'cta-band',
  'profile',
  'contact',
  'fortune',
  'gallery',
  'work-header',
  'work-list',
  'work-logos',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

const sectionBase = {
  id: z.string().regex(ID_RE),
  hidden: z.boolean().default(false),
  surface: z.enum(SURFACES).default('default'),
  sheet: z.boolean().default(false),
  spaceTop: z.enum(SPACES).default('default'),
  spaceBottom: z.enum(SPACES).default('default'),
};

// A custom section: elements on a 12-column grid. Rows only set a minimum height,
// so text can't clip; elements can't overlap (page-rules.ts), so reading order
// is simply top to bottom, left to right.
export const GRID_COLUMNS = 12;
export const GRID_MAX_ROW = 60;

export const ELEMENT_TYPES = ['heading', 'text', 'image', 'button', 'quote', 'divider'] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

/** The narrowest an element can go, in columns: below this its words won't fit a tablet. */
export const ELEMENT_MIN_WIDTH: Record<ElementType, number> = { heading: 3, text: 3, image: 2, button: 2, quote: 4, divider: 1 };

/** Heading looks, by the site's own type tokens. A heading's level is worked out
 *  from its place on the page, so a look can never break the outline. */
export const HEADING_STYLES = ['statement', 'h1', 'h2', 'h3', 'h4'] as const;
export const TEXT_SIZES = ['lede', 'body', 'small'] as const;
export const BUTTON_STYLES = ['primary', 'secondary'] as const;
export const ALIGNMENTS = ['start', 'center', 'end'] as const;
export const SECTION_WIDTHS = ['default', 'wide'] as const;

const elementBase = {
  id: z.string().regex(ID_RE),
  col: z.number().int().min(1).max(GRID_COLUMNS),
  row: z.number().int().min(1).max(GRID_MAX_ROW),
  w: z.number().int().min(1).max(GRID_COLUMNS),
  h: z.number().int().min(1).max(GRID_MAX_ROW),
  align: z.enum(ALIGNMENTS).default('start'),
  valign: z.enum(ALIGNMENTS).default('start'),
  phone: z
    .object({
      hidden: z.boolean().default(false),
      span: z.enum(['full', 'half']).default('full'),
      // Only images and dividers can be moved: anything else would part its
      // reading order from the order keyboard users tab through.
      order: z.number().int().min(-20).max(20).optional(),
    })
    .default({ hidden: false, span: 'full' }),
};

export const elementSchema = <T extends z.ZodType>(image: () => T) =>
  z.discriminatedUnion('type', [
    z.object({ ...elementBase, type: z.literal('heading'), text: req(160), style: z.enum(HEADING_STYLES).default('h2') }),
    z.object({
      ...elementBase,
      type: z.literal('text'),
      body: z.string().trim().min(1), // markdown
      size: z.enum(TEXT_SIZES).default('body'),
    }),
    z.object({
      ...elementBase,
      type: z.literal('image'),
      image: image(),
      alt: req(200),
      caption: opt(200),
      fit: z.enum(['cover', 'contain']).default('cover'),
    }),
    z.object({
      ...elementBase,
      type: z.literal('button'),
      label: req(40),
      link: z.string().regex(LINK_RE),
      style: z.enum(BUTTON_STYLES).default('primary'),
    }),
    z.object({ ...elementBase, type: z.literal('quote'), quote: req(400), attribution: opt(80) }),
    z.object({ ...elementBase, type: z.literal('divider') }),
  ]);

export const sectionSchema = <T extends z.ZodType>(image: () => T) => z.discriminatedUnion('type', [
  z.object({
    ...sectionBase,
    type: z.literal('hero'),
    eyebrow: opt(80),
    line1: req(80),
    line2: req(80),
    lede: opt(300),
    primary: link,
    secondary: link.optional(),
    reel: z.boolean().default(true),
  }),
  z.object({ ...sectionBase, type: z.literal('page-header'), eyebrow: opt(40), heading: req(80), intro: opt(300) }),
  z.object({
    ...sectionBase,
    type: z.literal('grid'),
    width: z.enum(SECTION_WIDTHS).default('default'),
    elements: z.array(elementSchema(image)).max(40).default([]),
  }),
  z.object({
    ...sectionBase,
    type: z.literal('manifesto'),
    heading: req(160),
    lead: z.string().trim().min(1), // markdown
    action: link,
  }),
  z.object({ ...sectionBase, type: z.literal('deck'), heading: req(120), intro: opt(400), action: link.optional() }),
  z.object({ ...sectionBase, type: z.literal('disciplines'), heading: req(120), intro: opt(400) }),
  z.object({ ...sectionBase, type: z.literal('photo-strip'), heading: req(120), intro: opt(400), action: link.optional() }),
  z.object({ ...sectionBase, type: z.literal('about-teaser'), heading: req(80), body: req(400), linkLabel: req(40) }),
  z.object({
    ...sectionBase,
    type: z.literal('cta-band'),
    eyebrow: opt(60),
    heading: req(80),
    body: opt(200),
    links: z.array(link).max(3).default([]),
    // Work's views each link to the others, which no fixed list can do.
    auto: z.boolean().default(false),
  }),
  z.object({
    ...sectionBase,
    type: z.literal('profile'),
    eyebrow: opt(40),
    title: req(80),
    statement: req(300),
    body: z.string().trim().min(1), // markdown
    resumeLabel: req(40),
    processHeading: req(60),
    process: z.array(z.object({ title: req(60), body: req(200) })).max(6).default([]),
    toolsHeading: req(60),
    toolsNote: opt(120),
    experienceHeading: req(60),
    experience: z.array(z.object({ period: req(40), role: req(80), place: opt(80) })).default([]),
    closing: opt(200),
  }),
  z.object({
    ...sectionBase,
    type: z.literal('contact'),
    eyebrow: opt(40),
    heading: req(80),
    lede: opt(300),
    resumeLabel: req(40),
    form: z.object({ title: req(60), subtitle: opt(200), submitLabel: req(30), successMessage: req(120) }),
  }),
  z.object({
    ...sectionBase,
    type: z.literal('fortune'),
    heading: req(80),
    intro: opt(200),
    fortunes: z.array(req(200)).min(3),
  }),
  z.object({ ...sectionBase, type: z.literal('gallery'), label: req(60) }),
  z.object({ ...sectionBase, type: z.literal('work-header'), eyebrow: opt(40), heading: req(80), intro: opt(300) }),
  z.object({ ...sectionBase, type: z.literal('work-list'), emptyText: req(120) }),
  z.object({ ...sectionBase, type: z.literal('work-logos'), heading: req(120), intro: opt(400) }),
]);

export const pageSchema = <T extends z.ZodType>(image: () => T) =>
  z.object({
    title: req(60),
    hidden: z.boolean().default(false),
    seo,
    sections: z.array(sectionSchema(image)).min(1),
  });

// Types use the file form of an image (a path). Parsed by a collection, image()
// gives metadata instead, which GridSection.astro alone has to know.
const pathImage = () => z.string();
export const plainPageSchema = pageSchema(pathImage);
export type PageDoc = z.infer<typeof plainPageSchema>;
export type Section = PageDoc['sections'][number];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;
export type GridElement = SectionOf<'grid'>['elements'][number];
export type ElementOf<T extends ElementType> = Extract<GridElement, { type: T }>;
