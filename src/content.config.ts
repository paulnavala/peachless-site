import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  disciplinesSchema,
  formSchema,
  ID_RE,
  pageSchema,
  photoSchema,
  projectSchema,
  RESERVED_PAGE_IDS,
  RESERVED_PROJECT_IDS,
  siteSchema,
} from './lib/content-schema';

// Astro's content cache only clears when this file changes, so an entry whose
// own file didn't change would keep the old schema's data, here and in the
// Cloudflare build cache. This line changes with the schema (content-files.spec).
// content-schema: 5d6e76c77f0d

/**
 * Folder-per-entry collections: `projects/<id>/index.yaml` with its images
 * beside it. The folder name is the id and the page URL, so it is validated
 * here — zod never sees the id.
 */
const folderId =
  (reserved: readonly string[] = []) =>
  ({ entry }: { entry: string }) => {
    const id = entry.split('/')[0];
    if (!ID_RE.test(id)) throw new Error(`"${id}" is not a valid folder name: use lowercase letters, numbers and dashes.`);
    if (reserved.includes(id)) throw new Error(`"${id}" is reserved for a site page; rename the folder.`);
    return id;
  };

const single = (base: string, pattern: string) => glob({ base, pattern });

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '*/index.yaml', generateId: folderId(RESERVED_PROJECT_IDS) }),
  schema: ({ image }) => projectSchema(image),
});

const photos = defineCollection({
  loader: glob({ base: './src/content/photos', pattern: '*/index.yaml', generateId: folderId() }),
  schema: ({ image }) => photoSchema(image),
});

const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '*/index.yaml', generateId: folderId(RESERVED_PAGE_IDS) }),
  schema: ({ image }) => pageSchema(image),
});

const site = defineCollection({
  loader: single('./src/content/site', 'site.yaml'),
  schema: ({ image }) => siteSchema(image),
});
const disciplines = defineCollection({ loader: single('./src/content/site', 'disciplines.yaml'), schema: disciplinesSchema });
const form = defineCollection({ loader: single('./src/content/site', 'form.yaml'), schema: formSchema });

export const collections = { projects, photos, pages, site, disciplines, form };
