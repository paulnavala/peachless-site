/**
 * Text that renders as more than text. The components use these at build time
 * and the builder's canvas uses them live, so an edit looks as it will once built.
 */
export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const litWords = (text: string): string[] => text.trim().split(/\s+/);

/** A statement's words, each lit in turn. Built as one string: template whitespace
 *  between the spans would be collapsed or dropped by HTML compression. */
export const litHtml = (text: string): string =>
  litWords(text)
    .map((word, i) => `<span style="--w:${i}">${escapeHtml(word)}</span>`)
    .join(' ');

const STEP = 52; // ms per character
const LINE_PAUSE = 380;
// Deterministic ±16ms jitter, so it feels typed rather than mechanical (and
// server and browser always agree).
const jitter = (i: number) => ((i * 7919) % 33) - 16;

/** The tagline's characters with their typing delays, as one string: template
 *  whitespace between the spans would show up as gaps inside the word, and
 *  minification would drop the word spaces. */
export function taglineHtml(line1: string, line2: string): string {
  let clock = 120;
  const line = (text: string, modifier: string) => {
    const words = text.split(' ').map((word, w, all) => {
      const chars = [...word]
        .map((char) => {
          const span = `<span class="tagline__char" style="--d:${clock + jitter(clock)}ms">${escapeHtml(char)}</span>`;
          clock += STEP;
          return span;
        })
        .join('');
      if (w < all.length - 1) clock += STEP; // the space
      return `<span class="tagline__word">${chars}</span>`;
    });
    return `<span class="tagline__line${modifier}">${words.join(' ')}</span>`;
  };
  const first = line(line1, '');
  clock += LINE_PAUSE;
  return first + line(line2, ' tagline__line--2');
}
