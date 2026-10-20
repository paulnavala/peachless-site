/**
 * Markdown from the CMS (story text blocks, the home manifesto) rendered at
 * build time. Content is written by repository collaborators only, so it is
 * trusted HTML.
 */
import { Marked } from 'marked';

const md = new Marked({ gfm: true, breaks: false });

export const renderMarkdown = (source: string): string => md.parse(source, { async: false }) as string;

/** Inline markdown only (bold, italics, links) — no wrapping <p>. */
export const renderInline = (source: string): string => md.parseInline(source, { async: false }) as string;
