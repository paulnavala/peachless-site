/**
 * What must be true of a page before it is saved. Everything the build would
 * refuse, said the way an editor would want to hear it: the schema's limits and
 * the page rules, plus what the schema can't see, like whether an image exists.
 */
import { z } from 'astro/zod';
import { ID_RE, pageSchema, projectSchema, RESERVED_PAGE_IDS, SECTION_TYPES, type SectionType } from '../lib/content-schema';
import { checkPage } from '../lib/page-rules';
import { definitionOf, PAGE_IDS, type FieldDef } from '../lib/section-catalogue';

export interface Problem {
  message: string;
  /** The section to select, by id. */
  section?: string;
  /** The element to select, by id. */
  element?: string;
}

export interface PageCheck {
  ok: boolean;
  problems: Problem[];
}

type Doc = Record<string, unknown>;
type Path = readonly PropertyKey[];

const isDoc = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Names for fields the catalogue doesn't list. Anything else is spelled out from its key. */
const PAGE_FIELDS: Record<string, string> = { title: 'Page title', 'seo.description': 'Search description' };
const ELEMENT_FIELDS: Record<string, string> = {
  text: 'Heading text',
  body: 'Text',
  caption: 'Caption',
  label: 'Button text',
  link: 'Button link',
  quote: 'Quote',
  attribution: 'Who said it',
};

/** Some fields deserve better than "Fill in". */
const WHEN_MISSING: Record<string, string> = {
  alt: 'Add a description of this image for people who can’t see it.',
  image: 'Choose an image.',
};

/** A place on the grid: an editor drags these, so there's no field to name. */
const PLACEMENT = new Set<PropertyKey>(['col', 'row', 'w', 'h']);

const MISSING_IMAGE = 'This image can’t be found. Choose it again, or pick another.';

const spelledOut = (key: string) => {
  const words = key.split('.').at(-1)!.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
};

/** A field's name in the inspector, list items included: "Links 2: Text". */
function catalogueName(fields: readonly FieldDef[], path: Path): string | undefined {
  const dotted = path.filter((part) => typeof part === 'string').join('.');
  const field = fields.find(({ key }) => key === dotted);
  if (field && field.kind !== 'list') return field.label;
  const list = field ?? fields.find(({ key, kind }) => kind === 'list' && key === path[0]);
  if (!list) return undefined;
  const index = path[1];
  if (typeof index !== 'number') return list.label;
  const item = list.item?.find(({ key }) => key === path.slice(2).join('.'));
  return item ? `${list.label} ${index + 1}: ${item.label}` : `${list.label} ${index + 1}`;
}

/** What an issue's path points at: its section, its element, and the field within. */
function locate(path: Path, raw: unknown) {
  // A case study's blocks read like sections, here and in the builder.
  const inSection = (path[0] === 'sections' || path[0] === 'blocks') && typeof path[1] === 'number';
  const inElement = inSection && path[2] === 'elements' && typeof path[3] === 'number';
  const list = isDoc(raw) ? (raw.sections ?? raw.blocks) : undefined;
  const sections = Array.isArray(list) ? list : [];
  const section: unknown = inSection ? sections[path[1] as number] : undefined;
  const elements = isDoc(section) && Array.isArray(section.elements) ? section.elements : [];
  const element: unknown = inElement ? elements[path[3] as number] : undefined;
  return { inSection, inElement, section, element, field: path.slice(inElement ? 4 : inSection ? 2 : 0) };
}

function fieldName({ inSection, inElement, section, field }: ReturnType<typeof locate>): string {
  const key = field.filter((part) => typeof part === 'string').join('.');
  if (inElement) return ELEMENT_FIELDS[key] ?? spelledOut(key);
  if (!inSection) return PAGE_FIELDS[key] ?? spelledOut(key);
  const fields = definitionOf(String((section as Doc | undefined)?.type))?.fields ?? [];
  return catalogueName(fields, field) ?? spelledOut(key);
}

const valueAt = (path: Path, raw: unknown) =>
  path.reduce<unknown>((value, key) => (isDoc(value) || Array.isArray(value) ? (value as unknown as Record<PropertyKey, unknown>)[key] : undefined), raw);

function explain(issue: z.core.$ZodIssue, raw: unknown, where: ReturnType<typeof locate>): string {
  const { inElement, field } = where;
  const thing = inElement ? 'element' : 'section';
  const key = field.at(-1);
  const name = key === undefined ? '' : fieldName(where);

  if (issue.code === 'custom') return issue.message;
  if (!issue.path.length) return 'This page’s file can’t be read. Ask your developer to take a look.';
  if (issue.code === 'invalid_union') return `This ${thing} isn’t one the site knows. Remove it.`;
  if (key === undefined) return `This ${thing} can’t be read. Remove it and add it again.`;
  if (inElement && PLACEMENT.has(key)) return 'This element is off the grid. Drag it back into place.';
  if (key === 'id') return `This ${thing}’s name can only use lowercase letters, numbers and dashes.`;

  const missing = WHEN_MISSING[String(key)] ?? (key === 'title' && !where.inSection ? 'Give this page a title.' : `Fill in “${name}”.`);
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'array' && key === 'sections') return 'Add at least one section to this page.';
      return issue.origin === 'array' ? `“${name}” needs at least ${issue.minimum}.` : missing;
    case 'too_big':
      return issue.origin === 'array' ? `“${name}” can hold ${issue.maximum} at most. Remove some.` : `“${name}” is too long. Keep it to ${issue.maximum} characters.`;
    case 'invalid_type':
      return (valueAt(issue.path, raw) ?? null) === null ? missing : `“${name}” isn’t the right kind of value. Set it again.`;
    case 'invalid_format':
      return key === 'link' ? `“${name}” has to start with /, https:// or mailto:.` : `Check “${name}”.`;
    case 'invalid_value':
      return `Choose one of the options for “${name}”.`;
    default:
      return `Check “${name}”.`;
  }
}

function translate(issue: z.core.$ZodIssue, raw: unknown): Problem {
  const where = locate(issue.path, raw);
  const id = (owner: unknown) => (isDoc(owner) && typeof owner.id === 'string' ? owner.id : undefined);
  const section = id(where.section);
  const element = id(where.element);
  return { message: explain(issue, raw, where), ...(section && { section }), ...(element && { element }) };
}

/** A page's image, as a repo path. The value is relative to the page's own file. */
function imagePath(pageId: string, value: string, folder = 'pages'): string {
  if (/^(?:[a-z]+:|\/)/i.test(value)) return value;
  const parts = ['src', 'content', folder, pageId];
  for (const part of value.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/** Just enough of each section for the page rules to run on a page that isn't valid yet. */
function sectionsForRules(sections: unknown[]) {
  return sections
    .filter((section): section is Doc => isDoc(section) && typeof section.id === 'string' && SECTION_TYPES.includes(section.type as SectionType))
    .map(({ elements, ...section }) => ({ ...section, ...(Array.isArray(elements) && { elements: elements.filter(isDoc) }) }));
}

/**
 * Whether a new page can have this address, as a sentence if it can't. Any page
 * has to pass the first two checks; only a new one can clash with a built-in page.
 */
export function pageIdProblem(id: string, { isNew = false }: { isNew?: boolean } = {}): string | null {
  if (!ID_RE.test(id)) return 'A page’s address can only use lowercase letters, numbers and dashes.';
  if ((RESERVED_PAGE_IDS as readonly string[]).includes(id)) return `“${id}” is kept for the site’s own use. Choose another address.`;
  if (isNew && (PAGE_IDS as readonly string[]).includes(id)) return `There’s already a page called “${id}”. Choose another address.`;
  return null;
}

/**
 * `raw` is the document as its file holds it. `imagePaths` are repo paths, so
 * `Object.keys(snapshot.images)` plus anything waiting to be uploaded. Set `isNew`
 * for a page that doesn't have a file yet.
 */
export function validatePage(id: string, raw: unknown, imagePaths: Set<string>, { isNew = false }: { isNew?: boolean } = {}): PageCheck {
  const problems: Problem[] = [];

  const address = pageIdProblem(id, { isNew });
  if (address) problems.push({ message: address });

  const image = () =>
    z.string().superRefine((value, context) => {
      if (!imagePaths.has(imagePath(id, value))) context.addIssue({ code: 'custom', message: MISSING_IMAGE });
    });
  const parsed = pageSchema(image).safeParse(raw);
  if (!parsed.success) problems.push(...parsed.error.issues.map((issue) => translate(issue, raw)));

  if (isDoc(raw) && Array.isArray(raw.sections)) {
    for (const { message, section } of checkPage(id, sectionsForRules(raw.sections) as unknown as Parameters<typeof checkPage>[1])) {
      problems.push({ message, ...(section && { section }) });
    }
  }

  return { ok: !problems.length, problems };
}

/**
 * A case study's file, with its blocks as the builder holds them: each with an id,
 * so a problem can point at one. The schema leaves unknown keys like that one out.
 */
export function validateProject(id: string, raw: unknown, imagePaths: Set<string>): PageCheck {
  const image = () =>
    z.string().superRefine((value, context) => {
      if (!imagePaths.has(imagePath(id, value, 'projects'))) context.addIssue({ code: 'custom', message: MISSING_IMAGE });
    });
  const parsed = projectSchema(image).safeParse(raw);
  const problems = parsed.success ? [] : parsed.error.issues.map((issue) => translate(issue, raw));
  return { ok: !problems.length, problems };
}
