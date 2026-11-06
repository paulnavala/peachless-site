/**
 * Every section an editor can use and what the builder needs to know about it:
 * where it may go, what it's called and which fields it has. Pure data, so the
 * site, the builder, the page rules and the specs all read the same list.
 *
 * A section's reach follows from how Astro bundles CSS: per route module, so a
 * renderer that imported every section would put all their CSS on every page.
 * Core sections live in PageBody and go anywhere; bound sections are imported
 * by their own route and stay there.
 */
import type { SectionType } from './content-schema';

export const PAGE_IDS = ['home', 'about', 'contact', 'photography', 'work'] as const;
export type BuiltInPage = (typeof PAGE_IDS)[number];

export type FieldKind = 'text' | 'area' | 'markdown' | 'inline-markdown' | 'lit' | 'link' | 'toggle' | 'list';

export interface FieldDef {
  /** Dotted path into the section (`primary.label`). */
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  /** Edited in the inspector only: nothing on the canvas shows it as text. */
  inspectorOnly?: boolean;
  /** Only on the page when something else is: a heading needs its list, a résumé
   *  button needs a résumé. So finding no markup for it isn't a problem. */
  soft?: boolean;
  /** A list's own fields. A list of plain strings has none. */
  item?: FieldDef[];
  /** The most a list can hold. */
  max?: number;
  /** The fewest a list can hold. */
  min?: number;
}

export interface SectionDef {
  name: string;
  group: 'Page openers' | 'Showing work' | 'Telling the story' | 'Next steps' | 'Your own';
  /** One line for the library, in plain language. */
  note: string;
  /** The page it belongs to. Absent means any page. */
  page?: BuiltInPage;
  /** Supplies the page's h1, so it must come first. */
  opener?: boolean;
  /** Can end a page: it sends the visitor somewhere. */
  nextStep?: boolean;
  /** At most one on a page: it has unique ids, a script or an island. */
  once?: boolean;
  /** Its page doesn't work without it. */
  required?: boolean;
  /** Pages it can't go on, because view-transition names would collide. */
  notOn?: BuiltInPage[];
  fields: FieldDef[];
}

const text = (key: string, label: string, hint?: string): FieldDef => ({ key, label, kind: 'text', hint });
const area = (key: string, label: string, hint?: string): FieldDef => ({ key, label, kind: 'area', hint });
const link = (key: string, label = 'Goes to'): FieldDef => ({
  key,
  label,
  kind: 'link',
  inspectorOnly: true,
  hint: 'A page on this site, such as /about/, or a full web address.',
});
const linkList: FieldDef = {
  key: 'links',
  label: 'Links',
  kind: 'list',
  max: 3,
  item: [text('label', 'Text'), link('link')],
};

export const SECTIONS: Record<SectionType, SectionDef> = {
  hero: {
    name: 'Hero',
    group: 'Page openers',
    note: 'Tagline, introduction, two buttons and a row of work.',
    page: 'home',
    opener: true,
    once: true,
    required: true,
    fields: [
      text('eyebrow', 'Small line'),
      { key: 'line1', label: 'Tagline, first line', kind: 'text', inspectorOnly: true },
      { key: 'line2', label: 'Tagline, second line', kind: 'text', inspectorOnly: true, hint: 'This line takes the accent colour.' },
      area('lede', 'Introduction'),
      text('primary.label', 'First button'),
      link('primary.link'),
      text('secondary.label', 'Second button'),
      link('secondary.link'),
      { key: 'reel', label: 'Show a row of work under the hero', kind: 'toggle' },
    ],
  },
  'page-header': {
    name: 'Page header',
    group: 'Page openers',
    note: 'A small line, the page title and a short introduction.',
    opener: true,
    once: true,
    fields: [text('eyebrow', 'Small line'), text('heading', 'Page title'), area('intro', 'Introduction')],
  },
  grid: {
    name: 'Custom section',
    group: 'Your own',
    note: 'Your own layout: drag and resize elements on a 12-column grid.',
    fields: [],
  },
  manifesto: {
    name: 'Big statement',
    group: 'Telling the story',
    note: 'One large sentence, lit word by word, beside a short note.',
    once: true,
    fields: [
      { key: 'heading', label: 'Statement', kind: 'lit' },
      { key: 'lead', label: 'Note beside it', kind: 'inline-markdown' },
      text('action.label', 'Link text'),
      link('action.link'),
    ],
  },
  deck: {
    name: 'Selected work',
    group: 'Showing work',
    note: 'The projects marked “On home page”, as a stack of cards.',
    once: true,
    notOn: ['work'],
    fields: [text('heading', 'Heading'), area('intro', 'Introduction'), text('action.label', 'Link text'), link('action.link')],
  },
  disciplines: {
    name: 'What I do',
    group: 'Showing work',
    note: 'One large row per kind of work, each linking to it.',
    once: true,
    fields: [text('heading', 'Heading'), area('intro', 'Introduction')],
  },
  'photo-strip': {
    name: 'Photo strip',
    group: 'Showing work',
    note: 'A small collage that leads to the gallery.',
    once: true,
    fields: [text('heading', 'Heading'), area('intro', 'Introduction'), text('action.label', 'Link text'), link('action.link')],
  },
  'about-teaser': {
    name: 'About teaser',
    group: 'Telling the story',
    note: 'The portrait and a line about you, linking to About.',
    nextStep: true,
    once: true,
    notOn: ['about'],
    fields: [text('heading', 'Heading'), area('body', 'Text'), text('linkLabel', 'Link text')],
  },
  'cta-band': {
    name: 'Closing links',
    group: 'Next steps',
    note: 'A band that sends people on to other pages.',
    nextStep: true,
    fields: [text('eyebrow', 'Small line'), text('heading', 'Heading'), area('body', 'Text'), linkList],
  },
  profile: {
    name: 'About profile',
    group: 'Page openers',
    note: 'Portrait, statement, story, résumé, process, tools and experience.',
    page: 'about',
    opener: true,
    once: true,
    required: true,
    fields: [
      text('eyebrow', 'Small line'),
      text('title', 'Page title'),
      area('statement', 'Statement'),
      { key: 'body', label: 'Your story', kind: 'markdown' },
      { ...text('resumeLabel', 'Résumé button'), soft: true },
      { ...text('processHeading', 'Process heading'), soft: true },
      { key: 'process', label: 'Process steps', kind: 'list', max: 6, item: [text('title', 'Step'), area('body', 'What happens')] },
      { ...text('toolsHeading', 'Tools heading'), soft: true },
      { ...text('toolsNote', 'Note under the tools'), soft: true },
      { ...text('experienceHeading', 'Experience heading'), soft: true },
      {
        key: 'experience',
        label: 'Experience',
        kind: 'list',
        item: [text('period', 'When'), text('role', 'Role'), text('place', 'Where')],
      },
      { key: 'closing', label: 'Closing line', kind: 'lit' },
    ],
  },
  contact: {
    name: 'Contact details and form',
    group: 'Page openers',
    note: 'Your email addresses beside the message form.',
    page: 'contact',
    opener: true,
    once: true,
    required: true,
    fields: [
      text('eyebrow', 'Small line'),
      text('heading', 'Page title'),
      area('lede', 'Introduction'),
      { key: 'form.title', label: 'Form title', kind: 'text', inspectorOnly: true },
      { key: 'form.subtitle', label: 'Form introduction', kind: 'text', inspectorOnly: true },
      { key: 'form.submitLabel', label: 'Send button', kind: 'text', inspectorOnly: true },
      { key: 'form.successMessage', label: 'Message after sending', kind: 'text', inspectorOnly: true },
    ],
  },
  fortune: {
    name: 'Fortune peach',
    group: 'Telling the story',
    note: 'The little game on the Contact page.',
    page: 'contact',
    once: true,
    fields: [
      text('heading', 'Heading'),
      text('intro', 'Introduction'),
      { key: 'fortunes', label: 'Fortunes', kind: 'list', min: 3, inspectorOnly: true },
    ],
  },
  gallery: {
    name: 'Photo gallery',
    group: 'Showing work',
    note: 'All your photographs, with before and after.',
    page: 'photography',
    once: true,
    required: true,
    fields: [],
  },
  'work-header': {
    name: 'Work header',
    group: 'Page openers',
    note: 'The page title and the filters.',
    page: 'work',
    opener: true,
    once: true,
    required: true,
    fields: [text('eyebrow', 'Small line'), text('heading', 'Page title'), area('intro', 'Introduction')],
  },
  'work-list': {
    name: 'Project grid',
    group: 'Showing work',
    note: 'Large project cards. It follows the filters on the page.',
    page: 'work',
    once: true,
    required: true,
    fields: [{ key: 'emptyText', label: 'Text when nothing matches', kind: 'text', inspectorOnly: true }],
  },
  'work-logos': {
    name: 'Logo tiles',
    group: 'Showing work',
    note: 'Small tiles for the projects marked “Small tile”.',
    page: 'work',
    once: true,
    fields: [text('heading', 'Heading'), area('intro', 'Introduction')],
  },
};

/** Sections that can go on any page, so they're in PageBody and on every route. */
export const coreSections = (Object.keys(SECTIONS) as SectionType[]).filter((type) => !SECTIONS[type].page);

/** Can this section be added to this page? Custom pages take core sections only. */
export function allowedOn(type: SectionType, pageId: string): boolean {
  const def = SECTIONS[type];
  if (def.page) return def.page === pageId;
  return !def.notOn?.includes(pageId as BuiltInPage);
}
