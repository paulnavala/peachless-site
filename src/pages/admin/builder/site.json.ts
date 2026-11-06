/**
 * The site's editable files, as they were at build time. The builder's demo mode
 * works from this on hosts where sign-in isn't possible, and specs read it to
 * check the canvas against the build. Signed in, it reads GitHub instead.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT = 'src/content';

const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;

/** Images beside each entry, so the builder can tell a real picture from a missing one. */
const imagesIn = (folder: string) =>
  readdirSync(join(CONTENT, folder), { recursive: true, encoding: 'utf8' })
    .filter((file) => IMAGE.test(file))
    .map((file) => `${CONTENT}/${folder}/${file.replaceAll('\\', '/')}`);

const yamlIn = (folder: string) =>
  readdirSync(join(CONTENT, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(CONTENT, folder, entry.name, 'index.yaml')))
    .map((entry) => `${CONTENT}/${folder}/${entry.name}/index.yaml`);

export async function GET() {
  const files: Record<string, string> = {};
  for (const path of [...yamlIn('pages'), ...yamlIn('projects'), `${CONTENT}/site/site.yaml`]) {
    files[path] = readFileSync(path, 'utf8');
  }
  const images = Object.fromEntries([...imagesIn('pages'), ...imagesIn('projects')].map((path) => [path, 'built']));
  return new Response(JSON.stringify({ files, images }), { headers: { 'Content-Type': 'application/json' } });
}
