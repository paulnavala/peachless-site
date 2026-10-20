import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, type PropType } from 'vue';
import BeforeAfterSlider from './BeforeAfterSlider';
import { lockScroll, trapFocus } from '../../lib/dom';
import { dealColumns } from '../../lib/masonry';
import '../../styles/components/photo-gallery.css';

export interface PhotoItem {
  id: string;
  title: string;
  alt: string;
  caption?: string;
  location?: string;
  src: string; // grid image
  srcset: string; // WebP
  avifSrcset?: string;
  width: number; // grid image's intrinsic size, so tiles never reflow
  height: number;
  modalAfter: string; // large image for the lightbox
  modalBefore?: string;
}

// A caption line plus the gap below a photo, as a fraction of the column width.
const CAPTION_ALLOWANCE = 0.18;
// Matches the grid columns in photo-gallery.css.
const GRID_SIZES = '(min-width: 64em) 24rem, (min-width: 36em) 45vw, 92vw';

const icon = (d: string) =>
  h(
    'svg',
    { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    [h('path', { d })]
  );

/**
 * Masonry photo grid with a lightbox; edited photos open as a before/after
 * comparison. Columns come from CSS; the grid is reordered so reading order
 * runs across rows. The lightbox keeps Back-button support (it pushes a
 * history entry), restores focus and scroll, and guards against the races of
 * rapid arrow presses while large images are still loading.
 */
export default defineComponent({
  name: 'PhotographyGallery',
  props: {
    items: { type: Array as PropType<PhotoItem[]>, default: () => [] },
  },
  setup(props) {
    const listRef = ref<HTMLElement | null>(null);
    const modalOpen = ref(false);
    const activeIndex = ref(-1);
    const modalRatio = ref(1);
    const colCount = ref(1);
    let lastFocusEl: HTMLElement | null = null;
    let lastScrollY = 0;
    let releaseFocusTrap: (() => void) | null = null;
    let unlockScroll: (() => void) | null = null;
    // History bookkeeping: opening pushes a {pgModal:true} entry; closing with
    // Escape/× consumes it with history.back(), unless the close itself came
    // from a Back press (the browser already consumed it).
    let historyStatePushed = false;
    let closingFromPopstate = false;
    // Bumped by every open and close: an openModal whose preload is overtaken
    // (rapid arrows, another tile, a close) drops its stale result.
    let openSeq = 0;
    // Photo an in-flight openModal is preloading; arrows step on from here.
    let pendingIndex: number | null = null;
    let swipeStart: { x: number; y: number; id: number } | null = null;

    const items = computed(() => props.items);
    const count = computed(() => items.value.length);

    // Left alone, CSS columns balance by height and reshuffle the order. Deal
    // the photos into columns here instead (their heights are known from the
    // aspect ratios) and force a break before each column's first photo, so
    // the first row reads in order and the columns end level.
    const ordered = computed(() => {
      const heights = items.value.map((item) => item.height / item.width + CAPTION_ALLOWANCE);
      return dealColumns(heights, colCount.value).flatMap((column, c) =>
        column.map((index, i) => ({ item: items.value[index], index, columnStart: c > 0 && i === 0 }))
      );
    });

    const readColumns = () => {
      const el = listRef.value;
      if (!el) return;
      const n = parseInt(getComputedStyle(el).columnCount, 10);
      colCount.value = Number.isFinite(n) && n > 0 ? n : 1;
    };

    async function openModal(index: number) {
      const item = items.value[index];
      if (!item) return;
      const seq = ++openSeq;
      pendingIndex = index;
      if (!modalOpen.value) {
        lastScrollY = window.scrollY;
        lastFocusEl = document.activeElement as HTMLElement | null;
      }

      // Preload before swapping, so the photo and its box change together.
      const urls = [item.modalAfter, item.modalBefore].filter(Boolean) as string[];
      const dims: { w: number; h: number }[] = [];
      const ratio = () => {
        if (!dims.length) return null;
        const small = dims.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
        return small.w / small.h;
      };
      const loaded = Promise.all(
        urls.map(
          (src) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.decoding = 'async';
              img.onload = () => {
                if (img.naturalWidth && img.naturalHeight) dims.push({ w: img.naturalWidth, h: img.naturalHeight });
                resolve();
              };
              img.onerror = () => resolve();
              img.src = src;
            })
        )
      );
      await Promise.race([loaded, new Promise<void>((resolve) => setTimeout(resolve, 400))]);
      if (seq !== openSeq) return;
      pendingIndex = null;
      activeIndex.value = index;
      // Until the real size is known, use the grid image's ratio — never a
      // square placeholder box.
      modalRatio.value = ratio() ?? item.width / item.height;
      if (!dims.length) {
        void loaded.then(() => {
          const r = ratio();
          if (r && seq === openSeq) modalRatio.value = r;
        });
      }

      if (!modalOpen.value) {
        modalOpen.value = true;
        unlockScroll = lockScroll();
        document.body.classList.add('pg-modal-open');
        try {
          history.pushState({ pgModal: true }, '', window.location.href);
          historyStatePushed = true;
        } catch {
          /* ignore */
        }
      }

      void nextTick(() => {
        releaseFocusTrap?.();
        const modalEl = document.querySelector<HTMLElement>('.pg-modal');
        if (!modalEl) return;
        if (!modalEl.contains(document.activeElement)) modalEl.querySelector<HTMLElement>('.pg-modal__close')?.focus();
        releaseFocusTrap = trapFocus(modalEl, 'button, [href], [tabindex]:not([tabindex="-1"])');
      });
    }

    const prefetched = new Set<number>();
    function prefetch(index: number) {
      if (prefetched.has(index)) return;
      prefetched.add(index);
      const item = items.value[index];
      for (const src of [item?.modalAfter, item?.modalBefore]) {
        if (!src) continue;
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'image';
        link.href = src;
        document.head.appendChild(link);
      }
    }

    function closeModal() {
      openSeq++;
      pendingIndex = null;
      if (!modalOpen.value) return;
      releaseFocusTrap?.();
      releaseFocusTrap = null;
      modalOpen.value = false;
      activeIndex.value = -1;
      unlockScroll?.();
      unlockScroll = null;
      document.body.classList.remove('pg-modal-open');
      if (historyStatePushed && !closingFromPopstate) {
        historyStatePushed = false;
        try {
          if ((history.state as { pgModal?: boolean } | null)?.pgModal) history.back();
        } catch {
          /* ignore */
        }
      } else {
        historyStatePushed = false;
      }
      requestAnimationFrame(() => {
        window.scrollTo({ top: lastScrollY });
        lastFocusEl?.focus({ preventScroll: true });
      });
    }

    const onPopState = () => {
      if (!modalOpen.value) return;
      closingFromPopstate = true;
      closeModal();
      closingFromPopstate = false;
    };

    const step = (delta: number) => {
      const from = pendingIndex ?? activeIndex.value;
      if (from < 0) return;
      void openModal((from + delta + count.value) % count.value);
    };

    function onKeydown(e: KeyboardEvent) {
      if (!modalOpen.value) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
        return;
      }
      // The before/after slider owns the arrow keys while it has focus.
      if ((e.target as HTMLElement)?.closest?.('.image-compare')) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    }

    // Swipe between photos on touch screens (not on the comparison slider).
    const onStagePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('.image-compare')) return;
      swipeStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onStagePointerUp = (e: PointerEvent) => {
      if (!swipeStart || swipeStart.id !== e.pointerId) return;
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    };

    let resizeObserver: ResizeObserver | null = null;
    onMounted(() => {
      readColumns();
      resizeObserver = new ResizeObserver(() => requestAnimationFrame(readColumns));
      if (listRef.value) resizeObserver.observe(listRef.value);
      window.addEventListener('keydown', onKeydown);
      window.addEventListener('popstate', onPopState);
    });
    onBeforeUnmount(() => {
      openSeq++;
      resizeObserver?.disconnect();
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('popstate', onPopState);
      releaseFocusTrap?.();
      unlockScroll?.();
    });

    // Arrow keys on the grid move between tiles in gallery order.
    function onTileKeydown(e: KeyboardEvent, index: number) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const list = Array.from(listRef.value?.querySelectorAll<HTMLElement>('.pg-masonry__media') ?? []);
      const current = e.currentTarget as HTMLElement;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const target = index + (e.key === 'ArrowRight' ? 1 : -1);
        const j = ordered.value.findIndex((o) => o.index === target);
        if (j !== -1) {
          e.preventDefault();
          list[j]?.focus();
        }
        return;
      }
      const r = current.getBoundingClientRect();
      const down = e.key === 'ArrowDown';
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const el of list) {
        if (el === current) continue;
        const rr = el.getBoundingClientRect();
        const dy = down ? rr.top - r.bottom : r.top - rr.bottom;
        if (dy < -4) continue;
        const dist = dy + Math.abs(rr.left - r.left) * 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = el;
        }
      }
      if (best) {
        e.preventDefault();
        best.focus();
      }
    }

    return () => {
      const grid = h(
        'ul',
        { ref: listRef, class: 'pg-masonry', role: 'list' },
        ordered.value.map(({ item, index, columnStart }) =>
          h('li', { key: item.id, class: ['pg-masonry__item', columnStart && 'pg-masonry__item--column-start'] }, [
            h('figure', { class: 'pg-masonry__figure' }, [
              h(
                'button',
                {
                  type: 'button',
                  class: 'pg-masonry__media',
                  'aria-haspopup': 'dialog',
                  onMouseenter: () => prefetch(index),
                  onFocus: () => prefetch(index),
                  onKeydown: (e: KeyboardEvent) => onTileKeydown(e, index),
                  // click (not mouseup): only the primary button opens the lightbox
                  onClick: () => openModal(index),
                },
                [
                  h('picture', [
                    item.avifSrcset && h('source', { type: 'image/avif', srcset: item.avifSrcset, sizes: GRID_SIZES }),
                    h('img', {
                      class: 'pg-masonry__img',
                      src: item.src,
                      srcset: item.srcset,
                      sizes: GRID_SIZES,
                      width: item.width,
                      height: item.height,
                      alt: item.alt,
                      decoding: 'async',
                      // The first photo is the page's largest paint; the rest
                      // load as they near the viewport.
                      loading: index === 0 ? 'eager' : 'lazy',
                      fetchpriority: index === 0 ? 'high' : undefined,
                    }),
                  ]),
                  item.modalBefore && h('span', { class: 'pg-masonry__tag' }, 'Before / After'),
                  h('span', { class: 'sr-only' }, ' — open full screen'),
                ]
              ),
              h('figcaption', { class: 'pg-masonry__caption' }, [
                h('span', { class: 'pg-masonry__title' }, item.title),
                item.location && h('span', { class: 'pg-masonry__location' }, item.location),
              ]),
            ]),
          ])
        )
      );

      const active = activeIndex.value >= 0 ? items.value[activeIndex.value] : null;
      const modal = h(
        'div',
        {
          class: 'pg-modal',
          hidden: !modalOpen.value,
          'aria-hidden': String(!modalOpen.value),
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'pg-modal-title',
        },
        [
          h('div', { class: 'pg-modal__backdrop', onClick: closeModal }),
          h('div', { class: 'pg-modal__bar' }, [
            h('p', { class: 'pg-modal__meta', role: 'status' }, [
              h('span', { class: 'pg-modal__count' }, active ? `${activeIndex.value + 1} / ${count.value}` : ''),
              h('span', { id: 'pg-modal-title', class: 'pg-modal__title' }, active?.title ?? 'Photo'),
              active?.location && h('span', { class: 'pg-modal__location' }, active.location),
            ]),
            h('button', { class: 'pg-modal__close', type: 'button', 'aria-label': 'Close', onClick: closeModal }, icon('M6 6l12 12M18 6 6 18')),
          ]),
          h('div', { class: 'pg-modal__stage', onPointerdown: onStagePointerDown, onPointerup: onStagePointerUp }, [
            h('button', { class: 'pg-modal__nav pg-modal__nav--prev', type: 'button', 'aria-label': 'Previous photo', onClick: () => step(-1) }, icon('M15 18l-6-6 6-6')),
            h(
              'div',
              { class: 'pg-modal__view', style: `--m-ratio: ${modalRatio.value}` },
              active
                ? [
                    active.modalBefore
                      ? h(BeforeAfterSlider, { key: active.id, afterSrc: active.modalAfter, beforeSrc: active.modalBefore, alt: active.alt })
                      : h('img', { class: 'pg-modal__img', alt: active.alt, src: active.modalAfter }),
                  ]
                : []
            ),
            h('button', { class: 'pg-modal__nav pg-modal__nav--next', type: 'button', 'aria-label': 'Next photo', onClick: () => step(1) }, icon('M9 18l6-6-6-6')),
          ]),
          active?.caption && h('p', { class: 'pg-modal__caption' }, active.caption),
        ]
      );

      return h('div', { class: 'pg' }, [grid, modal]);
    };
  },
});
