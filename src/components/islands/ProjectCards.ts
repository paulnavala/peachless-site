import { defineComponent, h, onMounted, ref, type PropType } from 'vue';
import { isReducedMotion } from '../../lib/dom';

type CardItem = {
  href: string;
  title: string;
  description: string;
  className?: string;
};

type GuidelineItem = {
  href: string;
  title: string;
  description?: string;
};

export default defineComponent({
  name: 'ProjectCards',
  props: {
    items: {
      type: Array as PropType<CardItem[]>,
      default: () => [],
    },
    guideline: {
      type: Object as PropType<GuidelineItem | null>,
      default: null,
    },
  },
  setup(props) {
    const MAX_SHIFT = 6;
    const rootEl = ref<HTMLElement | null>(null);

    onMounted(() => {
      if (isReducedMotion()) return;

      const root = rootEl.value?.querySelector('.projects-text-grid');
      if (!root) return;
      const cards = Array.from(root.querySelectorAll('.project-card')) as HTMLElement[];

      cards.forEach((card) => {
        function onMove(e: MouseEvent) {
          const rect = card.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
          const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
          card.style.setProperty('--bg-x', `${x * MAX_SHIFT}px`);
          card.style.setProperty('--bg-y', `${y * MAX_SHIFT}px`);
        }
        function onLeave() {
          card.style.setProperty('--bg-x', '0px');
          card.style.setProperty('--bg-y', '0px');
        }
        card.addEventListener('mousemove', onMove);
        card.addEventListener('mouseleave', onLeave);
      });

      // Add parallax effect to guideline button
      const guidelineBtn = rootEl.value?.querySelector<HTMLElement>('.guideline-button');
      if (guidelineBtn) {
        const onMoveGuideline = (e: MouseEvent) => {
          const rect = guidelineBtn.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
          const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
          guidelineBtn.style.setProperty('--bg-x', `${x * MAX_SHIFT}px`);
          guidelineBtn.style.setProperty('--bg-y', `${y * MAX_SHIFT}px`);
        };
        const onLeaveGuideline = () => {
          guidelineBtn.style.setProperty('--bg-x', '0px');
          guidelineBtn.style.setProperty('--bg-y', '0px');
        };
        guidelineBtn.addEventListener('mousemove', onMoveGuideline);
        guidelineBtn.addEventListener('mouseleave', onLeaveGuideline);
      }
    });

    return () => {
      const guidelineBtn = props.guideline
        ? h(
            'a',
            {
              href: props.guideline.href,
              class: 'guideline-button',
            },
            [
              h('h2', props.guideline.title),
              props.guideline.description ? h('p', props.guideline.description) : null,
            ]
          )
        : null;

      const gridItems = [
        ...props.items.map((it) =>
          h(
            'a',
            { href: it.href, class: `project-card${it.className ? ' ' + it.className : ''}` },
            [h('h2', it.title), h('p', it.description)]
          )
        ),
        ...(guidelineBtn ? [guidelineBtn] : []),
      ];

      const cardsGrid = h('div', { class: 'projects-text-grid' }, gridItems);

      return h('div', { class: 'project-cards-container', ref: rootEl }, [cardsGrid]);
    };
  },
});


