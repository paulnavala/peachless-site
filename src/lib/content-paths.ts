/**
 * Where each collection lives. Shared by src/content.config.ts, the CMS parity
 * test (public/admin/config.yml must point at the same folders) and e2e specs.
 */
export const CONTENT_PATHS = {
  projects: { folder: 'src/content/projects', pattern: '*/index.yaml' },
  photos: { folder: 'src/content/photos', pattern: '*/index.yaml' },
  home: { file: 'src/content/pages/home.yaml' },
  work: { file: 'src/content/pages/work.yaml' },
  about: { file: 'src/content/pages/about.md' },
  contact: { file: 'src/content/pages/contact.yaml' },
  photographyPage: { file: 'src/content/pages/photography.yaml' },
  site: { file: 'src/content/site/site.yaml' },
  form: { file: 'src/content/site/form.yaml' },
} as const;
