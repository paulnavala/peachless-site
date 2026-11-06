/**
 * The left-hand panels: what's on the site, what can be added, what's on this
 * page and whether it's ready to publish.
 */
import { computed, defineComponent, h, ref, type VNode } from 'vue';
import { ELEMENT_TYPES, ID_RE, RESERVED_PAGE_IDS, SECTION_TYPES, type ElementType, type SectionType } from '../../lib/content-schema';
import { allowedOn, PAGE_IDS, SECTIONS } from '../../lib/section-catalogue';
import { scrollToSection } from '../canvas/controller';
import {
  addElement,
  addPage,
  addSection,
  moveSection,
  openPage,
  page,
  pageIds,
  problems,
  sections,
  select,
  selectedSection,
  state,
  toggleHidden,
  type Panel,
} from '../store';
import { textField } from './controls';

const TABS: [Panel, string][] = [
  ['add', 'Add'],
  ['layers', 'Layers'],
  ['pages', 'Pages'],
  ['checks', 'Checks'],
];

const ELEMENTS: Record<ElementType, [string, string]> = {
  heading: ['Heading', 'A title, in any of the site’s sizes.'],
  text: ['Text', 'A few paragraphs.'],
  image: ['Image', 'A picture that fills the space you give it.'],
  button: ['Button', 'A link people can’t miss.'],
  quote: ['Quote', 'Kind words, in the site’s italic.'],
  divider: ['Divider', 'A thin line.'],
};

const GROUPS = ['Your own', 'Page openers', 'Showing work', 'Telling the story', 'Next steps'] as const;

function AddPanel(): VNode[] {
  const inGrid = selectedSection.value?.type === 'grid';
  const onPage = new Set(sections.value.map((s) => s.type));
  const usable = (type: SectionType) => allowedOn(type, page.value.id) && !(SECTIONS[type].once && onPage.has(type));

  const place = (type: SectionType) => {
    const after = sections.value.findIndex((s) => s.id === state.selection?.section);
    // The next step stays last, unless an editor picked a spot.
    const end = Math.max(1, sections.value.length - 1);
    const index = state.insertAt ?? (after === -1 ? end : after + 1);
    addSection(type, index);
    state.insertAt = null;
  };

  return [
    inGrid
      ? h('section', { class: 'library' }, [
          h('h3', { class: 'group__title' }, 'Add to this section'),
          ...ELEMENT_TYPES.map((type) =>
            h('button', { type: 'button', class: 'item', onClick: () => addElement(selectedSection.value!.id, type) }, [
              h('span', { class: 'item__name' }, ELEMENTS[type][0]),
              h('span', { class: 'item__note' }, ELEMENTS[type][1]),
            ])
          ),
        ])
      : null,
    state.insertAt !== null ? h('p', { class: 'notice' }, 'Pick a section to add at that spot.') : null,
    ...GROUPS.map((name) => {
      const types = SECTION_TYPES.filter((type) => SECTIONS[type].group === name && usable(type));
      if (!types.length) return null;
      return h('section', { class: 'library' }, [
        h('h3', { class: 'group__title' }, name),
        ...types.map((type) =>
          h('button', { type: 'button', class: 'item', onClick: () => place(type) }, [
            h('span', { class: 'item__name' }, SECTIONS[type].name),
            h('span', { class: 'item__note' }, SECTIONS[type].note),
          ])
        ),
      ]);
    }),
  ].filter((node): node is VNode => node !== null);
}

function LayersPanel(): VNode[] {
  const list = sections.value;
  return [
    h(
      'ol',
      { class: 'layers' },
      list.map((section, i) =>
        h('li', { class: ['layer', { 'is-selected': state.selection?.section === section.id, 'is-hidden': section.hidden }] }, [
          h(
            'button',
            {
              type: 'button',
              class: 'layer__name',
              onClick: () => {
                select({ section: section.id });
                scrollToSection(section.id);
              },
            },
            SECTIONS[section.type].name
          ),
          h('div', { class: 'layer__actions' }, [
            h('button', { type: 'button', class: 'link', disabled: i === 0, 'aria-label': `Move ${SECTIONS[section.type].name} up`, onClick: () => moveSection(section.id, i - 1) }, 'Up'),
            h('button', { type: 'button', class: 'link', disabled: i === list.length - 1, 'aria-label': `Move ${SECTIONS[section.type].name} down`, onClick: () => moveSection(section.id, i + 1) }, 'Down'),
            h('button', { type: 'button', class: 'link', 'aria-label': `${section.hidden ? 'Show' : 'Hide'} ${SECTIONS[section.type].name}`, onClick: () => toggleHidden(section.id) }, section.hidden ? 'Show' : 'Hide'),
          ]),
        ])
      )
    ),
  ];
}

const PagesPanel = defineComponent({
  name: 'PagesPanel',
  setup() {
    const name = ref('');
    const slug = computed(() =>
      name.value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    );
    const taken = computed(() => {
      const id = slug.value;
      return (RESERVED_PAGE_IDS as readonly string[]).includes(id) || (PAGE_IDS as readonly string[]).includes(id) || !!state.pages[id];
    });
    const valid = computed(() => ID_RE.test(slug.value) && !taken.value);

    return () => [
      h(
        'ul',
        { class: 'pages' },
        pageIds().map((id) =>
          h('li', [
            h(
              'button',
              { type: 'button', class: ['page-link', { 'is-selected': id === state.pageId }], 'aria-current': id === state.pageId ? 'page' : undefined, onClick: () => openPage(id) },
              state.pages[id].raw.title
            ),
          ])
        )
      ),
      h('section', { class: 'library' }, [
        h('h3', { class: 'group__title' }, 'New page'),
        textField({
          label: 'Page name',
          value: name.value,
          invalid: !!name.value && !valid.value,
          hint: !name.value
            ? undefined
            : taken.value
              ? `The address /${slug.value}/ is already in use. Try another name.`
              : `Its address will be /${slug.value}/, and can’t be changed later.`,
          onInput: (value) => (name.value = value),
        }),
        h(
          'button',
          {
            type: 'button',
            class: 'button',
            disabled: !valid.value,
            onClick: () => {
              addPage(slug.value, name.value.trim());
              name.value = '';
            },
          },
          'Add page'
        ),
      ]),
    ];
  },
});

function ChecksPanel(): VNode[] {
  if (!problems.value.length) return [h('p', { class: 'all-clear' }, 'This page is ready to publish.')];
  return [
    h(
      'ul',
      { class: 'checks' },
      problems.value.map((problem) =>
        h('li', [
          problem.section
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'check',
                  onClick: () => {
                    select({ section: problem.section! });
                    scrollToSection(problem.section!);
                  },
                },
                problem.message
              )
            : h('p', { class: 'check' }, problem.message),
        ])
      )
    ),
  ];
}

export const LeftPanel = defineComponent({
  name: 'LeftPanel',
  setup() {
    return () =>
      h('aside', { class: 'panel panel--left', 'aria-label': 'Site' }, [
        h(
          'div',
          { class: 'tabs', role: 'tablist', 'aria-label': 'Panels' },
          TABS.map(([panel, label]) =>
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                class: ['tab', { 'is-on': state.panel === panel }],
                'aria-selected': state.panel === panel,
                onClick: () => (state.panel = panel),
              },
              [label, panel === 'checks' && problems.value.length ? h('span', { class: 'count' }, String(problems.value.length)) : null]
            )
          )
        ),
        h(
          'div',
          { class: 'panel__body', role: 'tabpanel' },
          state.panel === 'add'
            ? AddPanel()
            : state.panel === 'layers'
              ? LayersPanel()
              : state.panel === 'pages'
                ? h(PagesPanel)
                : ChecksPanel()
        ),
      ]);
  },
});
