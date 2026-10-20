/**
 * Lightweight DOM helpers shared across components.
 * These are intentionally framework-agnostic and safe for IIFE bundling.
 */

export const DEFAULT_TIMEOUT = 8000;

/** Wait for an element to appear in the DOM (rAF loop with timeout). */
export function waitFor(selector: string, timeoutMs: number = DEFAULT_TIMEOUT): Promise<Element> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    (function check() {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs)
        return reject(new Error('Timeout waiting for: ' + selector));
      requestAnimationFrame(check);
    })();
  });
}

/** Query a single element with optional scoping element. */
export const qs = (sel: string, el: Document | Element = document) =>
  el.querySelector(sel) as HTMLElement | null;

/** Query all elements with optional scoping element. */
export const qsa = (sel: string, el: Document | Element = document) =>
  Array.from(el.querySelectorAll(sel)) as HTMLElement[];

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

/** Best-effort touch-capable device detection. */
export function isTouchDevice(): boolean {
  return (
    (typeof window !== 'undefined' && 'ontouchstart' in window) ||
    window.matchMedia('(hover: none)').matches
  );
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

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (el) =>
        !(el as HTMLButtonElement).disabled &&
        // The attribute, not .tabIndex: happy-dom reports -1 for plain buttons.
        !(Number(el.getAttribute('tabindex')) < 0) &&
        isVisible(el)
    );
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
  // Listen on document: once focus has dropped to <body>, the container never
  // sees the keydown.
  document.addEventListener('keydown', onKey);
  const release = () => {
    document.removeEventListener('keydown', onKey);
    if (activeTraps.get(container) === release) activeTraps.delete(container);
  };
  activeTraps.set(container, release);
  return release;
}
