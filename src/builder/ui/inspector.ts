/**
 * The right-hand panel: whatever is selected, as a form. Its fields come from the
 * section catalogue, so a new section gets its form for free. Design choices are
 * token names, so nothing here can leave the design system.
 */
import { computed, defineComponent, h, nextTick, ref, watch, type VNode } from 'vue';
import {
  ALIGNMENTS,
  BUTTON_STYLES,
  ELEMENT_MIN_WIDTH,
  GRID_COLUMNS,
  GRID_MAX_ROW,
  HEADING_STYLES,
  SECTION_WIDTHS,
  SPACES,
  SURFACES,
  TEXT_SIZES,
} from '../../lib/content-schema';
import { definitionOf, type FieldDef } from '../../lib/section-catalogue';
import { uploadImage } from '../images';
import { getPath, page, placeElement, selectedElement, selectedSection, setElementField, setField, state, change, type RawElement, type RawSection } from '../store';
import { choiceField, group, numberField, textField, toggleField } from './controls';

const SURFACE_LABELS: Record<(typeof SURFACES)[number], string> = { default: 'Page', paper: 'Paper', blush: 'Blush', inverse: 'Dark' };
const SPACE_LABELS: Record<(typeof SPACES)[number], string> = { default: 'Standard', tight: 'Tight', none: 'None' };
const ELEMENT_NAMES: Record<RawElement['type'], string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  quote: 'Quote',
  divider: 'Divider',
};

const labelled = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((v) => [v, labels[v]] as const);

function listField(section: RawSection, field: FieldDef): VNode {
  const items = (getPath(section, field.key) ?? []) as unknown[];
  const update = (next: unknown[]) => setField(section.id, field.key, next);
  const canAdd = field.max === undefined || items.length < field.max;
  const canRemove = field.min === undefined || items.length > field.min;
  const blank = field.item ? Object.fromEntries(field.item.map((f) => [f.key, ''])) : '';

  return h('div', { class: 'list' }, [
    h('p', { class: 'label' }, field.label),
    ...items.map((item, i) =>
      h('div', { class: 'list__item' }, [
        ...(field.item
          ? field.item.map((sub) =>
              textField({
                label: sub.label,
                value: String((item as Record<string, unknown>)[sub.key] ?? ''),
                rows: sub.kind === 'area' ? 2 : undefined,
                onInput: (value) => update(items.map((old, j) => (j === i ? { ...(old as object), [sub.key]: value } : old))),
              })
            )
          : [
              textField({
                label: `${field.label} ${i + 1}`,
                value: String(item ?? ''),
                rows: 2,
                onInput: (value) => update(items.map((old, j) => (j === i ? value : old))),
              }),
            ]),
        h('div', { class: 'list__actions' }, [
          h('button', { type: 'button', class: 'link', disabled: i === 0, onClick: () => update(swap(items, i, i - 1)) }, 'Up'),
          h('button', { type: 'button', class: 'link', disabled: i === items.length - 1, onClick: () => update(swap(items, i, i + 1)) }, 'Down'),
          h('button', { type: 'button', class: 'link', disabled: !canRemove, onClick: () => update(items.filter((_, j) => j !== i)) }, 'Remove'),
        ]),
      ])
    ),
    canAdd ? h('button', { type: 'button', class: 'button button--quiet', onClick: () => update([...items, blank]) }, 'Add one') : null,
  ]);
}

const swap = (items: unknown[], a: number, b: number) => {
  const next = [...items];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};

function sectionFields(section: RawSection): (VNode | null)[] {
  return definitionOf(section.type).fields.map((field) => {
    const value = getPath(section, field.key);
    const set = (next: unknown) => setField(section.id, field.key, next);
    switch (field.kind) {
      case 'toggle':
        return toggleField({ label: field.label, value: value !== false, onChange: set });
      case 'list':
        // Work's closing links follow whichever view a visitor is on.
        return section.auto && field.key === 'links' ? null : listField(section, field);
      default:
        return textField({
          label: field.label,
          hint: field.hint ?? (field.kind === 'markdown' || field.kind === 'inline-markdown' ? 'Use **bold** and *italics*.' : undefined),
          name: field.key,
          value: String(value ?? ''),
          rows: field.kind === 'area' ? 3 : field.kind === 'markdown' ? 8 : field.kind === 'inline-markdown' || field.kind === 'lit' ? 3 : undefined,
          onInput: set,
        });
    }
  });
}

function designFields(section: RawSection): (VNode | null)[] {
  const pick = <T extends string>(key: string, fallback: T) => (section[key] as T | undefined) ?? fallback;
  const set = (key: string) => (value: string) => setField(section.id, key, value === 'default' ? undefined : value);
  return [
    choiceField({ label: 'Background', value: pick('surface', 'default'), choices: labelled(SURFACES, SURFACE_LABELS), onChange: set('surface') }),
    section.type === 'cta-band'
      ? null
      : toggleField({
          label: 'Float as a rounded sheet',
          hint: 'From tablet width up.',
          value: !!section.sheet,
          onChange: (value) => setField(section.id, 'sheet', value || undefined),
        }),
    choiceField({ label: 'Space above', value: pick('spaceTop', 'default'), choices: labelled(SPACES, SPACE_LABELS), onChange: set('spaceTop') }),
    choiceField({ label: 'Space below', value: pick('spaceBottom', 'default'), choices: labelled(SPACES, SPACE_LABELS), onChange: set('spaceBottom') }),
    section.type === 'grid'
      ? choiceField({
          label: 'Width',
          value: pick('width', 'default'),
          choices: SECTION_WIDTHS.map((w) => [w, w === 'default' ? 'Standard' : 'Wide'] as const),
          onChange: set('width'),
        })
      : null,
  ];
}

function elementFields(section: RawSection, element: RawElement): (VNode | null)[] {
  const set = (key: string) => (value: unknown) => setElementField(section.id, element.id, key, value);
  const text = (key: string, label: string, rows?: number, hint?: string) =>
    textField({ label, hint, rows, name: key, value: String(element[key] ?? ''), onInput: set(key) });

  switch (element.type) {
    case 'heading':
      return [
        text('text', 'Text', 2),
        choiceField({
          label: 'Size',
          value: (element.style as (typeof HEADING_STYLES)[number]) ?? 'h2',
          choices: HEADING_STYLES.map((s) => [s, s === 'statement' ? 'Statement' : s === 'h1' ? 'Largest' : s === 'h2' ? 'Large' : s === 'h3' ? 'Medium' : 'Small'] as const),
          onChange: set('style'),
        }),
      ];
    case 'text':
      return [
        text('body', 'Text', 8, 'Use **bold**, *italics* and [links](/about/).'),
        choiceField({
          label: 'Size',
          value: (element.size as (typeof TEXT_SIZES)[number]) ?? 'body',
          choices: [['lede', 'Large'], ['body', 'Standard'], ['small', 'Small']],
          onChange: set('size'),
        }),
      ];
    case 'image':
      return [
        h('div', { class: 'control' }, [
          h('label', { class: 'label', for: 'image-file' }, element.image ? 'Replace the image' : 'Choose an image'),
          h('input', {
            id: 'image-file',
            type: 'file',
            class: 'input',
            accept: 'image/*',
            onChange: async (event: Event) => {
              const file = (event.target as HTMLInputElement).files?.[0];
              if (file) set('image')(await uploadImage(page.value.id, file));
            },
          }),
        ]),
        text('alt', 'Describe the image', 2, 'For people who can’t see it.'),
        text('caption', 'Caption'),
        choiceField({
          label: 'Fit',
          value: (element.fit as 'cover' | 'contain') ?? 'cover',
          choices: [['cover', 'Fill the space'], ['contain', 'Show it all']],
          onChange: set('fit'),
        }),
      ];
    case 'button':
      return [
        text('label', 'Button text'),
        text('link', 'Goes to', undefined, 'A page on this site, such as /about/, or a full web address.'),
        choiceField({
          label: 'Style',
          value: (element.style as (typeof BUTTON_STYLES)[number]) ?? 'primary',
          choices: [['primary', 'Solid'], ['secondary', 'Outline']],
          onChange: set('style'),
        }),
      ];
    case 'quote':
      return [text('quote', 'Quote', 4), text('attribution', 'Who said it')];
    default:
      return [];
  }
}

function placementFields(section: RawSection, element: RawElement): (VNode | null)[] {
  const place = (key: 'col' | 'row' | 'w' | 'h') => (value: number) =>
    placeElement(section.id, element.id, { col: element.col, row: element.row, w: element.w, h: element.h, [key]: value });
  const align = (key: 'align' | 'valign') => (value: string) => setElementField(section.id, element.id, key, value === 'start' ? undefined : value);
  return [
    h('div', { class: 'numbers' }, [
      numberField({ label: 'Column', value: element.col, min: 1, max: GRID_COLUMNS, onChange: place('col') }),
      numberField({ label: 'Row', value: element.row, min: 1, max: GRID_MAX_ROW, onChange: place('row') }),
      numberField({ label: 'Width', value: element.w, min: ELEMENT_MIN_WIDTH[element.type], max: GRID_COLUMNS, onChange: place('w') }),
      numberField({ label: 'Height', value: element.h, min: 1, max: GRID_MAX_ROW, onChange: place('h') }),
    ]),
    choiceField({
      label: 'Align',
      value: (element.align as (typeof ALIGNMENTS)[number]) ?? 'start',
      choices: [['start', 'Left'], ['center', 'Centre'], ['end', 'Right']],
      onChange: align('align'),
    }),
    choiceField({
      label: 'Sit',
      value: (element.valign as (typeof ALIGNMENTS)[number]) ?? 'start',
      choices: [['start', 'Top'], ['center', 'Middle'], ['end', 'Bottom']],
      onChange: align('valign'),
    }),
  ];
}

function phoneFields(section: RawSection, element: RawElement): (VNode | null)[] {
  const phone = (element.phone ?? {}) as { hidden?: boolean; span?: 'full' | 'half'; order?: number };
  const set = (key: string, value: unknown) => setElementField(section.id, element.id, `phone.${key}`, value);
  const movable = element.type === 'image' || element.type === 'divider';
  return [
    toggleField({ label: 'Hide on phones', value: !!phone.hidden, onChange: (value) => set('hidden', value || undefined) }),
    choiceField({
      label: 'Width on phones',
      value: phone.span ?? 'full',
      choices: [['full', 'Full'], ['half', 'Half']],
      onChange: (value) => set('span', value === 'full' ? undefined : value),
    }),
    movable
      ? numberField({
          label: 'Move up or down the stack',
          value: phone.order ?? 0,
          min: -20,
          max: 20,
          onChange: (value) => set('order', value || undefined),
        })
      : h('p', { class: 'hint' }, 'Text stays in reading order, so people using a keyboard or a screen reader hear it in the same order you see it.'),
  ];
}

function pageSettings(): VNode[] {
  const entry = page.value;
  if (entry.raw.story) {
    return [
      h('h2', { class: 'panel-title' }, entry.raw.title),
      h('p', { class: 'panel-note' }, 'Click a block to edit it. The title, cover and credits are in the admin.'),
    ];
  }
  const set = (fn: (raw: typeof entry.raw) => void, key: string) => change(fn, key);
  return [
    h('h2', { class: 'panel-title' }, entry.raw.title),
    h('p', { class: 'panel-note' }, 'Click a section on the page to edit it.'),
    group('This page', [
      textField({
        label: 'Name',
        hint: 'Shows in the browser tab.',
        value: entry.raw.title,
        onInput: (value) =>
          set((raw) => {
            raw.title = value;
          }, 'page-title'),
      }),
      textField({
        label: 'Description for search results',
        rows: 3,
        value: entry.raw.seo?.description ?? '',
        onInput: (value) =>
          set((raw) => {
            raw.seo = { ...raw.seo, description: value || undefined };
          }, 'page-description'),
      }),
    ]),
  ];
}

export const Inspector = defineComponent({
  name: 'Inspector',
  setup() {
    const root = ref<HTMLElement | null>(null);
    const section = computed(() => selectedSection.value);
    const element = computed(() => selectedElement.value);

    // A double-click on the canvas lands here for text that can't be edited in place.
    watch(
      () => state.focusField,
      async (name) => {
        if (!name) return;
        await nextTick();
        root.value?.querySelector<HTMLElement>(`[data-field-name="${name}"]`)?.focus();
        state.focusField = null;
      }
    );

    return () => {
      const s = section.value;
      const e = element.value;
      let content: (VNode | null)[];
      if (!s) {
        content = pageSettings();
      } else if (e) {
        content = [
          h('h2', { class: 'panel-title' }, ELEMENT_NAMES[e.type]),
          ...elementFields(s, e),
          state.device === 'phone' ? group('On phones', phoneFields(s, e)) : group('Position', placementFields(s, e)),
        ];
      } else {
        const def = definitionOf(s.type);
        content = [
          h('h2', { class: 'panel-title' }, def.name),
          h('p', { class: 'panel-note' }, def.note),
          ...sectionFields(s),
          page.value.raw.story ? null : group('Design', designFields(s)),
        ];
      }
      return h('aside', { ref: root, class: 'panel panel--right', 'aria-label': 'Inspector' }, content);
    };
  },
});
