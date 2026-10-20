import type { CollectionEntry } from 'astro:content';
import { DISCIPLINE_LABELS } from './content-schema';

/**
 * schema.org JSON-LD, built from content so it never drifts from what the page
 * shows. Pages hand nodes to `<Base jsonLd>`; Seo wraps them in one `@graph`.
 * Stable `@id`s let the nodes on different pages refer to the same person.
 */
export type JsonLdNode = Record<string, unknown>;
type Site = CollectionEntry<'site'>['data'];

const abs = (path: string, origin: URL) => new URL(path, origin).href;
export const personId = (origin: URL) => abs('/#person', origin);

/** The label the nav uses for a page, so breadcrumbs match the menu. */
const navLabel = (site: Site, href: string, fallback: string) => site.nav.find((item) => item.href === href)?.label ?? fallback;

export function websiteLd(site: Site, origin: URL): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': abs('/#website', origin),
    name: site.siteName,
    url: abs('/', origin),
    description: site.seo.description,
    publisher: { '@id': personId(origin) },
  };
}

/** `image` is a root-relative or absolute URL (e.g. a getImage() result). */
export function personLd(site: Site, origin: URL, image?: string): JsonLdNode {
  const person: JsonLdNode = {
    '@type': 'Person',
    '@id': personId(origin),
    name: site.ownerName,
    url: abs('/about/', origin),
  };
  if (image) person.image = abs(image, origin);
  if (site.socials?.length) person.sameAs = site.socials.map((social) => social.url);
  return person;
}

/** A project page: the work itself, plus Home › Work › Project breadcrumbs. */
export function projectLd(project: CollectionEntry<'projects'>, site: Site, origin: URL, image?: string): JsonLdNode[] {
  const url = abs(`/projects/${project.id}/`, origin);
  const { title, summary, year, disciplines } = project.data;
  const work: JsonLdNode = {
    '@type': 'CreativeWork',
    '@id': `${url}#work`,
    name: title,
    description: summary,
    url,
    genre: disciplines.map((discipline) => DISCIPLINE_LABELS[discipline]),
    creator: { '@type': 'Person', '@id': personId(origin), name: site.ownerName },
  };
  if (year) work.dateCreated = String(year);
  if (image) work.image = abs(image, origin);

  const crumbs = [
    { name: 'Home', url: abs('/', origin) },
    { name: navLabel(site, '/projects/', 'Work'), url: abs('/projects/', origin) },
    { name: title, url },
  ];
  return [
    work,
    {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, name: crumb.name, item: crumb.url })),
    },
  ];
}
