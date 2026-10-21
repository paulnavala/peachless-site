/**
 * A small round label ("View", "Open") that glides beside the pointer over
 * work — the reel, the deck, project cards, photos — saying what a click will
 * do. Mouse only: nothing is built on touch screens, under reduced motion or
 * in forced colours. Decoration: aria-hidden and never in the way of a click
 * (pointer-events: none). Styles: src/styles/components/cursor-label.css.
 *
 * Media opt in with data-cursor="<word>".
 */
const QUERY =
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none)';

export function initCursorLabel(): void {
  const mq = window.matchMedia(QUERY);
  let label: HTMLElement | null = null;
  let word: HTMLElement | null = null;
  let shown = '';
  let frame = 0;
  let x = 0;
  let y = 0;
  let target: Element | null = null;

  const hide = () => {
    if (!label || !shown) return;
    label.removeAttribute('data-on');
    shown = '';
  };

  const update = () => {
    frame = 0;
    const text = mediaUnder(target, x, y)?.getAttribute('data-cursor') ?? '';
    if (!text) return hide();
    if (!label) {
      label = document.createElement('div');
      label.className = 'cursor-label';
      label.setAttribute('aria-hidden', 'true');
      word = document.createElement('span');
      label.append(word);
      document.body.append(label);
    }
    label.style.translate = `${x}px ${y}px`;
    if (text === shown) return;
    word!.textContent = text;
    // Arriving: take up the position first (no transition yet), so the label
    // grows where the pointer is instead of flying in from where it left.
    if (!shown) void label.offsetWidth;
    label.setAttribute('data-on', '');
    shown = text;
  };

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || !mq.matches) return hide();
      x = e.clientX;
      y = e.clientY;
      target = e.target as Element;
      if (!frame) frame = requestAnimationFrame(update);
    },
    { passive: true }
  );
  // A press has been answered (a page or a lightbox is opening), and a page
  // moving under a still pointer leaves the label behind: step aside until the
  // pointer moves again.
  addEventListener('pointerdown', hide, { passive: true });
  addEventListener('scroll', hide, { capture: true, passive: true });
  addEventListener('blur', hide);
  addEventListener('pagehide', hide);
  document.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget as Element | null;
    if (!to || to.tagName === 'IFRAME') hide();
  });
  mq.addEventListener('change', () => {
    if (!mq.matches) hide();
  });
}

/**
 * The labelled media under the pointer. A card's stretched link covers the
 * whole card, so the event target is often its title link: look for the
 * card's media, then check the pointer is really over it.
 */
function mediaUnder(target: Element | null, x: number, y: number): Element | null {
  const media = target?.closest('[data-cursor]') ?? target?.closest('.card')?.querySelector('[data-cursor]');
  if (!media) return null;
  const r = media.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? media : null;
}
