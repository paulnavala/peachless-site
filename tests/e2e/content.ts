import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { TOOLS } from '../../src/lib/content-schema';
import { nextProject, published, toolCounts } from '../../src/lib/project-order';

/**
 * Specs read their expectations from the content files instead of hardcoding
 * counts, labels or addresses, so routine CMS edits never turn CI red. Ordering
 * and visibility reuse the site's own rules (src/lib/project-order.ts).
 */
const CONTENT = fileURLToPath(new URL('../../src/content/', import.meta.url));

export const readYaml = <T = any>(...parts: string[]): T =>
  parse(readFileSync(CONTENT + parts.join('/'), 'utf8')) as T;

export interface SiteSettings {
  siteName?: string;
  ownerName?: string;
  jobTitle?: string;
  nav: { label: string; href: string; cta?: boolean }[];
  tagline: string;
  emails: { label: string; address: string }[];
  socials?: { label: string; url: string }[];
  resume?: string;
  cta?: { eyebrow?: string; heading: string; buttonLabel: string; buttonLink: string };
}

export const site = () => readYaml<SiteSettings & { portraitAlt: string }>('site', 'site.yaml');

export const disciplines = () => readYaml('site', 'disciplines.yaml');

export interface SectionData {
  id: string;
  type: string;
  hidden?: boolean;
  [key: string]: any;
}

/** A page's sections as visitors get them. An editor can reorder or hide any of them. */
export const sectionsOf = (id: string) =>
  readYaml<{ sections: SectionData[] }>('pages', id, 'index.yaml').sections.filter((s) => !s.hidden);

/** The section of this type, if the page has one. */
export const sectionOf = (id: string, type: string) => sectionsOf(id).find((s) => s.type === type);

export interface ProjectData {
  title: string;
  summary: string;
  disciplines: string[];
  challenge?: string;
  outcome?: string;
  tools?: string[];
  year?: number;
  cover: { image: string; alt: string; panel?: string; fit?: string };
  accent?: string;
  featured?: boolean;
  compact?: boolean;
  hidden?: boolean;
  order?: number;
  seo?: { title?: string; description?: string };
  blocks: { type: string; [key: string]: any }[];
}

export interface PhotoData {
  title: string;
  image: string;
  alt: string;
  before?: string;
  featured?: boolean;
  hidden?: boolean;
  order?: number;
}

const entries = <T>(collection: string) =>
  readdirSync(CONTENT + collection)
    .filter((id) => statSync(CONTENT + `${collection}/${id}`).isDirectory() && existsSync(CONTENT + `${collection}/${id}/index.yaml`))
    .map((id) => ({ id, data: readYaml<T>(collection, id, 'index.yaml') }));

export const allProjects = () => entries<ProjectData>('projects');
export const publishedProjects = () => published(allProjects());
export const hiddenProjects = () => allProjects().filter((p) => p.data.hidden);
export const nextOf = (id: string) => nextProject(publishedProjects(), id);
export const publishedPhotos = () => published(entries<PhotoData>('photos'));

/** Tools in use and how many projects use each, in the site's order. */
export const toolsInUse = () => toolCounts(publishedProjects(), TOOLS);
export const toolRoutes = () => toolsInUse().map(({ tool }) => `/projects/tools/${tool}/`);

const BUILT_IN_PAGES = ['home', 'about', 'contact', 'photography', 'work'];

/** Pages an editor added in the builder. */
export const customRoutes = () =>
  entries<{ hidden?: boolean }>('pages')
    .filter((p) => !BUILT_IN_PAGES.includes(p.id) && !p.data.hidden)
    .map((p) => `/${p.id}/`);

/** Every public page, for checks that sweep the whole site. */
export const allRoutes = () => [
  '/',
  '/projects/',
  '/projects/graphic-design/',
  '/projects/uiux/',
  ...toolRoutes(),
  ...publishedProjects().map((p) => `/projects/${p.id}/`),
  '/photography/',
  '/about/',
  '/contact/',
  ...customRoutes(),
];
