import { defineComponent, h, type PropType, ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import BeforeAfterSlider from './BeforeAfterSlider';
import { trapFocus, isReducedMotion } from '../../lib/dom';

export interface PhotoItem {
  id: string;
  title: string;
  alt?: string;
  src: string;        // masonry thumbnail src
  srcset: string;     // masonry thumbnail srcset
  modalAfter: string; // large image for the lightbox
  modalBefore?: string;
}

export default defineComponent({
  name: 'PhotographyGallery',
  props: {
    items: { type: Array as PropType<PhotoItem[]>, default: () => [] },
    title: { type: String, default: 'Selected Photography' },
  },
  setup(props) {
    const root = ref<HTMLElement | null>(null);
    const modalOpen = ref(false);
    const activeIndex = ref<number>(-1);
    const lastFocusEl = ref<HTMLElement | null>(null);
    let lastScrollY = 0;
    const modalRatio = ref<number>(1);
    let releaseFocusTrap: (() => void) | null = null;



    const visibleCount = computed<number>(() => normalizedItems.value.length);

    // Masonry incremental loading (infinite scroll)
    const masonryBatchSize = 20;
    const masonryLoadedCount = ref<number>(masonryBatchSize);

    const colCount = ref<number>(3);
    function computeColCount() {
      try {
        const w = window.innerWidth || 1200;
        if (w < 600) colCount.value = 1;
        else if (w < 900) colCount.value = 2;
        else colCount.value = 3;
      } catch {
        colCount.value = 3;
      }
    }

    const masonryItems = computed<Array<{ item: GalleryItem; originalIndex: number }>>(() => {
      const base = normalizedItems.value.slice(0, masonryLoadedCount.value);
      const cols = Math.max(1, colCount.value || 3);
      if (cols === 1) {
        return base.map((item, idx) => ({ item, originalIndex: idx }));
      }
      const reordered: Array<{ item: GalleryItem; originalIndex: number }> = [];
      for (let c = 0; c < cols; c++) {
        for (let i = c; i < base.length; i += cols) {
          reordered.push({ item: base[i], originalIndex: i });
        }
      }
      return reordered;
    });

    type GalleryItem = PhotoItem;

    // Helper for display title (falls back to id)
    const displayTitle = (item: GalleryItem) => item.title || item.id;

    const normalizedItems = computed(() =>
      props.items.map((p) => ({ ...p, alt: p.alt ?? p.title }))
    );

    async function openModal(index: number) {
      const item = normalizedItems.value[index];
      if (!item) return;

      modalRatio.value = 1;
      lastScrollY = window.scrollY;
      lastFocusEl.value = (document.activeElement as HTMLElement) || null;
      activeIndex.value = index;

      // Preload main image before opening modal to prevent empty flash
      const urls = [item.modalAfter, item.modalBefore].filter(Boolean) as string[];
      
      if (urls.length > 0) {
        try {
          const dims: Array<{ w: number; h: number }> = [];
          
          // Preload images with a timeout fallback
          await Promise.race([
            Promise.all(
              urls.map((src) => {
                return new Promise<void>((resolve) => {
                  const img = new Image();
                  (img as any).decoding = 'async';
                  img.onload = () => {
                    if (img.naturalWidth && img.naturalHeight) {
                      dims.push({ w: img.naturalWidth, h: img.naturalHeight });
                    }
                    resolve();
                  };
                  img.onerror = () => resolve();
                  img.src = src;
                });
              })
            ),
            // Timeout after 400ms - don't make user wait too long
            new Promise<void>((resolve) => setTimeout(resolve, 400))
          ]);

          if (dims.length > 0) {
            const small = dims.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
            modalRatio.value = small.w / small.h;
          }
        } catch {
          // Continue with default ratio
        }
      }

      // Open modal after preloading (or timeout)
      modalOpen.value = true;

      void nextTick(() => {
        const modalEl = document.querySelector('.pg-modal') as HTMLElement | null;
        const closeBtn = document.querySelector('.pg-modal__close') as HTMLButtonElement | null;
        if (closeBtn) closeBtn.focus();
        if (modalEl) {
          releaseFocusTrap = trapFocus(modalEl, 'button, [href], [tabindex]:not([tabindex="-1"])');
        }
      });
    }

    // Prefetch modal images on hover/focus for instant modal open
    const prefetchedIndices = new Set<number>();
    function prefetchModalImages(index: number) {
      if (prefetchedIndices.has(index)) return;
      prefetchedIndices.add(index);
      
      const item = normalizedItems.value[index];
      if (!item) return;
      
      const urls = [item.modalAfter, item.modalBefore].filter(Boolean) as string[];
      urls.forEach((src) => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'image';
        link.href = src;
        document.head.appendChild(link);
      });
    }

    function closeModal() {
      if (!modalOpen.value) return;

      if (releaseFocusTrap) {
        releaseFocusTrap();
        releaseFocusTrap = null;
      }

      modalOpen.value = false;
      modalRatio.value = 1;
      activeIndex.value = -1;

      // Restore scroll and focus to the element that opened the modal
      requestAnimationFrame(() => {
        window.scrollTo({ top: lastScrollY });
        if (lastFocusEl.value) {
          lastFocusEl.value.focus();
        }
      });
    }

    // Handle browser back button - only close modal if open
    function onPopState() {
      if (modalOpen.value) {
        closeModal();
      }
    }

    type ScrollLockState = { applied: boolean; overflow: string; paddingRight: string };
    const scrollLockState: ScrollLockState = { applied: false, overflow: '', paddingRight: '' };

    watch(modalOpen, (open) => {
      const body = document.body;
      if (!body) return;
      if (open) {
        if (!scrollLockState.applied) {
          scrollLockState.overflow = body.style.overflow || '';
          scrollLockState.paddingRight = body.style.paddingRight || '';
        }
        const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
        body.style.overflow = 'hidden';
        if (scrollbar > 0) {
          body.style.paddingRight = `${scrollbar}px`;
        } else {
          body.style.removeProperty('padding-right');
        }
        scrollLockState.applied = true;
        // Add class to body to help hide site header
        body.classList.add('pg-modal-open');
        
        // Push history state for back button support on mobile
        try {
          history.pushState({ pgModal: true }, '', window.location.href);
        } catch { /* ignore */ }
      } else if (scrollLockState.applied) {
        if (scrollLockState.overflow) body.style.overflow = scrollLockState.overflow;
        else body.style.removeProperty('overflow');
        if (scrollLockState.paddingRight) body.style.paddingRight = scrollLockState.paddingRight;
        else body.style.removeProperty('padding-right');
        scrollLockState.applied = false;
        // Remove class from body
        body.classList.remove('pg-modal-open');
      }
    });

    function nextPhoto() {
      if (activeIndex.value < 0) return;
      activeIndex.value = (activeIndex.value + 1) % normalizedItems.value.length;
      modalRatio.value = 1;
      openModal(activeIndex.value);
    }

    function prevPhoto() {
      if (activeIndex.value < 0) return;
      activeIndex.value = (activeIndex.value - 1 + normalizedItems.value.length) % normalizedItems.value.length;
      modalRatio.value = 1;
      openModal(activeIndex.value);
    }

    function onKeydown(e: KeyboardEvent) {
      if (!modalOpen.value) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextPhoto();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevPhoto();
      }
    }

    // Observers
    let revealObserver: IntersectionObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeRafId: number | null = null;
    let initialRevealDone = false;

    onMounted(() => {
      computeColCount();

      // Use ResizeObserver with debounced RAF for smooth resize handling
      resizeObserver = new ResizeObserver(() => {
        // Cancel pending RAF to debounce
        if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => {
          computeColCount();
          resizeRafId = null;
        });
      });
      resizeObserver.observe(document.documentElement);

      // Setup reveal observer with optimized options
      revealObserver = new IntersectionObserver(
        (entries) => {
          // Batch DOM updates
          const toReveal: Element[] = [];
          entries.forEach((e) => {
            if (e.isIntersecting) {
              toReveal.push(e.target);
              revealObserver?.unobserve(e.target);
            }
          });
          // Apply class changes in single batch
          if (toReveal.length > 0) {
            requestAnimationFrame(() => {
              const reduceMotion = isReducedMotion();
              toReveal.forEach((el) => {
                const htmlEl = el as HTMLElement;
                // Skip stagger animation if reduced motion or after initial load
                if (reduceMotion || initialRevealDone) {
                  htmlEl.classList.add('is-visible', 'is-instant');
                } else {
                  htmlEl.classList.add('is-visible');
                }
              });
              // Mark initial reveal as complete after first batch
              if (!initialRevealDone) {
                setTimeout(() => { initialRevealDone = true; }, 100);
              }
            });
          }
        },
        { rootMargin: '50px 0px', threshold: 0 }
      );

      // Observe already-mounted items
      nextTick(() => {
        if (root.value && revealObserver) {
          const items = root.value.querySelectorAll('.pg-masonry__item');
          items.forEach((item) => revealObserver!.observe(item));
        }
      });

      // ESC to close modal - passive where possible
      window.addEventListener('keydown', onKeydown, { passive: false });
      window.addEventListener('popstate', onPopState);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('popstate', onPopState);
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      if (resizeObserver) resizeObserver.disconnect();
      if (revealObserver) revealObserver.disconnect();
      resizeObserver = null;
      revealObserver = null;
    });

    // Masonry infinite loader
    function attachMasonryInfinite(container: HTMLElement, sentinel: HTMLElement) {
      let loading = false;
      let lastLoadTs = 0;
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Load next batch
              const now = Date.now();
              if (loading || now - lastLoadTs < 250) return;
              if (masonryLoadedCount.value < normalizedItems.value.length) {
                loading = true;
                masonryLoadedCount.value = Math.min(masonryLoadedCount.value + masonryBatchSize, normalizedItems.value.length);
                lastLoadTs = now;
                // Prefetch next 3 thumbnails
                const nextStart = masonryLoadedCount.value;
                const nextItems = normalizedItems.value.slice(nextStart, nextStart + 3);
                const schedulePrefetch = (cb: () => void) => {
                  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
                    window.requestIdleCallback(cb);
                  } else {
                    setTimeout(cb, 0);
                  }
                };
                schedulePrefetch(() => {
                  nextItems.forEach((n) => {
                    const src = n.src;
                    if (src) {
                      const im = new Image();
                      (im as any).decoding = 'async';
                      im.src = src;
                    }
                  });
                });
                setTimeout(() => (loading = false), 10);
              }
            }
          });
        },
        { root: null, rootMargin: '800px 0px', threshold: 0 }
      );
      io.observe(sentinel);
    }

    return () => {
      // Masonry
      const masonrySentinel = h('div', {
        class: 'pg-masonry__sentinel',
        onVnodeMounted: (v: any) => {
          const container = (v.el as HTMLElement).parentElement as HTMLElement | null;
          if (container) attachMasonryInfinite(container, v.el as HTMLElement);
        },
      });

      // Slight randomization to desynchronize columns: offset + pad
      function hashToRange(id: string, min: number, max: number): number {
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
        const r = (h % 1000) / 1000;
        return min + r * (max - min);
      }

      const masonry = h('section', { class: 'pg-masonry', role: 'list', 'aria-label': 'Masonry gallery' },
        masonryItems.value.map((it, idx) => {
          const ratio = (hashToRange(it.item.id + 'r', 0.85, 1.35)).toFixed(2); // aspect ratio variety
          return h('article', {
            key: it.item.id + '-' + idx,
            class: 'pg-masonry__item',
            role: 'listitem',
            'aria-label': displayTitle(it.item),
            style: `--m-ratio:${ratio};`,
            onVnodeMounted: (v: any) => {
              if (revealObserver && v.el) revealObserver.observe(v.el as HTMLElement);
            }
          }, [
            h('div', {
              class: 'pg-masonry__media',
              role: 'button',
              tabindex: 0,
              'aria-label': `Open ${displayTitle(it.item)} in fullscreen`,
              onVnodeMounted: (v: any) => {
                const el = v.el as HTMLElement;
                // mark as loading to show skeleton until image load
                el.classList.add('is-loading');
              },
              onMouseenter: () => prefetchModalImages(it.originalIndex),
              onFocus: () => prefetchModalImages(it.originalIndex),
              onKeydown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openModal(it.originalIndex);
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  const rootEl = root.value;
                  if (!rootEl) return;
                  const list = Array.from(rootEl.querySelectorAll('.pg-masonry__media')) as HTMLElement[];
                  const current = e.currentTarget as HTMLElement;
                  const i = list.indexOf(current);
                  if (i === -1) return;
                  if (e.key === 'ArrowRight' && i < list.length - 1) list[i + 1].focus();
                  if (e.key === 'ArrowLeft' && i > 0) list[i - 1].focus();
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    const r = current.getBoundingClientRect();
                    const targetY = r.top + (e.key === 'ArrowDown' ? r.height + 8 : -8);
                    let best = i;
                    let bestDist = Number.POSITIVE_INFINITY;
                    list.forEach((el, idx2) => {
                      if (idx2 === i) return;
                      const rr = el.getBoundingClientRect();
                      const dy = rr.top - targetY;
                      if ((e.key === 'ArrowDown' && dy >= 0) || (e.key === 'ArrowUp' && dy <= 0)) {
                        const dist = Math.abs(dy) + Math.abs(rr.left - r.left);
                        if (dist < bestDist) {
                          bestDist = dist;
                          best = idx2;
                        }
                      }
                    });
                    if (best !== i) list[best].focus();
                  }
                }
              },
              onMousedown: (ev: MouseEvent) => {
                const el = ev.currentTarget as HTMLElement;
                el.dataset.startX = String(ev.clientX);
                el.dataset.startY = String(ev.clientY);
                el.dataset.moved = '0';
              },
              onMousemove: (ev: MouseEvent) => {
                const el = ev.currentTarget as HTMLElement;
                if (!el.dataset.startX) return;
                const dx = Math.abs(ev.clientX - Number(el.dataset.startX));
                const dy = Math.abs(ev.clientY - Number(el.dataset.startY));
                if (dx + dy > 6) el.dataset.moved = '1';
              },
              onMouseup: (ev: MouseEvent) => {
                const el = ev.currentTarget as HTMLElement;
                const moved = el.dataset.moved === '1';
                el.dataset.startX = '';
                el.dataset.startY = '';
                el.dataset.moved = '';
                if (!moved) openModal(it.originalIndex);
              },
              onClick: (ev: MouseEvent) => {
                // Guard against some browsers firing click after mouseup drag
                const el = ev.currentTarget as HTMLElement;
                if (el.dataset.moved === '1') {
                  ev.preventDefault();
                  ev.stopPropagation();
                }
              },
            }, [
              h('div', { class: 'pg-skel' }),
              h('img', {
                class: 'pg-masonry__img',
                alt: it.item.alt || displayTitle(it.item),
                decoding: 'async',
                loading: idx < 6 ? 'eager' : 'lazy',
                fetchpriority: idx < 3 ? 'high' : undefined,
                src: it.item.src,
                srcset: it.item.srcset,
                sizes: '(max-width: 600px) 92vw, (max-width: 1024px) 46vw, 30vw',
                onLoad: (e: Event) => {
                  const img = e.target as HTMLImageElement;
                  const media = img.parentElement as HTMLElement | null;
                  if (img && media) {
                    media.classList.remove('is-loading');
                    if (img.naturalWidth && img.naturalHeight) {
                      const r = (img.naturalWidth / img.naturalHeight).toFixed(2);
                      media.style.setProperty('--m-ratio', r);
                    }
                  }
                },
              }),
              h('div', { class: 'pg-masonry__title' }, displayTitle(it.item)),
              h('button', {
                class: 'pg-masonry__fs',
                type: 'button',
                'aria-label': `Open ${displayTitle(it.item)} fullscreen`,
                onClick: (ev: MouseEvent) => {
                  ev.stopPropagation();
                  openModal(it.originalIndex);
                },
              }, '⤢'),
            ]),
          ]);
        }).concat([masonrySentinel])
      );

      // Modal
      const active = activeIndex.value >= 0 ? normalizedItems.value[activeIndex.value] : null;
      const modal = h(
        'div',
        { class: 'pg-modal', 'data-modal': '', hidden: !modalOpen.value, 'aria-hidden': String(!modalOpen.value), role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo fullscreen' },
        [
          h('div', { class: 'pg-modal__backdrop', 'data-close': '', onClick: closeModal }),
          // Close button for mobile
          h('button', {
            class: 'pg-modal__close',
            type: 'button',
            'aria-label': 'Close fullscreen',
            onClick: closeModal,
          }, '×'),
          h('div', { class: 'pg-modal__content', role: 'document' }, [

            h(
              'div',
              { class: 'pg-modal__view', 'data-view': '', style: `--m-ratio: ${modalRatio.value || 1}` },
              active
                ? [
                  active.modalBefore
                    ? h(BeforeAfterSlider, {
                      afterSrc: active.modalAfter,
                      beforeSrc: active.modalBefore,
                      alt: active.alt || displayTitle(active),
                      initialSplit: 0.75,
                    })
                    : h('img', {
                      class: 'pg-modal__img',
                      'data-single': '',
                      alt: active.alt || displayTitle(active),
                      src: active.modalAfter,
                    }),
                ]
                : []
            ),
          ]),
        ]
      );

      // Section Title
      const sectionTitle = h('header', { class: 'pg-section-title' }, [
        h('h2', { class: 'pg-section-title__text' }, 'Photography'),
        h('div', { class: 'pg-section-title__flourish', 'aria-hidden': 'true' }, [
          h('span', { class: 'pg-section-title__flourish-icon' }),
        ]),
        h('span', { class: 'pg-section-title__sub' }, `${visibleCount.value} selected works`),
      ]);

      return h('div', { ref: root }, [sectionTitle, masonry, modal]);
    };
  },
});


