/**
 * Content model v2: plain zod schemas + constants, shared by
 * src/content.config.ts (build), tests/unit (CMS parity) and tests/e2e.
 * public/admin/config.yml must mirror these field for field —
 * tests/unit/cms-config.spec.ts fails the build when they drift.
 */
import { z } from 'astro/zod';

// Schemas with images take Astro's `image()` helper (tests pass a string stub).
// They are generic over its return type so ImageMetadata survives inference.

export const DISCIPLINES = ['graphic-design', 'uiux'] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  'graphic-design': 'Graphic design',
  uiux: 'UI/UX',
};

/** Disciplines as a reader would say them: "Graphic design & UI/UX". */
export function disciplineList(disciplines: readonly Discipline[]): string {
  const labels = disciplines.map((d) => DISCIPLINE_LABELS[d]);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} & ${labels.at(-1)}` : (labels[0] ?? '');
}

export const TOOLS = ['photoshop', 'illustrator', 'indesign', 'canva', 'xd', 'figma', 'miro', 'lightroom'] as const;
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
] as const;

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
export const FIGMA_RE = /^https:\/\/(www\.)?figma\.com\/(proto|design|file|make|board)\//;
export const LINK_RE = /^(\/|https:\/\/|mailto:)/;

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
    tools: z.array(z.enum(TOOLS)).default([]),
    cover: z.object({
      image: image(),
      alt: req(200),
      panel: z.enum(PANELS).default('none'),
      fit: z.enum(['cover', 'contain']).default('cover'),
    }),
    accent: z.string().regex(HEX_RE).optional(),
    featured: z.boolean().default(false),
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
const section = z.object({ heading: req(120), intro: opt(400) });

export const homeSchema = z.object({
  eyebrow: opt(80),
  tagline: z.object({ line1: req(80), line2: req(80) }),
  lede: opt(300),
  primaryCta: link,
  secondaryCta: link.optional(),
  manifesto: z.object({ heading: req(160), lead: z.string().trim().min(1) }), // markdown
  services: section,
  featured: section,
  photography: section,
  about: z.object({ heading: req(80), body: req(400), linkLabel: req(40) }),
  seo,
});

const disciplineCopy = z.object({ title: req(40), description: req(200) });

export const workSchema = z.object({
  eyebrow: opt(40),
  heading: req(80),
  intro: opt(300),
  disciplines: z.object({
    graphicDesign: disciplineCopy,
    uiux: disciplineCopy,
    photography: disciplineCopy,
  }),
  seo,
});

export const aboutSchema = <T extends z.ZodType>(image: () => T) =>
  z.object({
    eyebrow: opt(40),
    title: req(80),
    statement: req(300),
    portrait: image(),
    portraitAlt: req(200),
    closing: opt(200),
    seo,
  });

export const contactSchema = z.object({
  eyebrow: opt(40),
  heading: req(80),
  lede: opt(300),
  form: z.object({
    title: req(60),
    subtitle: opt(200),
    submitLabel: req(30),
    successMessage: req(120),
  }),
  fortune: z.object({
    heading: req(80),
    intro: opt(200),
    fortunes: z.array(req(200)).min(3),
  }),
  seo,
});

export const photographyPageSchema = z.object({
  eyebrow: opt(40),
  heading: req(80),
  lede: opt(300),
  seo,
});

export const siteSchema = <T extends z.ZodType>(image: () => T) =>
  z.object({
    siteName: req(40),
    ownerName: opt(40),
    tagline: req(120),
    nav: z
      .array(z.object({ label: req(30), href: z.string().regex(LINK_RE), cta: z.boolean().default(false) }))
      .min(1)
      .max(6),
    emails: z.array(z.object({ label: req(30), address: z.email() })).min(1),
    socials: z.array(z.object({ label: req(30), url: z.url() })).default([]),
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
