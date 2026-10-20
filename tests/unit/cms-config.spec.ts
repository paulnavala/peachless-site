import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import Ajv from 'ajv';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'astro/zod';
import { CONTENT_PATHS } from '../../src/lib/content-paths';
import {
  aboutSchema,
  contactSchema,
  formSchema,
  homeSchema,
  photographyPageSchema,
  photoSchema,
  projectSchema,
  siteSchema,
  workSchema,
} from '../../src/lib/content-schema';

/**
 * The admin (public/admin/config.yml) and the build (src/lib/content-schema.ts)
 * must agree field for field, or the CMS can save content the build rejects —
 * or hide fields the site needs. This walks both trees side by side.
 */

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const config = parse(read('public/admin/config.yml'));

const IMAGE = 'cms:image';
const image = () => z.string().describe(IMAGE);
const WIDGETS = new Set(['string', 'text', 'richtext', 'markdown', 'image', 'number', 'boolean', 'select', 'list', 'object', 'color', 'keyvalue']);

type Zod = any;
type Field = Record<string, any>;
const def = (s: Zod) => s._zod.def;
const checks = (s: Zod): Record<string, any>[] => (def(s).checks ?? []).map((c: Zod) => c._zod.def);

function unwrap(s: Zod) {
  let optional = false;
  for (;;) {
    const d = def(s);
    if (d.type === 'optional') optional = true;
    else if (d.type === 'default') optional = true; // has a fallback: the CMS may leave it empty
    else if (d.type !== 'nullable') return { schema: s, optional };
    s = d.innerType;
  }
}

const maxOf = (s: Zod) => checks(s).find((c) => c.check === 'max_length')?.maximum;
const minOf = (s: Zod) => checks(s).find((c) => c.check === 'min_length')?.minimum;
const patternOf = (s: Zod): string | undefined =>
  def(s).pattern?.source ?? checks(s).find((c) => c.check === 'string_format' && c.format === 'regex')?.pattern?.source;
const enumValues = (s: Zod) => Object.values(def(s).entries) as string[];
const numberBound = (s: Zod, kind: 'greater_than' | 'less_than') => checks(s).find((c) => c.check === kind)?.value;
const isInt = (s: Zod) => checks(s).some((c) => c.check === 'number_format' && /int/.test(c.format));

/** Compare one CMS field with its zod schema; returns human-readable problems. */
function compareField(path: string, field: Field, schema: Zod, mediaRelative: boolean): string[] {
  const problems: string[] = [];
  const say = (msg: string) => problems.push(`${path}: ${msg}`);
  const { schema: s, optional } = unwrap(schema);
  const d = def(s);

  if (!WIDGETS.has(field.widget)) say(`unknown widget "${field.widget}"`);
  if (optional !== (field.required === false)) {
    say(optional ? 'optional in zod but required in the CMS (add required: false)' : 'required in zod but required: false in the CMS');
  }

  if (d.type === 'string' && s.description === IMAGE) {
    if (field.widget !== 'image') say(`expected an image widget, got ${field.widget}`);
    if (field.choose_url !== false) say('image fields must set choose_url: false (remote URLs bypass image())');
    const relative = mediaRelative || (typeof field.media_folder === 'string' && !field.media_folder.startsWith('/'));
    if (!relative) say('image uploads must land beside the entry (entry-relative media_folder)');
  } else if (d.type === 'string') {
    if (!['string', 'text', 'richtext', 'markdown', 'color'].includes(field.widget)) say(`string field uses widget ${field.widget}`);
    const max = maxOf(s);
    if (max !== undefined && field.maxlength !== max) say(`maxlength ${field.maxlength} ≠ zod max ${max}`);
    const pattern = patternOf(s);
    if (pattern && field.pattern?.[0] !== pattern) say(`pattern ${JSON.stringify(field.pattern?.[0])} ≠ zod ${JSON.stringify(pattern)}`);
    if (d.format === 'url' && field.type !== 'url') say('URL fields should use type: url');
    if (d.format === 'email' && field.type !== 'email') say('email fields should use type: email');
  } else if (d.type === 'number') {
    if (field.widget !== 'number') say(`number field uses widget ${field.widget}`);
    if (isInt(s) && field.value_type !== 'int') say('integer field needs value_type: int');
    const min = numberBound(s, 'greater_than');
    const max = numberBound(s, 'less_than');
    if (min !== undefined && field.min !== min) say(`min ${field.min} ≠ zod ${min}`);
    if (max !== undefined && field.max !== max) say(`max ${field.max} ≠ zod ${max}`);
  } else if (d.type === 'boolean') {
    if (field.widget !== 'boolean') say(`boolean field uses widget ${field.widget}`);
  } else if (d.type === 'enum') {
    if (field.widget !== 'select' || field.multiple) say('enum must be a single select');
    const values = (field.options ?? []).map((o: any) => o.value ?? o);
    if (JSON.stringify(values) !== JSON.stringify(enumValues(s))) say(`options ${values} ≠ zod ${enumValues(s)}`);
  } else if (d.type === 'record') {
    if (field.widget !== 'keyvalue') say('record must be a keyvalue widget');
  } else if (d.type === 'object') {
    if (field.widget !== 'object') say(`object field uses widget ${field.widget}`);
    problems.push(...compareFields(path, field.fields ?? [], s, mediaRelative));
  } else if (d.type === 'array') {
    const element = unwrap(d.element).schema;
    const ed = def(element);
    const min = minOf(s);
    const max = maxOf(s);
    if (min !== undefined && field.min !== min) say(`min ${field.min} ≠ zod ${min}`);
    if (max !== undefined && field.max !== max) say(`max ${field.max} ≠ zod ${max}`);
    if (ed.type === 'enum') {
      if (field.widget !== 'select' || !field.multiple) say('array of enum must be a multiple select');
      const values = (field.options ?? []).map((o: any) => o.value ?? o);
      if (JSON.stringify(values) !== JSON.stringify(enumValues(element))) say(`options ${values} ≠ zod ${enumValues(element)}`);
    } else if (ed.type === 'union' && ed.discriminator) {
      if (field.widget !== 'list' || !field.types) say('a block list must be a list widget with types');
      const key = field.typeKey ?? 'type';
      if (key !== ed.discriminator) say(`typeKey ${key} ≠ zod discriminator ${ed.discriminator}`);
      const byName = new Map<string, Zod>(ed.options.map((o: Zod) => [def(def(o).shape[ed.discriminator]).values[0], o]));
      const cmsNames = (field.types ?? []).map((t: Field) => t.name);
      if (JSON.stringify(cmsNames) !== JSON.stringify([...byName.keys()])) say(`block types ${cmsNames} ≠ zod ${[...byName.keys()]}`);
      for (const t of field.types ?? []) {
        const option = byName.get(t.name);
        if (option) problems.push(...compareFields(`${path}[${t.name}]`, t.fields ?? [], option, mediaRelative, [ed.discriminator]));
      }
    } else if (ed.type === 'object') {
      if (field.widget !== 'list' || !field.fields) say('array of objects must be a list widget with fields');
      problems.push(...compareFields(`${path}[]`, field.fields ?? [], element, mediaRelative));
    } else {
      if (field.widget !== 'list' || !field.field) say('array of values must be a list widget with a single `field`');
      else problems.push(...compareField(`${path}[]`, { ...field.field, required: undefined }, d.element, mediaRelative));
    }
  } else {
    say(`unhandled zod type ${d.type}`);
  }
  return problems;
}

function compareFields(path: string, fields: Field[], object: Zod, mediaRelative: boolean, skip: string[] = []): string[] {
  const shape = def(object).shape as Record<string, Zod>;
  const problems: string[] = [];
  const cms = new Map(fields.map((f) => [f.name, f]));
  for (const key of Object.keys(shape)) {
    if (skip.includes(key)) continue;
    const field = cms.get(key);
    if (!field) problems.push(`${path}.${key}: in zod but missing from the CMS`);
    else problems.push(...compareField(`${path}.${key}`, field, shape[key], mediaRelative));
  }
  for (const name of cms.keys()) if (!(name in shape) && !skip.includes(name)) problems.push(`${path}.${name}: in the CMS but not in zod`);
  return problems;
}

const collection = (name: string) => config.collections.find((c: Field) => c.name === name);
const singleton = (name: string) => config.singletons.find((c: Field) => c.name === name);

describe('admin config ↔ content schema', () => {
  it('validates against the pinned Sveltia CMS JSON schema', () => {
    const schema = JSON.parse(read('node_modules/@sveltia/cms/schema/sveltia-cms.json'));
    const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
    const valid = ajv.validate(schema, config);
    expect(valid, JSON.stringify(ajv.errors?.slice(0, 5), null, 2)).toBe(true);
  });

  it('projects match projectSchema (order is written by drag-to-reorder)', () => {
    const c = collection('projects');
    expect(c.reorder).toBe(true);
    expect(compareFields('projects', c.fields, projectSchema(image), true, ['order'])).toEqual([]);
  });

  it('photos match photoSchema', () => {
    const c = collection('photos');
    expect(c.reorder).toBe(true);
    expect(compareFields('photos', c.fields, photoSchema(image), true, ['order'])).toEqual([]);
  });

  it.each([
    ['home', homeSchema],
    ['work', workSchema],
    ['contact', contactSchema],
    ['photographyPage', photographyPageSchema],
    ['site', siteSchema(image)],
    ['form', formSchema],
  ] as const)('the %s singleton matches its schema', (name, schema) => {
    expect(compareFields(name, singleton(name).fields, schema, false)).toEqual([]);
  });

  it('the about singleton matches aboutSchema plus its Markdown body', () => {
    const fields = singleton('about').fields.filter((f: Field) => f.name !== 'body');
    expect(compareFields('about', fields, aboutSchema(image), false)).toEqual([]);
    expect(singleton('about').fields.find((f: Field) => f.name === 'body')?.widget).toBe('richtext');
  });

  it('collections and singletons point at the files the site reads', () => {
    for (const name of ['projects', 'photos'] as const) {
      const c = collection(name);
      expect(c.folder).toBe(CONTENT_PATHS[name].folder);
      expect(`${c.path}.${c.extension}`).toBe('{{slug}}/index.yaml');
      expect(CONTENT_PATHS[name].pattern).toBe('*/index.yaml');
      expect([c.media_folder, c.public_folder]).toEqual(['', '']);
      expect(c.slug?.editable).toEqual(['create']);
      expect(c.duplicate).toBe(false);
    }
    for (const name of ['home', 'work', 'about', 'contact', 'photographyPage', 'site', 'form'] as const) {
      expect(singleton(name).file, name).toBe(CONTENT_PATHS[name].file);
    }
    expect(singleton('form').readonly).toBe(true);
  });

  it('keeps the global safety settings', () => {
    expect(config.output?.omit_empty_optional_fields).toBe(true);
    expect(config.publish_mode?.type).toBe('preview');
    expect(config.backend?.preview_context).toBe('Cloudflare Pages');
    expect(config.backend?.branch).toBe('main');
    if (config.backend?.base_url) expect(config.backend.base_url).toMatch(/^https:\/\//);
  });

  it('the checker itself catches drift', () => {
    const fields: Field[] = JSON.parse(JSON.stringify(collection('projects').fields));
    const byName = (n: string) => fields.find((f) => f.name === n)!;
    byName('title').maxlength = 81;
    byName('disciplines').options.pop();
    byName('year').required = true;
    byName('cover').fields.find((f: Field) => f.name === 'image').choose_url = true;
    byName('blocks').types = byName('blocks').types.filter((t: Field) => t.name !== 'quote');
    fields.splice(fields.indexOf(byName('summary')), 1);
    fields.push({ name: 'extra', widget: 'string' });
    const problems = compareFields('projects', fields, projectSchema(image), true, ['order']).join('\n');
    for (const expected of [
      'title: maxlength 81',
      'disciplines: options',
      'year: optional in zod but required',
      'cover.image: image fields must set choose_url',
      'blocks: block types',
      'summary: in zod but missing',
      'extra: in the CMS but not in zod',
    ]) {
      expect(problems).toContain(expected);
    }
  });

  it('pins one Sveltia version everywhere, with a matching SRI hash', () => {
    const pkg = JSON.parse(read('package.json'));
    const version = pkg.devDependencies['@sveltia/cms'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const html = read('public/admin/index.html');
    expect(html).toContain(`https://unpkg.com/@sveltia/cms@${version}/dist/sveltia-cms.js`);
    expect(read('public/admin/config.yml')).toContain(`@sveltia/cms@${version}/schema/sveltia-cms.json`);
    const bundle = readFileSync(join(ROOT, 'node_modules/@sveltia/cms/dist/sveltia-cms.js'));
    const sri = `sha384-${createHash('sha384').update(bundle).digest('base64')}`;
    expect(html, `paste this into public/admin/index.html: integrity="${sri}"`).toContain(`integrity="${sri}"`);
  });
});
