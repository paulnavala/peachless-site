import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.json' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    figma: z.url(),
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
    emails: z.array(z.object({ label: z.string(), address: z.email() })).optional(),
  }),
});

const site = defineCollection({
  loader: glob({ base: './src/content/site', pattern: '**/*.yaml' }),
  schema: z
    .object({
      siteName: z.string().default('peachless.'),
      ownerName: z.string().optional(),
      nav: z.array(z.object({ label: z.string(), href: z.string(), cta: z.boolean().optional() })),
      tagline: z.string(),
      socials: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
      cta: z
        .object({
          eyebrow: z.string().optional(),
          heading: z.string(),
          buttonLabel: z.string(),
          buttonLink: z.string(),
        })
        .optional(),
      emails: z.array(z.object({ label: z.string(), address: z.email() })),
      defaultDescription: z.string(),
      formEndpoint: z.string().default(''),
      formHidden: z.record(z.string(), z.string()).default({}),
    })
    // Web3Forms rejects every submission without its access_key: fail the build
    // rather than deploy a contact form that can't send.
    .refine((s) => !s.formEndpoint.includes('web3forms.com') || !!s.formHidden.access_key, {
      message: 'access_key is required when formEndpoint is Web3Forms',
      path: ['formHidden'],
    }),
});

export const collections = { projects, logos, photos, brands, pages, site };
