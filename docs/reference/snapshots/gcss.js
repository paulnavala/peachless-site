/**
 * Global CSS Loader for Squarespace
 * Load all CSS files from GitHub Pages
 * 
 * Auto-generated - Run 'node scripts/generate-loaders.js' to regenerate.
 */

(function() {
  'use strict';
  
  const BASE_URL = 'https://assets.peachless.design';
  
  // List of all CSS files to load (auto-generated)
  const CSS_FILES = [
    '/components/contact-form/contact-form.css',
    '/components/fortune-peach/fortune-peach.css',
    '/components/guideline-page/guideline-page.css',
    '/components/logo-showcase/logo-showcase.css',
    '/components/portfolio-photo/close-button-fix.css',
    '/components/portfolio-photo/portfolio-photo.css',
    '/components/portfolio-uiux/portfolio-uiux.css',
    '/components/project-cards/project-cards.css',
    '/components/tagline/tagline.css',
    '/components/twin-gallery/twin-gallery.css',
    '/core/contact-form.css',
    '/core/elegant-footer.css',
    '/core/header.css',
    '/core/mobile-menu.css',
    '/core/portfolio.css',
    '/core/project-cards.css',
    '/core/prototype-showcase.css'
  ];
  
  // Function to load CSS
  function loadCSS(href) {
    // Check if already loaded
    const existing = document.querySelector(`link[href*="${href}"]`);
    if (existing) return;
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = BASE_URL + href;
    document.head.appendChild(link);
  }
  
  // Load all CSS files
  CSS_FILES.forEach(function(file) {
    loadCSS(file);
  });
})();
