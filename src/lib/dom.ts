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
  return s.visibility !== 'hidden' && s.display !== 'none' && (el as any).offsetParent !== null;
}

/**
 * Trap focus within a container by cycling Tab/Shift+Tab.
 * Returns a cleanup function to release the trap.
 */
export function trapFocus(container: HTMLElement, focusableSelector: string): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = Array.from(container.querySelectorAll(focusableSelector)).filter(
      isVisible
    ) as HTMLElement[];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}
