/**
 * Lightweight DOM helpers shared across components. Framework-agnostic: used by
 * Vue islands and by Astro components' scoped scripts alike.
 */

/**
 * Throttle a handler to the next animation frame.
 * Useful for pointermove/scroll handlers to avoid layout thrash.
 */
export function rafThrottle<T extends (...args: any[]) => void>(fn: T): T {
  let pending = false;
  let lastArgs: any[] = [];
  const wrapped = ((...args: any[]) => {
    lastArgs = args;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      fn(...lastArgs);
    });
  }) as T;
  return wrapped;
}

/** True if user prefers reduced motion. */
export function isReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Call `cb` whenever the reduced-motion preference changes (e.g. the visitor
 * flips the OS setting mid-animation). Returns an unsubscribe function.
 */
export function onReducedMotionChange(cb: (reduced: boolean) => void): () => void {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

/**
 * True when a click came from a real pointer (mouse, touch, pen). Keyboard and
 * assistive-technology clicks have an empty pointerType (Pointer Events spec);
 * where click isn't a PointerEvent, fall back to their detail of 0.
 */
export function isPointerClick(e: MouseEvent): boolean {
  return typeof PointerEvent !== 'undefined' && e instanceof PointerEvent
    ? e.pointerType !== ''
    : e.detail !== 0;
}

/** Visibility check used for focus trapping. */
export function isVisible(el: Element): boolean {
  const s = window.getComputedStyle(el);
  // getClientRects() is empty when the element or an ancestor is display:none.
  // offsetParent can't stand in for it: it is always null for position:fixed
  // elements, which are visible.
  return s.visibility !== 'hidden' && s.display !== 'none' && el.getClientRects().length > 0;
}

/** Release functions of the installed focus traps, keyed by container. */
const activeTraps = new WeakMap<HTMLElement, () => void>();

/**
 * Trap focus within a container by cycling Tab/Shift+Tab.
 * Returns a cleanup function to release the trap.
 */
export function trapFocus(container: HTMLElement, focusableSelector: string): () => void {
  // Re-trapping a container (e.g. a modal element reused for the next item)
  // replaces its trap instead of stacking a second listener.
  activeTraps.get(container)?.();

  const tabbables = () =>
    Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (el) =>
        !(el as HTMLButtonElement).disabled &&
        // The attribute, not .tabIndex: happy-dom reports -1 for plain buttons.
        !(Number(el.getAttribute('tabindex')) < 0) &&
        isVisible(el)
    );

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    const items = tabbables();
    // Hidden or detached container: stay inert instead of swallowing Tab.
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current === -1) {
      // Focus is outside the trap, e.g. dropped to <body> because the focused
      // button just became disabled. Pull it back in.
      (e.shiftKey ? last : first).focus();
      e.preventDefault();
    } else if (e.shiftKey && current === 0) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && current === items.length - 1) {
      first.focus();
      e.preventDefault();
    }
  };
  // Focus can also leave with no keydown we can see: Tab inside a cross-origin
  // iframe (e.g. a Figma embed) moves it straight to the page behind. Bring it
  // back to the first item.
  const onFocusIn = (e: FocusEvent) => {
    if (container.contains(e.target as Node)) return;
    tabbables()[0]?.focus();
  };
  // Listen on document: once focus has dropped to <body>, the container never
  // sees the keydown.
  document.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocusIn);
  const release = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('focusin', onFocusIn);
    if (activeTraps.get(container) === release) activeTraps.delete(container);
  };
  activeTraps.set(container, release);
  return release;
}

let scrollLocks = 0;

/**
 * Lock page scrolling while a dialog, menu or lightbox is open. Ref-counted, so
 * nested overlays release correctly; the returned function is idempotent.
 * `scrollbar-gutter: stable` on <html> keeps the layout from shifting. The
 * reserved gutter shows the root's background, which no overlay can cover, so
 * a dark overlay passes `'dark'` and the gutter turns dark with it.
 */
export function lockScroll(tone?: 'dark'): () => void {
  scrollLocks += 1;
  document.documentElement.dataset.scrollLocked = tone ?? '';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) delete document.documentElement.dataset.scrollLocked;
  };
}
