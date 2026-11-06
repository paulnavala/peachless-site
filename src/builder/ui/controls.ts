/**
 * The inspector's form controls. Every one is a real, labelled form element, so
 * the whole builder works from a keyboard and a screen reader.
 */
import { h, type VNode } from 'vue';

let count = 0;
const uid = (name: string) => `control-${name}-${++count}`;

interface Common {
  label: string;
  hint?: string;
  /** Marks the control for "bring this field into view". */
  name?: string;
}

const hintOf = (id: string, hint?: string) => (hint ? h('p', { id: `${id}-hint`, class: 'hint' }, hint) : null);
const describedBy = (id: string, hint?: string) => (hint ? { 'aria-describedby': `${id}-hint` } : {});

export function textField(options: Common & { value: string; rows?: number; onInput: (value: string) => void; invalid?: boolean }): VNode {
  const { label, hint, name, value, rows, onInput, invalid } = options;
  const id = uid('text');
  const common = {
    id,
    class: 'input',
    value,
    'data-field-name': name,
    'aria-invalid': invalid ? 'true' : undefined,
    ...describedBy(id, hint),
    onInput: (event: Event) => onInput((event.target as HTMLInputElement).value),
  };
  return h('div', { class: 'control' }, [
    h('label', { class: 'label', for: id }, label),
    rows ? h('textarea', { ...common, rows }) : h('input', { ...common, type: 'text' }),
    hintOf(id, hint),
  ]);
}

export function toggleField(options: Common & { value: boolean; onChange: (value: boolean) => void }): VNode {
  const { label, hint, value, onChange } = options;
  const id = uid('toggle');
  return h('div', { class: 'control control--toggle' }, [
    h('input', {
      id,
      type: 'checkbox',
      class: 'checkbox',
      checked: value,
      ...describedBy(id, hint),
      onChange: (event: Event) => onChange((event.target as HTMLInputElement).checked),
    }),
    h('label', { class: 'label', for: id }, label),
    hintOf(id, hint),
  ]);
}

export function numberField(options: Common & { value: number; min: number; max: number; onChange: (value: number) => void }): VNode {
  const { label, value, min, max, onChange } = options;
  const id = uid('number');
  return h('div', { class: 'control control--number' }, [
    h('label', { class: 'label', for: id }, label),
    h('input', {
      id,
      type: 'number',
      class: 'input',
      value,
      min,
      max,
      onChange: (event: Event) => {
        const next = Number((event.target as HTMLInputElement).value);
        if (Number.isFinite(next)) onChange(next);
      },
    }),
  ]);
}

/** A short set of choices, as a row of radios: the options stay visible. */
export function choiceField<T extends string>(options: Common & { value: T; choices: readonly (readonly [T, string])[]; onChange: (value: T) => void }): VNode {
  const { label, hint, value, choices, onChange } = options;
  const group = uid('choice');
  return h('fieldset', { class: 'control control--choice' }, [
    h('legend', { class: 'label' }, label),
    h(
      'div',
      { class: 'segments' },
      choices.map(([choice, text]) =>
        h('label', { class: ['segment', { 'is-on': choice === value }] }, [
          h('input', {
            type: 'radio',
            class: 'sr-only',
            name: group,
            value: choice,
            checked: choice === value,
            onChange: () => onChange(choice),
          }),
          h('span', text),
        ])
      )
    ),
    hint ? h('p', { class: 'hint' }, hint) : null,
  ]);
}

export const group = (title: string, children: (VNode | null | undefined)[]): VNode =>
  h('section', { class: 'group' }, [h('h3', { class: 'group__title' }, title), ...children]);
