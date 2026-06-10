/**
 * Global JavaScript Loader for Squarespace
 * Load all JavaScript files from GitHub Pages
 * 
 * Note: utilities.js loads first as other scripts may depend on it
 * Auto-generated - Run 'node scripts/generate-loaders.js' to regenerate.
 */

(function() {
  'use strict';
  
  const BASE_URL = 'https://assets.peachless.design';
  
  // List of all JS files to load (in order) - auto-generated
  const JS_FILES = [
    // utilities.js loads first as other scripts may depend on it
    '/core/utilities.js',
    '/core/component-loader.js',
    '/core/elegant-footer.js',
    '/core/mobile-menu.js',
    '/core/project-card.js',
    '/core/prototype-showcase.js',
    '/core/tagline.js',
    '/components/contact-form/contact-form.js',
    '/components/fortune-peach/fortune-peach.js',
    '/components/guideline-page/guideline-page.js',
    '/components/logo-showcase/logo-showcase.js',
    '/components/portfolio-photo/portfolio-photo.js',
    '/components/portfolio-uiux/portfolio.js',
    '/components/project-cards/project-cards.js',
    '/components/tagline/tagline.js',
    '/components/twin-gallery/twin-gallery.js'
  ];
  
  // Function to load JS (sequential loading to respect dependencies)
  function loadJS(src, callback) {
    // Check if already loaded
    const existing = document.querySelector(`script[src*="${src}"]`);
    if (existing) {
      if (callback) callback();
      return;
    }
    
    const script = document.createElement('script');
    script.src = BASE_URL + src;
    script.onerror = function() {
      console.warn('Failed to load:', src);
      if (callback) callback();
    };
    if (callback) {
      script.onload = callback;
    }
    document.head.appendChild(script);
  }
  
  // Load JS files sequentially
  let index = 0;
  function loadNext() {
    if (index >= JS_FILES.length) return;
    
    loadJS(JS_FILES[index], function() {
      index++;
      loadNext();
    });
  }
  
  // Start loading when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNext);
  } else {
    loadNext();
  }
})();
