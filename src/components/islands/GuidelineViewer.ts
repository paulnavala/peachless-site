import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, useId, type PropType } from 'vue';
import { lockScroll, trapFocus } from '../../lib/dom';

export interface GuidePage {
  title: string;
  src: string;
  width: number;
  height: number;
}

const ICONS = {
  close: 'M6 6l12 12M18 6 6 18',
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
} as const;

const icon = (name: keyof typeof ICONS) =>
  h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: 20,
      height: 20,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    [h('path', { d: ICONS[name] })]
  );

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const STEP = 0.5;
const SWIPE = 50;

/**
 * Brand-book page thumbnails plus a fullscreen <dialog> viewer: keyboard
 * (←/→, +/−, 0, M, Esc), page menu, zoom, and Pointer-Events pinch / pan /
 * swipe so phones can zoom too. Thumbnails are real links to the page images,
 * so everything still works before hydration or without JavaScript.
 */
export default defineComponent({
  name: 'GuidelineViewer',
  props: {
    pages: { type: Array as PropType<GuidePage[]>, required: true },
    label: { type: String, default: 'Brand book' },
  },
  setup(props) {
    const menuId = useId();
    const dialogRef = ref<HTMLDialogElement | null>(null);
    const isOpen = ref(false);
    // Rendered from the first open on, so the viewer fades out with its page
    // still in it instead of emptying first.
    const shown = ref(false);
    const index = ref(0);
    // Which way the reader is paging (-1, 0, 1): the new page slides in from
    // that side.
    const dir = ref(0);
    // Panning or pinching: the image then follows the fingers 1:1, with no easing.
    const dragging = ref(false);
    const zoom = ref(1);
    const panX = ref(0);
    const panY = ref(0);
    const menuOpen = ref(false);

    let releaseTrap: (() => void) | null = null;
    let unlockScroll: (() => void) | null = null;
    let opener: HTMLElement | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number } | null = null;
    let swipe: { id: number; x: number; y: number } | null = null;

    const page = computed(() => props.pages[index.value]);

    const resetZoom = () => {
      zoom.value = 1;
      panX.value = 0;
      panY.value = 0;
    };
    const setZoom = (z: number) => {
      zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
      if (zoom.value === 1) panX.value = panY.value = 0;
    };
    const preload = (i: number) => {
      for (const j of [i - 1, i + 1]) {
        const p = props.pages[j];
        if (p) new Image().src = p.src;
      }
    };
    const go = (i: number) => {
      if (i < 0 || i >= props.pages.length) return;
      dir.value = Math.sign(i - index.value);
      index.value = i;
      resetZoom();
      menuOpen.value = false;
      preload(i);
    };

    const open = (i: number, e?: Event) => {
      const dialog = dialogRef.value;
      if (!dialog) return; // not hydrated yet: the link opens the page image instead
      e?.preventDefault();
      // Focus goes back to the thumbnail that opened the viewer. Not simply
      // activeElement: Safari doesn't focus links on click.
      const trigger = e?.currentTarget ?? document.activeElement;
      opener = trigger instanceof HTMLElement ? trigger : null;
      go(i);
      dir.value = 0;
      isOpen.value = true;
      shown.value = true;
      dialog.showModal();
      unlockScroll = lockScroll('dark');
      void nextTick(() => {
        releaseTrap = trapFocus(dialog, 'button, [href]');
        dialog.querySelector<HTMLElement>('.gv-close')?.focus();
      });
    };
    const close = () => {
      if (dialogRef.value?.open) dialogRef.value.close();
    };
    const onClose = () => {
      isOpen.value = false;
      menuOpen.value = false;
      resetZoom();
      releaseTrap?.();
      unlockScroll?.();
      releaseTrap = unlockScroll = null;
      opener?.focus({ preventScroll: true });
      opener = null;
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (!isOpen.value || e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowRight':
          go(index.value + 1);
          break;
        case 'ArrowLeft':
          go(index.value - 1);
          break;
        case '+':
        case '=':
          setZoom(zoom.value + STEP);
          break;
        case '-':
          setZoom(zoom.value - STEP);
          break;
        case '0':
          resetZoom();
          break;
        case 'm':
        case 'M':
          menuOpen.value = !menuOpen.value;
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: zoom.value };
        swipe = null;
      } else if (pointers.size === 1) {
        swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        dragging.value = true;
        setZoom(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist));
      } else if (pointers.size === 1 && zoom.value > 1) {
        // Drag pans 1:1 with the pointer (translate is applied before scale).
        dragging.value = true;
        panX.value += e.clientX - prev.x;
        panY.value += e.clientY - prev.y;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) dragging.value = false;
      if (swipe?.id === e.pointerId && zoom.value === 1 && e.pointerType !== 'mouse') {
        const dx = e.clientX - swipe.x;
        const dy = e.clientY - swipe.y;
        if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) go(index.value + (dx < 0 ? 1 : -1));
      }
      swipe = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // trackpad pinch arrives as ctrl+wheel
      e.preventDefault();
      setZoom(zoom.value * (e.deltaY < 0 ? 1.1 : 0.9));
    };

    onMounted(() => document.addEventListener('keydown', onKeydown));
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', onKeydown);
      releaseTrap?.();
      unlockScroll?.();
    });

    const pageNumber = (i: number) => String(i + 1).padStart(2, '0');

    return () => {
      const total = props.pages.length;
      const current = page.value;
      return h('div', { class: 'gv' }, [
        h(
          'ol',
          // The list names the set, so each link's name is just what it shows ("01 Cover").
          { class: 'gv-thumbs', role: 'list', 'aria-label': `${props.label} pages` },
          props.pages.map((p, i) =>
            h(
              'li',
              { key: p.src },
              h(
                'a',
                {
                  class: 'gv-thumb',
                  href: p.src,
                  onClick: (e: MouseEvent) => open(i, e),
                },
                [
                  h('span', { class: 'gv-thumb__frame', 'data-cursor': 'Open' }, [
                    h('img', { src: p.src, alt: '', width: p.width, height: p.height, loading: 'lazy', decoding: 'async' }),
                  ]),
                  h('span', { class: 'gv-thumb__label' }, [h('span', { class: 'gv-thumb__num' }, pageNumber(i)), p.title]),
                ]
              )
            )
          )
        ),
        h(
          'dialog',
          {
            ref: dialogRef,
            class: 'gv-dialog',
            'aria-label': props.label,
            onClose,
            onClick: (e: MouseEvent) => {
              if (e.target === dialogRef.value) close();
            },
          },
          shown.value && current
            ? [
                h('div', { class: 'gv-bar' }, [
                  h('p', { class: 'gv-status', role: 'status' }, [
                    h('span', { class: 'gv-count' }, `${index.value + 1} / ${total}`),
                    h('span', { class: 'gv-title' }, current.title),
                  ]),
                  h('button', { class: 'gv-btn gv-close', type: 'button', 'aria-label': 'Close viewer', onClick: close }, icon('close')),
                ]),
                h(
                  'div',
                  {
                    class: ['gv-stage', { 'is-zoomed': zoom.value > 1, 'is-dragging': dragging.value }],
                    style: { '--dir': dir.value },
                    onPointerdown: onPointerDown,
                    onPointermove: onPointerMove,
                    onPointerup: onPointerUp,
                    onPointercancel: onPointerUp,
                    onDblclick: () => (zoom.value > 1 ? resetZoom() : setZoom(2)),
                    onWheel,
                  },
                  h('img', {
                    key: current.src,
                    class: 'gv-image',
                    src: current.src,
                    alt: `${props.label}, page ${index.value + 1}: ${current.title}`,
                    width: current.width,
                    height: current.height,
                    draggable: false,
                    style: { transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})` },
                  })
                ),
                h('div', { class: 'gv-dock' }, [
                  h(
                    'button',
                    { class: 'gv-btn', type: 'button', 'aria-label': 'Previous page', disabled: index.value === 0, onClick: () => go(index.value - 1) },
                    icon('prev')
                  ),
                  h('div', { class: 'gv-menu' }, [
                    h(
                      'button',
                      {
                        class: 'gv-btn gv-menu__toggle',
                        type: 'button',
                        'aria-expanded': String(menuOpen.value),
                        'aria-controls': menuId,
                        onClick: () => (menuOpen.value = !menuOpen.value),
                      },
                      [icon('list'), h('span', 'Pages')]
                    ),
                    h(
                      'ol',
                      { id: menuId, class: 'gv-menu__list', role: 'list', hidden: !menuOpen.value },
                      props.pages.map((p, i) =>
                        h(
                          'li',
                          { key: p.src },
                          h(
                            'button',
                            {
                              class: 'gv-menu__item',
                              type: 'button',
                              'aria-current': i === index.value ? 'page' : undefined,
                              onClick: () => go(i),
                            },
                            [h('span', { class: 'gv-menu__num' }, pageNumber(i)), p.title]
                          )
                        )
                      )
                    ),
                  ]),
                  h('div', { class: 'gv-zoom' }, [
                    h(
                      'button',
                      { class: 'gv-btn', type: 'button', 'aria-label': 'Zoom out', disabled: zoom.value <= MIN_ZOOM, onClick: () => setZoom(zoom.value - STEP) },
                      icon('minus')
                    ),
                    h(
                      'button',
                      { class: 'gv-btn', type: 'button', 'aria-label': 'Reset zoom', disabled: zoom.value === 1, onClick: resetZoom },
                      icon('reset')
                    ),
                    h(
                      'button',
                      { class: 'gv-btn', type: 'button', 'aria-label': 'Zoom in', disabled: zoom.value >= MAX_ZOOM, onClick: () => setZoom(zoom.value + STEP) },
                      icon('plus')
                    ),
                  ]),
                  h(
                    'button',
                    { class: 'gv-btn', type: 'button', 'aria-label': 'Next page', disabled: index.value === total - 1, onClick: () => go(index.value + 1) },
                    icon('next')
                  ),
                ]),
              ]
            : []
        ),
      ]);
    };
  },
});
