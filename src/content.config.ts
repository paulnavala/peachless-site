import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.json' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    figma: z.string().url(),
    badges: z.array(z.string()).default([]),
    categories: z.array(z.string()).default([]),
    year: z.number().nullable().optional(),
    accent: z.string().default(''),
    order: z.number().default(0),
  }),
});

const logos = defineCollection({
  loader: glob({ base: './src/content/logos', pattern: '**/*.json' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      description: z.string(),
      alt: z.string(),
      grid: image(),
      preview: image(),
      order: z.number().default(0),
    }),
});

const photos = defineCollection({
  loader: glob({ base: './src/content/photos', pattern: '**/*.json' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      after: image(),
      before: image().optional(),
      order: z.number().default(0),
    }),
});

const brands = defineCollection({
  loader: glob({ base: './src/content/brands', pattern: '**/*.json' }),
  schema: z.object({
    name: z.string(),
    description: z.string().default(''),
    logo: z.string(), // public/ path, e.g. /guidelines/peachless/01-cover.svg
    guidelines: z.array(z.object({ name: z.string(), path: z.string() })),
  }),
});

const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '**/*.{md,yaml}' }),
  schema: z.object({
    heading: z.string().optional(),
    lead: z.string().optional(),
    buttonLabel: z.string().optional(),
    buttonHref: z.string().optional(),
    emails: z.array(z.object({ label: z.string(), address: z.string().email() })).optional(),
  }),
});

const site = defineCollection({
  loader: glob({ base: './src/content/site', pattern: '**/*.yaml' }),
  schema: z.object({
    nav: z.array(z.object({ label: z.string(), href: z.string() })),
    tagline: z.string(),
    emails: z.array(z.object({ label: z.string(), address: z.string().email() })),
    defaultDescription: z.string(),
    formEndpoint: z.string().default(''),
    formHidden: z.record(z.string(), z.string()).default({}),
  }),
});

export const collections = { projects, logos, photos, brands, pages, site };
