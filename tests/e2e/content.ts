import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { nextProject, published } from '../../src/lib/project-order';

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
  nav: { label: string; href: string; cta?: boolean }[];
  tagline: string;
  emails: { label: string; address: string }[];
  socials?: { label: string; url: string }[];
  cta?: { eyebrow?: string; heading: string; buttonLabel: string; buttonLink: string };
}

export const site = () => readYaml<SiteSettings>('site', 'site.yaml');

export interface ProjectData {
  title: string;
  summary: string;
  disciplines: string[];
  year?: number;
  cover: { image: string; alt: string; panel?: string; fit?: string };
  featured?: boolean;
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
