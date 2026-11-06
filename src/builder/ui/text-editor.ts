/**
 * Editing words where they sit. The frame can't take key events in Safari, so
 * this is a textarea over the real text, set in the same type and at the same
 * scale. The page behind it updates as you type, so it reflows live, and the box
 * follows it.
 */
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SECTIONS } from '../../lib/section-catalogue';
import { fieldElement, frameDocument, view } from '../canvas/controller';
import { endGesture, getPath, sections, setElementField, setField, state } from '../store';

export const TextEditor = defineComponent({
  name: 'TextEditor',
  setup() {
    const box = ref<HTMLTextAreaElement | null>(null);
    let target: HTMLElement | null = null;
    let original = '';

    const editing = computed(() => state.editing);
    const section = computed(() => sections.value.find((s) => s.id === editing.value?.section));
    const element = computed(() => section.value?.elements?.find((e) => e.id === editing.value?.element));
    const value = computed(() => {
      const key = editing.value?.key ?? '';
      return String(getPath(element.value ?? section.value, key) ?? '');
    });

    /** A single line finishes on Enter; longer text takes new lines. */
    const multiline = computed(() => {
      const field = section.value && SECTIONS[section.value.type].fields.find((f) => f.key === editing.value?.key);
      return field?.kind === 'area' || ['quote', 'body'].includes(editing.value?.key ?? '');
    });

    const write = (text: string) => {
      const current = editing.value;
      if (!current) return;
      if (current.element) setElementField(current.section, current.element, current.key, text);
      else setField(current.section, current.key, text);
    };

    const fit = () => {
      if (!box.value) return;
      box.value.style.height = 'auto';
      box.value.style.height = `${box.value.scrollHeight}px`;
    };

    const placement = computed(() => {
      void view.sections;
      void state.revision;
      if (!editing.value) return null;
      const el = fieldElement(editing.value.section, editing.value.element, editing.value.key);
      const css = el && frameDocument()?.defaultView?.getComputedStyle(el);
      if (!el || !css) return null;
      const rect = el.getBoundingClientRect();
      const s = view.scale;
      const scaled = (v: string) => (parseFloat(v) ? `${parseFloat(v) * s}px` : v);
      return {
        top: `${rect.top * s}px`,
        left: `${rect.left * s}px`,
        width: `${Math.max(rect.width * s, 120)}px`,
        fontFamily: css.fontFamily,
        fontSize: scaled(css.fontSize),
        fontWeight: css.fontWeight,
        fontStyle: css.fontStyle,
        lineHeight: scaled(css.lineHeight),
        letterSpacing: scaled(css.letterSpacing),
        textAlign: css.textAlign,
        color: css.color,
      };
    });

    function stop(keep: boolean): void {
      if (!keep && value.value !== original) write(original);
      if (target) target.style.visibility = '';
      target = null;
      state.editing = null;
      endGesture();
    }

    function open(): void {
      const current = editing.value;
      if (!current) return;
      target = fieldElement(current.section, current.element, current.key);
      if (target) target.style.visibility = 'hidden';
      original = value.value;
      nextTick(() => {
        box.value?.focus();
        box.value?.select();
        fit();
      });
    }

    onMounted(open);
    watch(editing, (now, before) => {
      if (now && now !== before) open();
    });
    onBeforeUnmount(() => {
      if (target) target.style.visibility = '';
    });

    return () =>
      editing.value && placement.value
        ? h('textarea', {
            ref: box,
            class: 'text-editor',
            'aria-label': 'Edit text',
            style: placement.value,
            value: value.value,
            rows: 1,
            onInput: (event: Event) => {
              write((event.target as HTMLTextAreaElement).value);
              fit();
            },
            onBlur: () => stop(true),
            onKeydown: (event: KeyboardEvent) => {
              event.stopPropagation();
              if (event.key === 'Escape') stop(false);
              if (event.key === 'Enter' && (!multiline.value || event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                stop(true);
              }
            },
          })
        : null;
  },
});
