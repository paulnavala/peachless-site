/**
 * Elegant Footer Component
 *
 * Handles scroll reveal animation for the elegant footer using
 * IntersectionObserver API for efficient viewport detection.
 *
 * Features:
 * - Smooth reveal animation when footer enters viewport
 * - Fallback for browsers without IntersectionObserver
 * - One-time trigger (unobserves after activation)
 *
 * CSS Dependency:
 * - Requires .elegant-footer and .is-inview classes
 * - Animation handled via CSS transitions
 *
 * @module elegant-footer
 */

(function () {
  'use strict';

  /**
   * Initialize footer reveal animation
   *
   * Sets up IntersectionObserver to detect when footer enters viewport
   * and adds 'is-inview' class to trigger CSS animations.
   *
   * @function initFooter
   * @returns {void}
   */
  function initFooter() {
    // Get footer element
    const el = document.getElementById('elegant-footer');
    if (!el) {
      return; // Footer not present, exit gracefully
    }

    // Fallback for browsers without IntersectionObserver support
    if (!('IntersectionObserver' in window)) {
      // Show footer immediately on unsupported browsers
      el.classList.add('is-inview');
      return;
    }

    /**
     * IntersectionObserver callback
     * Triggers when footer enters viewport
     */
    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            // Footer is visible, trigger reveal animation
            el.classList.add('is-inview');

            // Unobserve after triggering (one-time animation)
            io.unobserve(el);
          }
        });
      },
      {
        root: null, // Use viewport as root
        threshold: 0.12, // Trigger when 12% of footer is visible
      }
    );

    // Start observing footer element
    io.observe(el);
  }

  /**
   * Initialize when DOM is ready
   *
   * Supports both standard DOMContentLoaded and cases where script
   * loads after DOM is already ready (e.g., Squarespace AJAX navigation)
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFooter);
  } else {
    // DOM already ready, initialize immediately
    initFooter();
  }
})();
