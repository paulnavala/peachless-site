import { defineComponent, h, ref } from 'vue';
import '../../styles/components/before-after.css';

const SNAP = 0.03; // within 3% of an edge, snap to it so both full views are reachable

/**
 * Before/after comparison. One `--pos` custom property (0–100%) drives the
 * clip of the "before" image and the handle, so dragging never re-lays out the
 * images. Pointer Events cover mouse, touch and pen; `touch-action: pan-y`
 * keeps vertical page scrolling on touch screens. Keyboard: ←/→ (Shift for
 * fine steps), Page Up/Down, Home/End.
 */
export default defineComponent({
  name: 'BeforeAfterSlider',
  props: {
    afterSrc: { type: String, required: true },
    beforeSrc: { type: String, required: true },
    alt: { type: String, default: '' },
    beforeLabel: { type: String, default: 'Before' },
    afterLabel: { type: String, default: 'After' },
  },
  setup(props) {
    const root = ref<HTMLElement | null>(null);
    // Share of the frame showing the BEFORE image, 0–1.
    const pos = ref(0.5);
    const dragging = ref(false);

    const setFromClientX = (clientX: number) => {
      const el = root.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      let next = (clientX - rect.left) / rect.width;
      next = Math.min(1, Math.max(0, next));
      if (next < SNAP) next = 0;
      else if (next > 1 - SNAP) next = 1;
      pos.value = next;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging.value = true;
      setFromClientX(e.clientX);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragging.value) setFromClientX(e.clientX);
    };
    const onPointerEnd = () => {
      dragging.value = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.01 : 0.05;
      const keys: Record<string, number> = {
        ArrowLeft: pos.value - step,
        ArrowDown: pos.value - step,
        ArrowRight: pos.value + step,
        ArrowUp: pos.value + step,
        PageDown: pos.value - 0.1,
        PageUp: pos.value + 0.1,
        Home: 0,
        End: 1,
      };
      if (!(e.key in keys)) return;
      e.preventDefault();
      pos.value = Math.min(1, Math.max(0, keys[e.key]));
    };

    return () => {
      const pct = Math.round(pos.value * 100);
      return h(
        'figure',
        {
          ref: root,
          class: ['image-compare', { 'is-dragging': dragging.value, 'is-start': pct === 0, 'is-end': pct === 100 }],
          style: { '--pos': `${pos.value * 100}%` },
          tabindex: 0,
          role: 'slider',
          'aria-label': props.alt ? `Compare before and after: ${props.alt}` : 'Compare before and after',
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': String(pct),
          'aria-valuetext': `${pct}% of the original showing`,
          onPointerdown: onPointerDown,
          onPointermove: onPointerMove,
          onPointerup: onPointerEnd,
          onPointercancel: onPointerEnd,
          onLostpointercapture: onPointerEnd,
          onKeydown: onKeyDown,
        },
        [
          h('img', { class: 'image-compare__img', src: props.afterSrc, alt: '', draggable: false, decoding: 'async' }),
          h('img', {
            class: 'image-compare__img image-compare__before',
            src: props.beforeSrc,
            alt: '',
            draggable: false,
            decoding: 'async',
          }),
          h('span', { class: 'image-compare__label image-compare__label--before', 'aria-hidden': 'true' }, props.beforeLabel),
          h('span', { class: 'image-compare__label image-compare__label--after', 'aria-hidden': 'true' }, props.afterLabel),
          h('span', { class: 'image-compare__handle', 'aria-hidden': 'true' }, [h('span', { class: 'image-compare__knob' })]),
        ]
      );
    };
  },
});
