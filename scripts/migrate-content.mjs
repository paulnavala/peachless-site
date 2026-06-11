import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OLD = 'D:/Projects/peachless/sqs-design';
const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
const basename = (url) => url.split('/').pop().split('?')[0];
const write = (path, obj) => writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');

// projects
mkdirSync('src/content/projects', { recursive: true });
const projects = JSON.parse(readFileSync(`${OLD}/data/portfolio-projects.json`, 'utf8')).projects;
projects.forEach((p, i) =>
  write(`src/content/projects/${p.id}.json`, {
    title: p.title,
    description: p.description,
    figma: p.figma,
    badges: p.badges ?? [],
    categories: p.categories ?? [],
    year: p.year ?? null,
    accent: p.accent ?? '',
    order: i,
  })
);

// logos — grid/preview become paths relative to the content file
mkdirSync('src/content/logos', { recursive: true });
const logos = JSON.parse(readFileSync(`${OLD}/data/logos.json`, 'utf8')).logos;
logos.forEach((l, i) =>
  write(`src/content/logos/${l.id}.json`, {
    name: l.name,
    description: l.description,
    alt: l.alt,
    grid: `../../assets/logos/${basename(l.gridSrc)}`,
    preview: `../../assets/logos/${basename(l.previewSrc)}`,
    order: i,
  })
);

// photos — old `id` is the display title
mkdirSync('src/content/photos', { recursive: true });
const photos = JSON.parse(readFileSync(`${OLD}/data/portfolio-photos.json`, 'utf8')).photos;
photos.forEach((p, i) => {
  const entry = {
    title: p.id,
    after: `../../assets/photography/${basename(p.afterSrc)}`,
    order: i,
  };
  if (p.beforeSrc) entry.before = `../../assets/photography/${basename(p.beforeSrc)}`;
  write(`src/content/photos/${slug(p.id)}.json`, entry);
});

// brands — keep ONLY peachless (the other 5 reuse its SVGs as placeholders)
mkdirSync('src/content/brands', { recursive: true });
const brands = JSON.parse(readFileSync(`${OLD}/data/brand-guidelines.json`, 'utf8')).brands;
const peachless = brands.find((b) => b.id === 'peachless');
write('src/content/brands/peachless.json', {
  name: peachless.name,
  description: peachless.description,
  logo: `/guidelines/peachless/${basename(peachless.logo)}`,
  guidelines: peachless.guidelines.map((g) => ({
    name: g.name,
    path: `/guidelines/peachless/${basename(g.path)}`,
  })),
});

console.log('done:', projects.length, 'projects,', logos.length, 'logos,', photos.length, 'photos, 1 brand');
