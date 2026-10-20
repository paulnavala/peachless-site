/**
 * The one place that reads collections. Pages and components ask for
 * *published* entries through these helpers, so a hidden project can never leak
 * into a grid, a "next project" link or the sitemap
 * (tests/unit/no-raw-collections.spec.ts enforces it).
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Discipline } from './content-schema';
import { featured, nextProject, published } from './project-order';

export type Project = CollectionEntry<'projects'>;
export type Photo = CollectionEntry<'photos'>;

export async function getPublishedProjects(): Promise<Project[]> {
  return published(await getCollection('projects'));
}

export async function getProjectsByDiscipline(discipline: Discipline): Promise<Project[]> {
  return (await getPublishedProjects()).filter((p) => p.data.disciplines.includes(discipline));
}

export async function getFeaturedProjects(fallback = 3): Promise<Project[]> {
  return featured(await getPublishedProjects(), fallback);
}

export async function getNextProject(id: string): Promise<Project | null> {
  return nextProject(await getPublishedProjects(), id);
}

export async function getPublishedPhotos(): Promise<Photo[]> {
  return published(await getCollection('photos'));
}

export async function getFeaturedPhotos(fallback = 5): Promise<Photo[]> {
  return featured(await getPublishedPhotos(), fallback);
}

type Singleton = 'home' | 'work' | 'about' | 'contact' | 'photographyPage' | 'site' | 'form';

/** Read a single-file collection (home, site, …); each holds exactly one entry. */
export async function getSingleton<C extends Singleton>(collection: C): Promise<CollectionEntry<C>> {
  const entries = await getCollection(collection);
  if (entries.length !== 1) throw new Error(`Expected exactly one ${collection} entry, found ${entries.length}`);
  return entries[0] as CollectionEntry<C>;
}

