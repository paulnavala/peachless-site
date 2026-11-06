/**
 * Page documents from the per-page singletons. Pure, so scripts/migrate-pages.mjs
 * writes the page files from this same mapping: what the site renders today is
 * what they will hold. Temporary: it goes when the page files arrive.
 *
 * Section ids set the ids a page already uses (`manifesto` gives
 * `manifesto-title`), so nothing an anchor or a spec points at moves.
 */
import type { BuiltInPage } from './section-catalogue';

interface Link {
  label: string;
  link: string;
}
interface Copy {
  heading: string;
  intro?: string;
}

export interface Singletons {
  home: {
    eyebrow?: string;
    tagline: { line1: string; line2: string };
    lede?: string;
    primaryCta: Link;
    secondaryCta?: Link;
    manifesto: { heading: string; lead: string };
    services: Copy;
    featured: Copy;
    photography: Copy;
    about: { heading: string; body: string; linkLabel: string };
    seo?: { description?: string };
  };
  about: {
    eyebrow?: string;
    title: string;
    statement: string;
    closing?: string;
    process?: { title: string; body: string }[];
    experience?: { period: string; role: string; place?: string }[];
    seo?: { description?: string };
  };
  aboutBody: string;
  contact: {
    eyebrow?: string;
    heading: string;
    lede?: string;
    form: { title: string; subtitle?: string; submitLabel: string; successMessage: string };
    fortune: { heading: string; intro?: string; fortunes: string[] };
    seo?: { description?: string };
  };
  photography: { eyebrow?: string; heading: string; lede?: string; seo?: { description?: string } };
  work: { eyebrow?: string; heading: string; intro?: string; logos: Copy; seo?: { description?: string } };
}

export function pagesFromSingletons({ home, about, aboutBody, contact, photography, work }: Singletons) {
  const pages: Record<BuiltInPage, unknown> = {
    home: {
      title: 'Home',
      seo: home.seo,
      sections: [
        {
          id: 'hero',
          type: 'hero',
          eyebrow: home.eyebrow,
          line1: home.tagline.line1,
          line2: home.tagline.line2,
          lede: home.lede,
          primary: home.primaryCta,
          secondary: home.secondaryCta,
        },
        {
          id: 'manifesto',
          type: 'manifesto',
          surface: 'paper',
          sheet: true,
          heading: home.manifesto.heading,
          lead: home.manifesto.lead,
          action: { label: home.about.linkLabel, link: '/about/' },
        },
        {
          id: 'featured',
          type: 'deck',
          heading: home.featured.heading,
          intro: home.featured.intro,
          action: { label: 'All work', link: '/projects/' },
        },
        { id: 'services', type: 'disciplines', heading: home.services.heading, intro: home.services.intro },
        {
          id: 'photography',
          type: 'photo-strip',
          surface: 'blush',
          sheet: true,
          heading: home.photography.heading,
          intro: home.photography.intro,
          action: { label: 'View the gallery', link: '/photography/' },
        },
        {
          id: 'about-teaser',
          type: 'about-teaser',
          heading: home.about.heading,
          body: home.about.body,
          linkLabel: home.about.linkLabel,
        },
      ],
    },
    about: {
      title: 'About',
      seo: about.seo,
      sections: [
        {
          id: 'profile',
          type: 'profile',
          eyebrow: about.eyebrow,
          title: about.title,
          statement: about.statement,
          body: aboutBody,
          resumeLabel: 'Download my résumé',
          processHeading: 'How I work',
          process: about.process,
          toolsHeading: 'Tools',
          toolsNote: 'Each one opens the work I made with it.',
          experienceHeading: 'Experience',
          experience: about.experience,
          closing: about.closing,
        },
        {
          id: 'next-step',
          type: 'cta-band',
          surface: 'paper',
          heading: 'See the work behind the words.',
          links: [
            { label: 'Explore my work', link: '/projects/' },
            { label: 'Photography', link: '/photography/' },
          ],
        },
      ],
    },
    contact: {
      title: 'Contact',
      seo: contact.seo,
      sections: [
        {
          id: 'contact',
          type: 'contact',
          eyebrow: contact.eyebrow,
          heading: contact.heading,
          lede: contact.lede,
          resumeLabel: 'Résumé (PDF)',
          form: contact.form,
        },
        { id: 'fortune', type: 'fortune', surface: 'blush', sheet: true, ...contact.fortune },
        {
          id: 'next-step',
          type: 'cta-band',
          surface: 'paper',
          heading: 'Or browse the work first.',
          links: [
            { label: 'See the work', link: '/projects/' },
            { label: 'Photography', link: '/photography/' },
          ],
        },
      ],
    },
    photography: {
      title: 'Photography',
      seo: photography.seo,
      sections: [
        {
          id: 'header',
          type: 'page-header',
          eyebrow: photography.eyebrow,
          heading: photography.heading,
          intro: photography.lede,
        },
        { id: 'portfolio-photo', type: 'gallery', label: 'Photographs' },
        {
          id: 'next-step',
          type: 'cta-band',
          surface: 'paper',
          heading: 'See the interface and brand work.',
          links: [
            { label: 'All work', link: '/projects/' },
            { label: 'About me', link: '/about/' },
          ],
        },
      ],
    },
    work: {
      title: 'Work',
      seo: work.seo,
      sections: [
        { id: 'header', type: 'work-header', eyebrow: work.eyebrow, heading: work.heading, intro: work.intro },
        { id: 'list', type: 'work-list', emptyText: 'New work is on its way.' },
        { id: 'work-logos', type: 'work-logos', heading: work.logos.heading, intro: work.logos.intro },
        { id: 'next-step', type: 'cta-band', surface: 'paper', heading: 'There’s more to see.', auto: true },
      ],
    },
  };
  return pages;
}
