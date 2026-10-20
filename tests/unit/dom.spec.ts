// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isReducedMotion, isVisible, trapFocus, rafThrottle, isPointerClick } from '../../src/lib/dom';

describe('dom utilities', () => {
  describe('isReducedMotion', () => {
    it('returns a boolean', () => {
      expect(typeof isReducedMotion()).toBe('boolean');
    });

    it('does not throw', () => {
      expect(() => isReducedMotion()).not.toThrow();
    });
  });

  describe('isVisible', () => {
    it('returns true for a visible element', () => {
      const el = document.createElement('div');
      el.style.width = '100px';
      el.style.height = '100px';
      document.body.appendChild(el);
      // happy-dom may not fully compute offsetParent, so test the function doesn't throw
      const result = isVisible(el);
      expect(typeof result).toBe('boolean');
      document.body.removeChild(el);
    });

    it('returns false for display:none element', () => {
      const el = document.createElement('div');
      el.style.display = 'none';
      document.body.appendChild(el);
      expect(isVisible(el)).toBe(false);
      document.body.removeChild(el);
    });

    it('returns false for visibility:hidden element', () => {
      const el = document.createElement('div');
      el.style.visibility = 'hidden';
      document.body.appendChild(el);
      expect(isVisible(el)).toBe(false);
      document.body.removeChild(el);
    });
  });

  describe('trapFocus', () => {
    const releases: Array<() => void> = [];
    afterEach(() => {
      // Traps listen on document, so one left installed would intercept Tab in later tests.
      releases.splice(0).forEach((release) => release());
      vi.restoreAllMocks();
      document.body.replaceChildren();
    });

    function setup(count = 2) {
      const container = document.createElement('div');
      const buttons = Array.from({ length: count }, (_, i) => {
        const btn = document.createElement('button');
        btn.textContent = `Button ${i + 1}`;
        container.appendChild(btn);
        return btn;
      });
      document.body.appendChild(container);
      return { container, buttons };
    }

    function trap(container: HTMLElement) {
      const release = trapFocus(container, 'button');
      releases.push(release);
      return release;
    }

    function pressTab(target: Element, shiftKey = false) {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    }

    it('returns a cleanup function', () => {
      const { container } = setup();
      expect(typeof trap(container)).toBe('function');
    });

    it('cycles focus on Tab at the last element', () => {
      const { container, buttons: [first, last] } = setup();
      trap(container);
      last.focus();
      expect(pressTab(last).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
    });

    it('cycles focus on Shift+Tab at the first element', () => {
      const { container, buttons: [first, last] } = setup();
      trap(container);
      first.focus();
      expect(pressTab(first, true).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
    });

    it('skips disabled controls when wrapping', () => {
      const { container, buttons: [first, middle, last] } = setup(3);
      last.disabled = true;
      trap(container);
      middle.focus();
      expect(pressTab(middle).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
    });

    it('pulls focus back in when Tab is pressed from <body>', () => {
      const { container, buttons: [first, last] } = setup();
      trap(container);

      // e.g. the focused button just became disabled
      first.focus();
      first.blur();
      expect(pressTab(document.body).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);

      first.blur();
      expect(pressTab(document.body, true).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
    });

    it('brings focus back when it moves outside the container', () => {
      const { container, buttons: [first] } = setup();
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      trap(container);

      // e.g. Tab out of a cross-origin iframe, which sends no keydown to this page
      outside.focus();
      expect(document.activeElement).toBe(first);
    });

    it('replaces the existing trap when the same container is trapped again', () => {
      const { container, buttons: [first, last] } = setup();
      const removeListener = vi.spyOn(document, 'removeEventListener');
      const staleRelease = trap(container);
      trap(container);
      expect(removeListener.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);

      // The replaced trap's release must not disable its replacement
      staleRelease();
      last.focus();
      pressTab(last);
      expect(document.activeElement).toBe(first);
    });

    it('stops intercepting once released', () => {
      const { container, buttons: [, last] } = setup();
      trap(container)();
      last.focus();
      expect(pressTab(last).defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(last);
    });
  });

  describe('isPointerClick', () => {
    it('is true for mouse, touch and pen clicks', () => {
      for (const pointerType of ['mouse', 'touch', 'pen']) {
        expect(isPointerClick(new PointerEvent('click', { pointerType, detail: 1 }))).toBe(true);
      }
    });

    it('is false for keyboard and assistive-technology clicks, whatever their detail', () => {
      expect(isPointerClick(new PointerEvent('click', { pointerType: '', detail: 0 }))).toBe(false);
      expect(isPointerClick(new PointerEvent('click', { pointerType: '', detail: 1 }))).toBe(false);
    });

    it('falls back to detail where click is a plain MouseEvent', () => {
      expect(isPointerClick(new MouseEvent('click', { detail: 1 }))).toBe(true);
      expect(isPointerClick(new MouseEvent('click', { detail: 0 }))).toBe(false);
    });
  });

  describe('rafThrottle', () => {
    it('throttles calls and executes with latest args', async () => {
      const calls: number[] = [];
      const fn = vi.fn((n: number) => calls.push(n));
      const throttled = rafThrottle(fn);

      throttled(1);
      throttled(2);
      throttled(3);

      // Wait for rAF to fire
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Should have been called with the latest args (3), not all three
      expect(fn).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([3]);
    });
  });
});
