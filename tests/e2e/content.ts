import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/**
 * Specs read their expectations from the content files instead of hardcoding
 * counts, labels or addresses, so routine CMS edits never turn CI red.
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
