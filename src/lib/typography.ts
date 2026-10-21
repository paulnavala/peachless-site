/**
 * Typesetting details that CSS can't express. A spaced dash (" — " or " – ")
 * stays with the word before it, so no line ever starts with a dash: the space
 * before it becomes a no-break space. Applied to every built page by the
 * `typeset` integration in astro.config.mjs (the dev server shows plain spaces).
 */
const SPACED_DASH = / ([—–]) /g;

export const glueDashes = (text: string): string => text.replace(SPACED_DASH, ' $1 ');

// A <script> or <style> element (left as it is), or a run of text up to the
// next tag (the lookahead leaves the "<" for the next match).
const SCRIPT_STYLE_OR_TEXT = /<(script|style)\b[\s\S]*?<\/\1\s*>|>([^<]+)(?=<)/gi;

/**
 * Glue dashes in a built page: only in text between tags inside <body>, so
 * scripts, styles, attributes, the <title> and meta tags are never touched.
 */
export function glueDashesInHtml(html: string): string {
  const start = html.search(/<body[\s>]/i);
  if (start === -1) return html;
  const body = html.slice(start).replace(SCRIPT_STYLE_OR_TEXT, (match: string, tag?: string, text?: string) =>
    tag ? match : `>${glueDashes(text ?? '')}`
  );
  return html.slice(0, start) + body;
}
