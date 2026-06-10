import { defineComponent, h, ref, onMounted, type PropType } from 'vue';
import { isReducedMotion } from '../../lib/dom';

type FormField = {
    id: string;
    label: string;
    type: 'text' | 'email' | 'tel' | 'textarea';
    placeholder?: string;
    required?: boolean;
};

export default defineComponent({
    name: 'ContactForm',
    props: {
        title: { type: String, default: "Let's Create Together" },
        subtitle: { type: String, default: "Have a project in mind? Let's bring your vision to life." },
        submitText: { type: String, default: 'Send Message' },
        fields: {
            type: Array as PropType<FormField[]>,
            default: () => [
                { id: 'name', label: 'Name', type: 'text', placeholder: 'Your Name', required: true },
                { id: 'email', label: 'Email', type: 'email', placeholder: 'your@email.com', required: true },
                { id: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 (555) 000-0000', required: false },
                { id: 'message', label: 'Message', type: 'textarea', placeholder: 'Tell us about your project...', required: true },
            ],
        },
        formAction: { type: String, default: '' },
        formMethod: { type: String, default: 'POST' },
        hiddenFields: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
    },
    setup(props) {
        const formRef = ref<HTMLFormElement | null>(null);
        const containerRef = ref<HTMLElement | null>(null);
        const isSubmitting = ref(false);
        const status = ref<'idle' | 'sending' | 'success' | 'error' | 'unconfigured'>('idle');
        const MAX_SHIFT = 6;

        async function handleSubmit(e: Event) {
            e.preventDefault();
            if (!formRef.value) return;
            if (!props.formAction) {
                status.value = 'unconfigured';
                return;
            }
            status.value = 'sending';
            try {
                const res = await fetch(props.formAction, {
                    method: props.formMethod || 'POST',
                    body: new FormData(formRef.value),
                    headers: { Accept: 'application/json' },
                });
                status.value = res.ok ? 'success' : 'error';
                if (res.ok) formRef.value.reset();
            } catch {
                status.value = 'error';
            }
        }

        onMounted(() => {
            const container = containerRef.value;
            if (!container) return;

            function onMove(e: MouseEvent) {
                const rect = container!.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
                container!.style.setProperty('--bg-x', `${x * MAX_SHIFT}px`);
                container!.style.setProperty('--bg-y', `${y * MAX_SHIFT}px`);
            }

            function onLeave() {
                container!.style.setProperty('--bg-x', '0px');
                container!.style.setProperty('--bg-y', '0px');
            }

            if (!isReducedMotion()) {
                container.addEventListener('mousemove', onMove);
                container.addEventListener('mouseleave', onLeave);
            }
        });

        return () => {
            const formFields = props.fields.map((field) => {
                const inputAttrs = {
                    id: field.id,
                    name: field.id,
                    type: field.type !== 'textarea' ? field.type : undefined,
                    placeholder: field.placeholder || '',
                    required: field.required || false,
                    class: 'form-input',
                };

                const inputElement =
                    field.type === 'textarea'
                        ? h('textarea', { ...inputAttrs, rows: 5 })
                        : h('input', inputAttrs);

                return h('div', { class: 'form-field' }, [
                    h('label', { for: field.id, class: 'form-label' }, field.label),
                    inputElement,
                ]);
            });

            const submitButton = h(
                'button',
                {
                    type: 'submit',
                    class: 'form-submit',
                    disabled: isSubmitting.value,
                },
                isSubmitting.value ? 'Sending...' : props.submitText
            );

            const form = h(
                'form',
                {
                    ref: formRef,
                    class: 'contact-form-inner',
                    action: props.formAction,
                    method: props.formMethod,
                    onSubmit: handleSubmit,
                },
                [
                    ...Object.entries(props.hiddenFields).map(([name, value]) =>
                        h('input', { type: 'hidden', name, value })
                    ),
                    ...formFields,
                    submitButton,
                    status.value !== 'idle' &&
                        h(
                            'p',
                            { class: ['form-status', `form-status--${status.value}`], role: 'status' },
                            {
                                sending: 'Sending…',
                                success: 'Message sent — thank you!',
                                error: 'Something went wrong. Please email patricia@peachless.design instead.',
                                unconfigured: 'The form isn’t configured yet — please email patricia@peachless.design.',
                            }[status.value]
                        ),
                ]
            );

            return h('div', { ref: containerRef, class: 'contact-form-container' }, [
                h('div', { class: 'contact-form-header' }, [
                    h('h2', { class: 'contact-form-title' }, props.title),
                    h('p', { class: 'contact-form-subtitle' }, props.subtitle),
                ]),
                form,
            ]);
        };
    },
});
