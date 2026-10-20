/** Normalise a URL path for comparison: no trailing slash, '' becomes '/'. */
export function normalizePath(path: string): string {
  const trimmed = path.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * aria-current value for a nav link: 'page' on an exact match, 'true' when the
 * current page lives under the link's section (so /projects/cern/ highlights
 * "Work"), otherwise undefined. External and hash-only links never match.
 */
export function navCurrent(href: string, path: string): 'page' | 'true' | undefined {
  if (!href.startsWith('/')) return undefined;
  const link = normalizePath(href);
  const here = normalizePath(path);
  if (link === here) return 'page';
  if (link !== '/' && here.startsWith(link + '/')) return 'true';
  return undefined;
}
