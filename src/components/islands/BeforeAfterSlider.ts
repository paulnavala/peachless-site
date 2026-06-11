import { defineComponent, h, onMounted, onBeforeUnmount, ref } from 'vue';

export default defineComponent({
  name: 'BeforeAfterSlider',
  props: {
    afterSrc: { type: String, required: true },
    beforeSrc: { type: String, required: true },
    alt: { type: String, default: '' },
  },
  setup(props) {
    const root = ref<HTMLElement | null>(null);
    const handleEl = ref<HTMLElement | null>(null);
    const afterImg = ref<HTMLImageElement | null>(null);
    const beforeImg = ref<HTMLImageElement | null>(null);

    const width = ref(0);
    const height = ref(0);
    const posX = ref(0);
    const pageX = ref(0);
    const isDragging = ref(false);
    const allowNextFrame = ref(true);
    const imagesLoaded = ref(false);
    let cachedRect: DOMRect | null = null;

    function onResize() {
      const el = root.value;
      if (!el) return;

      width.value = el.clientWidth;
      height.value = el.clientHeight;
      cachedRect = el.getBoundingClientRect();
      setInitialPosX();
    }

    function setInitialPosX() {
      posX.value = width.value * 0.25; // Start at 25%
    }

    function onMouseDown(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      isDragging.value = true;
      // Attach window-level listeners for fast mouse movement
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
    }

    function onMouseUp(e: Event) {
      if (isDragging.value) {
        isDragging.value = false;
        // Remove window-level listeners
        window.removeEventListener('mousemove', onWindowMouseMove);
        window.removeEventListener('touchmove', onWindowTouchMove);
      }
    }

    function onWindowMouseMove(e: MouseEvent) {
      if (!isDragging.value) return;
      e.preventDefault();
      pageX.value = e.pageX;
      if (allowNextFrame.value) {
        allowNextFrame.value = false;
        requestAnimationFrame(updatePos);
      }
    }

    function onWindowTouchMove(e: TouchEvent) {
      if (!isDragging.value) return;
      e.preventDefault();
      pageX.value = e.touches[0]?.pageX || e.targetTouches[0]?.pageX || 0;
      if (allowNextFrame.value) {
        allowNextFrame.value = false;
        requestAnimationFrame(updatePos);
      }
    }

    function onMouseMove(e: MouseEvent | TouchEvent, forceUpdate = false) {
      const shouldUpdate = forceUpdate || isDragging.value;

      if (shouldUpdate && allowNextFrame.value) {
        allowNextFrame.value = false;

        if (window.TouchEvent && e instanceof TouchEvent) {
          pageX.value = e.touches[0]?.pageX || e.targetTouches[0]?.pageX || 0;
        } else {
          pageX.value = (e as MouseEvent).pageX;
        }

        requestAnimationFrame(updatePos);
      }
    }

    function updatePos() {
      const el = root.value;
      if (!el) return;

      // Always get fresh rect for accurate positioning
      const rect = el.getBoundingClientRect();
      cachedRect = rect;
      
      // Update width if needed
      if (el.clientWidth > 0) {
        width.value = el.clientWidth;
      }
      
      if (width.value <= 0) return;

      let newPosX = pageX.value - rect.left;

      // Clamp to bounds first
      newPosX = Math.max(0, Math.min(width.value, newPosX));

      // Edge snapping - snap when slider passes the label position (~40px from edge)
      const snapThreshold = Math.max(width.value * 0.05, 40);
      if (newPosX <= snapThreshold) {
        newPosX = 0;
      } else if (newPosX >= width.value - snapThreshold) {
        newPosX = width.value;
      }

      posX.value = newPosX;
      allowNextFrame.value = true;
    }

    function setupImageLoading() {
      let afterLoaded = false;
      let beforeLoaded = false;

      const checkBothLoaded = () => {
        if (afterLoaded && beforeLoaded) {
          imagesLoaded.value = true;
          // Fade in images
          if (afterImg.value) {
            afterImg.value.style.opacity = '1';
            afterImg.value.style.transition = 'opacity 0.3s ease';
          }
          if (beforeImg.value) {
            beforeImg.value.style.opacity = '1';
            beforeImg.value.style.transition = 'opacity 0.3s ease';
          }
          // ResizeObserver will handle layout updates automatically
          onResize();
        }
      };

      if (afterImg.value) {
        afterImg.value.style.opacity = '0';
        afterImg.value.style.display = 'block';
        if (afterImg.value.complete && afterImg.value.naturalWidth > 0) {
          afterLoaded = true;
          checkBothLoaded();
        } else {
          afterImg.value.addEventListener('load', () => {
            afterLoaded = true;
            checkBothLoaded();
          }, { once: true });
          afterImg.value.addEventListener('error', () => {
            console.error('After image failed to load');
            afterLoaded = true; // Continue anyway
            checkBothLoaded();
          }, { once: true });
        }
      }

      if (beforeImg.value) {
        beforeImg.value.style.opacity = '0';
        beforeImg.value.style.display = 'block';
        if (beforeImg.value.complete && beforeImg.value.naturalWidth > 0) {
          beforeLoaded = true;
          checkBothLoaded();
        } else {
          beforeImg.value.addEventListener('load', () => {
            beforeLoaded = true;
            checkBothLoaded();
          }, { once: true });
          beforeImg.value.addEventListener('error', () => {
            console.error('Before image failed to load');
            beforeLoaded = true; // Continue anyway
            checkBothLoaded();
          }, { once: true });
        }
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const step = width.value * (e.shiftKey ? 0.01 : 0.05);
      let newPosX = posX.value;

      if (e.key === 'ArrowLeft') {
        newPosX = Math.max(0, posX.value - step);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        newPosX = Math.min(width.value, posX.value + step);
        e.preventDefault();
      } else if (e.key === 'Home') {
        newPosX = 0;
        e.preventDefault();
      } else if (e.key === 'End') {
        newPosX = width.value;
        e.preventDefault();
      } else {
        return;
      }

      posX.value = newPosX;
    }

    let resizeObserver: ResizeObserver | null = null;

    onMounted(() => {
      const el = root.value;
      if (el) {
        el.addEventListener('keydown', onKeyDown);

        // Use ResizeObserver instead of setTimeout polling
        resizeObserver = new ResizeObserver(() => {
          onResize();
        });
        resizeObserver.observe(el);
      }
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchend', onMouseUp);

      setTimeout(() => {
        setupImageLoading();
        onResize();
      }, 50);
    });

    onBeforeUnmount(() => {
      const el = root.value;
      if (el) {
        el.removeEventListener('keydown', onKeyDown);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchend', onMouseUp);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('touchmove', onWindowTouchMove);
      cachedRect = null;
    });

    return () => {
      const wrapperStyle = {
        width: `${posX.value}px`,
      };

      const handleStyle = {
        left: `${posX.value}px`,
      };

      const imgStyle = {
        width: `${width.value}px`,
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      };

      // Label visibility logic:
      // - While sliding in middle: both labels visible
      // - At left edge (full AFTER): BEFORE hides immediately (even while dragging), AFTER hides with delay after release
      // - At right edge (full BEFORE): AFTER hides immediately (even while dragging), BEFORE hides with delay after release
      const atLeftEdge = posX.value === 0;
      const atRightEdge = width.value > 0 && posX.value >= width.value;

      // Determine label visibility
      let beforeLabelClass = '';
      let afterLabelClass = '';
      
      if (atLeftEdge) {
        // Full AFTER image showing: BEFORE hidden immediately (image gone)
        beforeLabelClass = 'is-hidden-immediate';
        // AFTER label only hides with delay after mouse release
        if (!isDragging.value) {
          afterLabelClass = 'is-hidden-delayed';
        }
      } else if (atRightEdge) {
        // Full BEFORE image showing: AFTER hidden immediately (image gone)
        afterLabelClass = 'is-hidden-immediate';
        // BEFORE label only hides with delay after mouse release
        if (!isDragging.value) {
          beforeLabelClass = 'is-hidden-delayed';
        }
      }

      return h(
        'figure',
        {
          ref: root,
          class: ['image-compare', { 'is-dragging': isDragging.value }],
          tabindex: 0,
          role: 'slider',
          'aria-label': 'Compare before and after images',
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': String(width.value > 0 ? Math.round((posX.value / width.value) * 100) : 25),
          onMousemove: (e: MouseEvent) => onMouseMove(e),
          onTouchstart: (e: TouchEvent) => { onMouseMove(e, true); },
          onTouchmove: (e: TouchEvent) => {
            if (isDragging.value) e.preventDefault();
            onMouseMove(e, true);
          },
          onClick: (e: MouseEvent) => onMouseMove(e, true),
        },
        [
          // Before label (left side)
          h('div', { 
            class: ['image-compare-label', 'before', beforeLabelClass].filter(Boolean),
          }, 'BEFORE'),
          // After label (right side)
          h('div', { 
            class: ['image-compare-label', 'after', afterLabelClass].filter(Boolean),
          }, 'AFTER'),
          h(
            'div',
            {
              class: 'image-compare-wrapper',
              style: wrapperStyle,
            },
            [
              h('img', {
                ref: beforeImg,
                src: props.beforeSrc,
                alt: props.alt,
                style: imgStyle,
                draggable: false,
              }),
            ]
          ),
          h('img', {
            ref: afterImg,
            src: props.afterSrc,
            alt: props.alt,
            style: imgStyle,
            draggable: false,
          }),
          h(
            'div',
            {
              ref: handleEl,
              class: 'image-compare-handle',
              style: handleStyle,
              onMousedown: onMouseDown,
              onTouchstart: onMouseDown,
            },
            [
              h('span', { class: 'image-compare-handle-icon left' }, '‹'),
              h('span', { class: 'image-compare-handle-icon right' }, '›'),
            ]
          ),
        ]
      );
    };
  },
});
