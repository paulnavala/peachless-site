/**
 * A filled-in example of every section. It is what a new section starts with, and
 * the specimens page renders it, because a built page leaves out an empty optional
 * field and the builder's canvas has to get that markup from somewhere.
 * Every optional field is set, so nothing is missing from a specimen.
 */
import type { SectionType } from './content-schema';

type Sample = { type: SectionType } & Record<string, unknown>;

const element = (id: string, type: string, col: number, row: number, w: number, h: number, rest: Record<string, unknown>) => ({
  id,
  type,
  col,
  row,
  w,
  h,
  ...rest,
});

export const SAMPLES: Record<SectionType, Sample> = {
  hero: {
    type: 'hero',
    eyebrow: 'A small line',
    line1: 'Your first line.',
    line2: 'Your second line.',
    lede: 'A sentence or two about what you do.',
    primary: { label: 'See my work', link: '/projects/' },
    secondary: { label: 'Let’s talk', link: '/contact/' },
    reel: true,
  },
  'page-header': { type: 'page-header', eyebrow: 'A small line', heading: 'A new page', intro: 'A sentence about this page.' },
  grid: {
    type: 'grid',
    elements: [
      element('heading', 'heading', 1, 1, 6, 2, { text: 'A heading of your own', style: 'h2' }),
      element('text', 'text', 1, 3, 6, 3, { body: 'Write something here, or drag in another element.' }),
    ],
  },
  manifesto: {
    type: 'manifesto',
    surface: 'paper',
    sheet: true,
    heading: 'A statement worth saying out loud.',
    lead: '**A short note** beside the statement.',
    action: { label: 'More about me', link: '/about/' },
  },
  deck: {
    type: 'deck',
    heading: 'Selected work',
    intro: 'A few projects, from first sketch to finished system.',
    action: { label: 'All work', link: '/projects/' },
  },
  disciplines: { type: 'disciplines', heading: 'What I do', intro: 'A line about how the work connects.' },
  'photo-strip': {
    type: 'photo-strip',
    surface: 'blush',
    sheet: true,
    heading: 'Through my lens',
    intro: 'A line about the photographs.',
    action: { label: 'View the gallery', link: '/photography/' },
  },
  'about-teaser': {
    type: 'about-teaser',
    heading: 'A line about you',
    body: 'Who you are, in a sentence.',
    linkLabel: 'More about me',
  },
  'cta-band': {
    type: 'cta-band',
    surface: 'paper',
    eyebrow: 'Keep exploring',
    heading: 'There’s more to see.',
    body: 'One more sentence to send people on their way.',
    links: [
      { label: 'See the work', link: '/projects/' },
      { label: 'Get in touch', link: '/contact/' },
    ],
  },
  profile: {
    type: 'profile',
    eyebrow: 'About',
    title: 'A line about you',
    statement: 'What you believe, in a sentence.',
    body: 'Your story, in as many paragraphs as it needs.',
    resumeLabel: 'Download my résumé',
    processHeading: 'How I work',
    process: [{ title: 'A step', body: 'What happens in this step.' }],
    toolsHeading: 'Tools',
    toolsNote: 'Each one opens the work I made with it.',
    experienceHeading: 'Experience',
    experience: [{ period: '2020 to now', role: 'A role', place: 'A place' }],
    closing: 'A closing line.',
  },
  contact: {
    type: 'contact',
    eyebrow: 'Contact',
    heading: 'Let’s create together.',
    lede: 'A sentence inviting people to write.',
    resumeLabel: 'Résumé (PDF)',
    form: {
      title: 'Send a message',
      subtitle: 'A line above the form.',
      submitLabel: 'Send message',
      successMessage: 'Message sent. Thank you!',
    },
  },
  fortune: {
    type: 'fortune',
    surface: 'blush',
    sheet: true,
    heading: 'Need a little luck first?',
    intro: 'Tap the peach to crack open a fortune.',
    fortunes: ['A good fortune.', 'A better fortune.', 'The best fortune.'],
  },
  gallery: { type: 'gallery', label: 'Photographs' },
  'work-header': { type: 'work-header', eyebrow: 'Work', heading: 'Selected work', intro: 'A sentence about the work.' },
  'work-list': { type: 'work-list', emptyText: 'New work is on its way.' },
  'work-logos': { type: 'work-logos', heading: 'Logos', intro: 'A line about the logos.' },
};

export const BLOCK_SAMPLES: Record<string, Record<string, unknown>> = {
  text: { type: 'text', heading: 'A new chapter', body: 'Write the next part of the story.' },
  quote: { type: 'quote', quote: 'Kind words from someone you worked with.', attribution: 'Someone kind' },
};
