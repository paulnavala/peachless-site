/**
 * Where each collection lives. Shared by src/content.config.ts, the CMS parity
 * test (public/admin/config.yml must point at the same folders) and e2e specs.
 */
export const CONTENT_PATHS = {
  projects: { folder: 'src/content/projects', pattern: '*/index.yaml' },
  photos: { folder: 'src/content/photos', pattern: '*/index.yaml' },
  pages: { folder: 'src/content/pages', pattern: '*/index.yaml' },
  site: { file: 'src/content/site/site.yaml' },
  disciplines: { file: 'src/content/site/disciplines.yaml' },
  form: { file: 'src/content/site/form.yaml' },
} as const;
