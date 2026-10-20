/**
 * Curated copy and structure for the v2 content migration (scripts/migrate-v2.mjs).
 * Hand-written text lives here — never in the generated YAML — so the migration
 * can be re-run against fresh old content without losing it.
 *
 * Every image is a `src` the script resolves and copies into the entry folder:
 *   asset:<path>     src/assets/<path>
 *   public:<path>    public/<path>
 *   extra:<file>     scripts/migrate-v2-assets/<file> (new artwork, e.g. Figma exports)
 *   logo:<name>:<k>  src/assets/logos/<name>_<k>.png   (k = grid | preview)
 *   svgcrop:<file>:<viewBox>   public/guidelines/peachless/<file> with a new viewBox
 * `as` is the file name inside the entry folder (what the YAML stores).
 *
 * The REVIEW lists end up in the migration report: facts the owner should confirm.
 */

const GUIDE = 'public:guidelines/peachless/';

// The brand book's real page titles (the old file names were misleading), and
// page 8 — Typography — cropped out of the overview board, where it only lived.
const GUIDE_PAGES = [
  ['01-cover.svg', 'guide-01-cover.svg', 'Cover'],
  ['02-logo-construction.svg', 'guide-02-index.svg', 'Index'],
  ['03-clear-space.svg', 'guide-03-about.svg', 'About'],
  ['04-color-palette.svg', 'guide-04-logo-concept.svg', 'Logo concept'],
  ['05-typography.svg', 'guide-05-full-logotype.svg', 'Full logotype'],
  ['06-iconography.svg', 'guide-06-construction.svg', 'Construction'],
  ['07-dos-and-donts.svg', 'guide-07-clear-space.svg', 'Clear space & usage'],
  ['svgcrop:08-stationery.svg:5821.66 1105 1919 1080', 'guide-08-typography.svg', 'Typography'],
  ['09-social-media.svg', 'guide-09-colour-system.svg', 'Colour system'],
  ['10-merchandise.svg', 'guide-10-thank-you.svg', 'Thank you'],
];

const logoVariants = (name, label) => [
  { src: `logo:${name}:preview`, as: 'logo.png', alt: `${label} logo in its original colours`, label: 'Original colours', panel: 'paper' },
  { src: `logo:${name}:grid`, as: 'logo-peach.png', alt: `${label} logo redrawn in the peachless. palette`, label: 'In the peachless. palette', panel: 'linen' },
];

export const PROJECTS = [
  {
    id: 'peachless',
    order: 1,
    featured: true,
    title: 'peachless. brand identity',
    summary: 'My own brand: a peach that hides the letters of its name, a warm colour system and a ten-page brand book.',
    disciplines: ['graphic-design'],
    cover: { src: 'asset:home/hero.png', as: 'lockup.png', alt: 'The peachless. logo: a stylised peach above the wordmark', panel: 'paper', fit: 'contain' },
    blocks: [
      {
        type: 'text',
        heading: 'The idea',
        body:
          'The **peachless.** logo is built around the stylised shape of a peach, symbolising naturalness, freshness and simplicity. The design is minimalist, modern and elegant, with clean lines and balanced geometric elements.\n\nAt the core of the logo, the peach subtly incorporates the letters that form the word **peachless.**, turning the symbol into a unique and memorable brand identity — a clever integration that gives the logo both visual appeal and conceptual depth.',
      },
      {
        type: 'logo',
        heading: 'The mark',
        caption: 'The full logo combines the wordmark and symbol for a complete, balanced brand mark. The wordmark is set in a classic serif — the period adds a confident, modern touch.',
        variants: [
          { src: 'asset:home/hero.png', as: 'lockup.png', alt: 'Full logotype: the peach symbol above the peachless. wordmark', label: 'Full logotype', panel: 'paper' },
          { src: 'public:favicon.svg', as: 'symbol.svg', alt: 'The peach symbol on its own', label: 'Symbol', panel: 'linen' },
        ],
      },
      {
        type: 'text',
        heading: 'Colour system',
        body:
          'The colour palette is a curated harmony of soft neutrals and bold contrast — warm peachy tones, cream and muted black that reflect a friendly yet refined tone. Rooted in minimalism, these colours are the foundation for every touchpoint of the brand.',
      },
      {
        type: 'palette',
        swatches: [
          { name: 'Peach', hex: '#E1A892' },
          { name: 'Blush', hex: '#F1CFBE' },
          { name: 'Cream', hex: '#FEF0E4' },
          { name: 'Porcelain', hex: '#FDF6F0' },
          { name: 'Ink', hex: '#030303' },
        ],
      },
      {
        type: 'image',
        image: { src: 'svgcrop:08-stationery.svg:0 0 7746.66 3290', as: 'brand-book-overview.svg' },
        alt: 'All ten pages of the peachless. brand book laid out side by side',
        caption: 'The brand book at a glance.',
        size: 'wide',
      },
      {
        type: 'guidelines',
        heading: 'Read the brand book',
        pages: GUIDE_PAGES.map(([src, as, title]) => ({
          title,
          image: { src: src.startsWith('svgcrop:') ? src : GUIDE + src, as },
        })),
      },
      { type: 'quote', quote: 'Every pixel tells a story. Let the world know yours.', attribution: 'peachless.' },
    ],
    review: [
      'Swatch names (Peach, Blush, Cream, Porcelain, Ink) are new — the brand book lists hex values only.',
      'The cover page of the brand book reads “Let the world kow yours.” (typo).',
      'The guideline SVGs use live text in Minion / Neue Haas without embedded fonts, so visitors see fallback fonts. Re-export with outlined text (or as 2× PNG/AVIF) and replace them in the admin.',
    ],
  },
  {
    id: 'ton',
    order: 2,
    featured: true,
    title: 'TON',
    summary: 'Identity and booking app for music students: find a free practice room at the Faculty of Music in Brașov and book it in a few taps.',
    disciplines: ['graphic-design', 'uiux'],
    year: 2025,
    tools: ['figma'],
    cover: { src: 'logo:ton:preview', as: 'logo.png', alt: 'The TON logo: a wordmark with a musical note rising from the O', panel: 'paper', fit: 'contain' },
    blocks: [
      {
        type: 'text',
        heading: 'The brief',
        body:
          'TON helps students of the Faculty of Music at Transilvania University of Brașov find a free practice room — piano, guitar, violin and more — and reserve it straight from their phone.',
      },
      {
        type: 'logo',
        heading: 'The mark',
        caption: 'The O doubles as a power symbol, crowned with a musical note.',
        variants: logoVariants('ton', 'TON'),
      },
      {
        type: 'gallery',
        heading: 'The app',
        images: [
          { image: { src: 'extra:ton-screen-landing.webp', as: 'screen-landing.webp' }, alt: 'TON splash screen showing the logo', caption: 'Launch' },
          { image: { src: 'extra:ton-screen-home.webp', as: 'screen-home.webp' }, alt: 'Home screen recommending practice rooms with their live availability', caption: 'Recommended rooms' },
          { image: { src: 'extra:ton-screen-room.webp', as: 'screen-room.webp' }, alt: 'Booking a piano room by choosing a date and a time', caption: 'Book a room' },
          { image: { src: 'extra:ton-screen-sessions.webp', as: 'screen-sessions.webp' }, alt: 'List of upcoming practice sessions with dates and times', caption: 'Upcoming sessions' },
        ],
      },
      {
        type: 'text',
        heading: 'The flow',
        body:
          'Students see recommended rooms and whether they are free, pick a date and a time, and find every upcoming session in one list. The prototype also covers booking a past room again, temporarily closed rooms and switching between English and Romanian.',
      },
      { type: 'prototype', url: 'FIGMA:ton', label: 'Try the TON prototype' },
    ],
    review: [
      'Confirm the context: was TON made for the Faculty of Music, Transilvania University of Brașov (as the prototype shows), or as a concept/student project?',
      'The prototype home screen spells the university “Transilvanya”.',
    ],
  },
  {
    id: 'melody-memoirs',
    order: 3,
    featured: true,
    title: 'Melody Memoirs',
    summary: 'Logo and app prototype for Melody Memoirs — an open book that turns into a musical note.',
    disciplines: ['graphic-design', 'uiux'],
    year: 2025,
    tools: ['figma'],
    cover: { src: 'logo:melody:preview', as: 'logo.png', alt: 'The Melody Memoirs logo: an open book with a musical note rising from its pages', panel: 'blush', fit: 'contain' },
    blocks: [
      {
        type: 'text',
        heading: 'The idea',
        body: 'Melody Memoirs brings music and memory together: the mark is an open book whose pages hold a single note.',
      },
      {
        type: 'logo',
        heading: 'The mark',
        variants: logoVariants('melody', 'Melody Memoirs'),
      },
      { type: 'prototype', url: 'FIGMA:melody-memoirs', label: 'Try the Melody Memoirs prototype' },
    ],
    review: ['Write the story: who is Melody Memoirs for, and what does the app do? (No screens could be exported — it is a Figma Make file.)'],
  },
  {
    id: 'cern',
    order: 4,
    title: 'CERN',
    summary: 'A bilingual website concept for CERN — homepage, news and mission pages, designed in Figma.',
    disciplines: ['uiux'],
    year: 2025,
    tools: ['figma'],
    cover: { src: 'extra:cern-home.webp', as: 'cover.webp', alt: 'CERN homepage concept: “Welcome to CERN” above cards for news, experiments and research', panel: 'none', fit: 'cover' },
    blocks: [
      {
        type: 'text',
        heading: 'The brief',
        body:
          'A concept for CERN’s website: a homepage that surfaces the latest news, experiments and research, a news section filtered by topic, and an about page built around CERN’s mission — in English and French.',
      },
      {
        type: 'gallery',
        heading: 'The pages',
        images: [
          { image: { src: 'extra:cern-news.webp', as: 'news.webp' }, alt: 'News page with topic filters such as Accelerators, Computing and Physics', caption: 'News, filtered by topic' },
          { image: { src: 'extra:cern-about.webp', as: 'about.webp' }, alt: 'About page introducing CERN’s mission', caption: 'About and mission' },
          { image: { src: 'extra:cern-home-fr.webp', as: 'home-fr.webp' }, alt: 'The homepage in French: “Bienvenue au CERN”', caption: 'In French' },
        ],
      },
      { type: 'prototype', url: 'FIGMA:cern', label: 'Try the CERN prototype' },
    ],
    review: [
      'Confirm the context (concept, coursework or commissioned).',
      'The homepage design spells “Reasearch” twice.',
    ],
  },
  {
    id: 'blend',
    order: 5,
    title: 'Blend',
    summary: 'A painted ring of colour for Blend, a creative studio blending artistry with technology.',
    disciplines: ['graphic-design'],
    cover: { src: 'logo:blend:preview', as: 'logo.png', alt: 'The Blend logo: a brushed ring of warm colour', panel: 'paper', fit: 'contain' },
    blocks: [
      { type: 'text', heading: 'The brief', body: 'Blend is a creative design studio blending artistry with technology.' },
      { type: 'logo', heading: 'The mark', variants: logoVariants('blend', 'Blend') },
    ],
    review: ['Real client or concept? Add the year and the story behind the mark.'],
  },
  {
    id: 'fish-seafood',
    order: 6,
    title: 'Fish & Seafood',
    summary: 'A bold wordmark for a seafood supplier, with fish swimming through the letters.',
    disciplines: ['graphic-design'],
    cover: { src: 'logo:fish_seafood:preview', as: 'logo.png', alt: 'The Fish & Seafood logo: a bold wordmark on a tilted blue panel', panel: 'paper', fit: 'contain' },
    blocks: [
      { type: 'text', heading: 'The brief', body: 'Fish & Seafood is a premium seafood supplier delivering fresh quality daily.' },
      { type: 'logo', heading: 'The mark', variants: logoVariants('fish_seafood', 'Fish & Seafood') },
    ],
    review: ['Real client or concept? Add the year and the story behind the mark.'],
  },
  {
    id: 'intouch',
    order: 7,
    title: 'InTouch',
    summary: 'Identity for InTouch, a communication platform — the word “touch” held inside the curve of “in”.',
    disciplines: ['graphic-design'],
    cover: { src: 'logo:intouch:preview', as: 'logo.png', alt: 'The InTouch logo: the word touch set vertically inside a bold letter n', panel: 'paper', fit: 'contain' },
    blocks: [
      { type: 'text', heading: 'The brief', body: 'InTouch is a communication platform connecting people worldwide.' },
      { type: 'logo', heading: 'The mark', variants: logoVariants('intouch', 'InTouch') },
    ],
    review: ['Real client or concept? Add the year and the story behind the mark.'],
  },
  {
    id: 'the-world',
    order: 8,
    title: 'The World of Biologi',
    summary: 'A botanical wordmark for The World of Biologi, with vines growing through the letters.',
    disciplines: ['graphic-design'],
    cover: { src: 'logo:the_world:preview', as: 'logo.png', alt: 'The World of Biologi logo: vintage lettering wrapped in green vines', panel: 'paper', fit: 'contain' },
    blocks: [
      { type: 'text', heading: 'The brief', body: 'A wordmark for The World of Biologi, where the type grows its own leaves.' },
      { type: 'logo', heading: 'The mark', variants: logoVariants('the_world', 'The World of Biologi') },
    ],
    review: [
      'The old site called this “The World — a global news and media organization”, but the artwork reads “The World of Biologi”. Confirm the name and what it is for.',
    ],
  },
  {
    id: 'logo-wordmark',
    order: 9,
    hidden: true,
    title: 'LoGo',
    summary: 'Wordmark concept for a graphic design studio.',
    disciplines: ['graphic-design'],
    cover: { src: 'logo:logo:preview', as: 'logo.png', alt: 'The LoGo wordmark with a painted texture between the letters', panel: 'paper', fit: 'contain' },
    blocks: [{ type: 'logo', heading: 'The mark', variants: logoVariants('logo', 'LoGo') }],
    review: ['Hidden for now: give it a real name and description, then switch off “Hide from site”.'],
  },
];

// Photos keep their ids and order; alt text describes what is in the frame.
export const PHOTOS = {
  'wild-fox': { alt: 'A red fox standing in a black-and-white woodland, the only colour in the frame' },
  'cave-in-gibraltar': { alt: 'Stalactites in a cave lit in vivid purple, green and blue', location: 'Gibraltar' },
  'the-moon': { alt: 'A full moon against a black sky' },
  sunset: { alt: 'An orange sun setting behind a line of trees and power lines' },
  stairway: { alt: 'A carved wooden staircase beneath a stained-glass ceiling' },
  'fish-in-the-sea': { alt: 'Two striped butterflyfish against dark red coral' },
  'italian-arch': { alt: 'Mountains framed by the stone columns of an arcade' },
  'alpine-forest': { alt: 'Tall pine trees disappearing into fog, seen from below' },
};

export const HOME = {
  eyebrow: 'Hi, I’m Patricia — visual designer',
  tagline: { line1: 'Every pixel tells a story.', line2: 'Let the world know yours.' },
  lede: 'I design brand identities, interfaces and images — blending the precision of UI/UX with the expressive freedom of graphic design.',
  primaryCta: { label: 'See my work', link: '/projects/' },
  secondaryCta: { label: 'Let’s talk', link: '/contact/' },
  // manifesto.heading + manifesto.lead come from the old home.yaml
  services: { heading: 'What I do', intro: 'Three crafts, one way of seeing: every project starts with the feeling it should leave behind.' },
  featured: { heading: 'Selected work', intro: 'A few projects, from first sketch to finished system.' },
  photography: { heading: 'Through my lens', intro: 'Photography and retouching — open a photo to compare the before and after.' },
  about: { heading: 'Hi, I’m Patricia.', linkLabel: 'More about me' },
  seo: { description: 'peachless. — the portfolio of Patricia, a visual designer working across brand identity, UI/UX and photography.' },
};

export const WORK = {
  eyebrow: 'Work',
  heading: 'Selected work',
  intro: 'Brand identities, interfaces and the stories behind them.',
  disciplines: {
    graphicDesign: { title: 'Graphic design', description: 'Logos, identities and brand guidelines — crafted with intention.' },
    uiux: { title: 'UI/UX', description: 'Interfaces and prototypes that connect with people.' },
    photography: { title: 'Photography', description: 'Light, texture and careful retouching — before and after.' },
  },
  seo: { description: 'Selected brand identity, UI/UX and photography work by Patricia at peachless.' },
};

export const ABOUT = {
  eyebrow: 'About',
  title: 'Hi, I’m Patricia.',
  portraitAlt: 'Portrait of Patricia, the designer behind peachless.',
  seo: { description: 'About Patricia — a visual designer exploring the space between art and functionality.' },
};

export const CONTACT = {
  eyebrow: 'Contact',
  heading: 'Let’s create together.',
  lede: 'Have a project in mind? Let’s bring your vision to life — write to me directly or send a message below.',
  form: {
    title: 'Send a message',
    subtitle: 'Tell me a little about your project and I’ll get back to you.',
    submitLabel: 'Send message',
    successMessage: 'Message sent — thank you!',
  },
  fortune: {
    heading: 'Need a little luck first?',
    intro: 'Tap the peach to crack open a fortune.',
    // fortunes come from FortunePeach.astro
  },
  seo: { description: 'Get in touch with Patricia at peachless. — new projects, collaborations or just to say hello.' },
};

export const PHOTOGRAPHY = {
  eyebrow: 'Photography',
  heading: 'Through my lens',
  lede: 'Moments of light and texture, and the retouching behind them — open a photo to compare the before and after.',
  seo: { description: 'Photography and retouching by peachless. — compare the before and after of each edit.' },
};

export const SITE = {
  siteName: 'peachless.',
  ownerName: 'Patricia',
  nav: [
    { label: 'Work', href: '/projects/' },
    { label: 'Photography', href: '/photography/' },
    { label: 'About', href: '/about/' },
    { label: 'Contact', href: '/contact/', cta: true },
  ],
  cta: { eyebrow: 'Have a project in mind?', heading: 'Let’s create together.', buttonLabel: 'Start a conversation', buttonLink: '/contact/' },
};
