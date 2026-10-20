import { defineComponent, h, nextTick, ref, type PropType } from 'vue';
import '../../styles/components/contact-form.css';

type FieldType = 'text' | 'email' | 'tel' | 'textarea';
interface FormField {
  id: string;
  label: string;
  type: FieldType;
  autocomplete?: string;
  placeholder?: string;
  required?: boolean;
}

const FIELDS: FormField[] = [
  { id: 'name', label: 'Name', type: 'text', autocomplete: 'name', required: true },
  { id: 'email', label: 'Email', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true },
  { id: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel' },
  { id: 'message', label: 'Message', type: 'textarea', placeholder: 'Tell me about your project…', required: true },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'sending' | 'success' | 'error' | 'unconfigured';

/**
 * Contact form posting to the configured endpoint (Web3Forms). Validation is
 * inline and announced: each error sits under its field (aria-describedby)
 * and focus moves to the first one. The status region is rendered from the
 * start so screen readers announce the result.
 */
export default defineComponent({
  name: 'ContactForm',
  props: {
    title: { type: String, default: 'Send a message' },
    subtitle: { type: String, default: '' },
    submitText: { type: String, default: 'Send message' },
    successMessage: { type: String, default: 'Message sent — thank you!' },
    formAction: { type: String, default: '' },
    formMethod: { type: String, default: 'POST' },
    hiddenFields: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
    // Offered (as a mailto link) when sending fails or the form isn't configured
    contactEmail: { type: String, default: '' },
  },
  setup(props) {
    const formRef = ref<HTMLFormElement | null>(null);
    const status = ref<Status>('idle');
    const errors = ref<Record<string, string>>({});

    const valueOf = (form: HTMLFormElement, id: string) =>
      ((form.elements.namedItem(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '').trim();

    function validate(form: HTMLFormElement) {
      const found: Record<string, string> = {};
      for (const f of FIELDS) {
        const value = valueOf(form, f.id);
        if (f.required && !value) found[f.id] = `Please enter your ${f.label.toLowerCase()}.`;
        else if (f.type === 'email' && value && !EMAIL.test(value)) found[f.id] = 'Please enter an email address like name@example.com.';
      }
      errors.value = found;
      return FIELDS.find((f) => found[f.id]);
    }

    async function handleSubmit(e: Event) {
      e.preventDefault();
      const form = formRef.value;
      if (!form || status.value === 'sending') return;
      const firstInvalid = validate(form);
      if (firstInvalid) {
        await nextTick();
        (form.elements.namedItem(firstInvalid.id) as HTMLElement | null)?.focus();
        return;
      }
      if (!props.formAction) {
        status.value = 'unconfigured';
        return;
      }
      status.value = 'sending';
      try {
        const res = await fetch(props.formAction, {
          method: props.formMethod || 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
        status.value = res.ok ? 'success' : 'error';
        if (res.ok) form.reset();
      } catch {
        status.value = 'error';
      }
    }

    const clearError = (id: string) => {
      if (!errors.value[id]) return;
      const { [id]: _removed, ...rest } = errors.value;
      errors.value = rest;
    };

    function statusMessage(state: Status) {
      const email = props.contactEmail;
      const emailLink = () => h('a', { href: `mailto:${email}` }, email);
      switch (state) {
        case 'success':
          return props.successMessage;
        case 'error':
          return email ? ['Something went wrong. Please email ', emailLink(), ' instead.'] : 'Something went wrong. Please try again later.';
        case 'unconfigured':
          return email ? ['The form isn’t set up yet — please email ', emailLink(), '.'] : 'The form isn’t set up yet.';
        default:
          return '';
      }
    }

    return () => {
      const sending = status.value === 'sending';
      const fields = FIELDS.map((f) => {
        const error = errors.value[f.id];
        const attrs = {
          id: f.id,
          name: f.id,
          class: 'input cf__input',
          required: f.required || undefined,
          autocomplete: f.autocomplete,
          placeholder: f.placeholder,
          'aria-invalid': error ? 'true' : undefined,
          'aria-describedby': error ? `${f.id}-error` : undefined,
          onInput: () => clearError(f.id),
        };
        return h('div', { class: 'field cf__field' }, [
          h('label', { class: 'label', for: f.id }, [f.label, !f.required && h('span', { class: 'label__optional' }, ' (optional)')]),
          f.type === 'textarea' ? h('textarea', { ...attrs, rows: 5 }) : h('input', { ...attrs, type: f.type }),
          error && h('p', { id: `${f.id}-error`, class: 'error' }, error),
        ]);
      });

      return h('div', { class: 'contact-form-container cf' }, [
        h('div', { class: 'cf__header' }, [
          h('h2', { class: 'cf__title' }, props.title),
          props.subtitle && h('p', { class: 'cf__subtitle' }, props.subtitle),
        ]),
        h(
          'form',
          { ref: formRef, class: 'cf__form', action: props.formAction, method: props.formMethod, novalidate: true, onSubmit: handleSubmit },
          [
            ...Object.entries(props.hiddenFields).map(([name, value]) => h('input', { type: 'hidden', name, value })),
            // Web3Forms spam trap: hidden from people, so only bots tick it.
            h('input', { type: 'checkbox', name: 'botcheck', class: 'cf__trap', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true' }),
            ...fields,
            h(
              'button',
              { type: 'submit', class: 'btn btn--lg cf__submit', 'aria-disabled': sending ? 'true' : undefined },
              sending ? 'Sending…' : props.submitText
            ),
            h(
              'p',
              { class: ['form-status', status.value !== 'idle' && status.value !== 'sending' && `form-status--${status.value}`], role: 'status' },
              statusMessage(status.value)
            ),
          ]
        ),
      ]);
    };
  },
});
