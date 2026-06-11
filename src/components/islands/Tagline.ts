import { defineComponent, h, onMounted, ref } from 'vue';

export default defineComponent({
  name: 'Tagline',
  props: {
    line1: { type: String, default: 'Every pixel tells a story.' },
    line2: { type: String, default: ' Let the world know yours.' },
    typeSpeed: { type: Number, default: 65 },
    typeVariance: { type: Number, default: 25 },
    waitBetweenLines: { type: Number, default: 2000 },
    holdAfterLine2: { type: Number, default: 15000 },
    fadeDuration: { type: Number, default: 2500 },
    waitBeforeRestart: { type: Number, default: 5000 },
    fixedCenter: { type: Boolean, default: false },
  },
  setup(props) {
    const root = ref<HTMLElement | null>(null);
    const line1Ref = ref<HTMLElement | null>(null);
    const line2Ref = ref<HTMLElement | null>(null);

    function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

    function makeCharSpan(ch: string): HTMLSpanElement {
      const span = document.createElement('span');
      span.textContent = ch;
      span.style.animation = 'glow 0.6s ease';
      return span;
    }

    function clearPreviousGlow(textEl: HTMLElement) {
      const last = textEl.lastElementChild as HTMLElement | null;
      if (last) {
        last.style.animation = 'none';
        last.style.textShadow = 'none';
      }
    }

    function measureLineSize(
      text: string,
      availableWidth: number
    ): { width: number; height: number } {
      // Create a hidden measurement container that mimics the line styling
      const measureRoot = document.createElement('div');
      measureRoot.className = 'tagline typewriter';
      measureRoot.style.position = 'absolute';
      measureRoot.style.visibility = 'hidden';
      measureRoot.style.left = '-99999px';
      measureRoot.style.top = '0';
      measureRoot.style.display = 'flex';
      measureRoot.style.flexDirection = 'column';
      measureRoot.style.alignItems = 'center';
      const constrainedWidth = Math.max(0, Math.floor(availableWidth));
      if (constrainedWidth > 0) {
        measureRoot.style.width = `${constrainedWidth}px`;
        measureRoot.style.maxWidth = `${constrainedWidth}px`;
      }

      const line = document.createElement('div');
      line.className = 'text line';
      line.textContent = text;
      measureRoot.appendChild(line);
      document.body.appendChild(measureRoot);
      const rect = line.getBoundingClientRect();
      const w = Math.ceil(rect.width);
      const h = Math.ceil(rect.height);
      document.body.removeChild(measureRoot);
      return { width: w, height: h };
    }

    function buildSlots(lineEl: HTMLElement, text: string): HTMLElement[] {
      // Clear and build invisible slots for each character to pin final layout
      lineEl.innerHTML = '';
      const slots: HTMLElement[] = [];
      for (let i = 0; i < text.length; i++) {
        const slot = document.createElement('span');
        slot.textContent = text[i];
        // Reserve width without showing yet
        slot.style.visibility = 'hidden';
        slot.className = 'slot';
        slots.push(slot);
        lineEl.appendChild(slot);
      }
      return slots;
    }

    async function typeText(text: string, baseSpeed: number, textEl: HTMLElement) {
      for (let i = 0; i < text.length; i++) {
        clearPreviousGlow(textEl);
        const span = makeCharSpan(text[i]);
        textEl.appendChild(span);
        const variance = Math.random() * props.typeVariance - props.typeVariance / 2;
        const delay = Math.max(20, baseSpeed + variance);
        await sleep(delay);
      }
      clearPreviousGlow(textEl);
    }

    function resetTagline(tag: HTMLElement, line1El: HTMLElement) {
      tag.classList.remove('fade');
      line1El.innerHTML = '';
      if (line2Ref.value) line2Ref.value.innerHTML = '';
    }

    async function runSequence(tag: HTMLElement, line1El: HTMLElement) {
      while (true) {
        const l1 = line1El;
        const l2 = line2Ref.value as HTMLElement | null;
        // Optionally fix line widths to final size to prevent lateral motion
        // Pre-measure final sizes to reserve space and avoid vertical/horizontal shifts
        const availableWidth =
          tag.clientWidth ||
          tag.getBoundingClientRect().width ||
          window.innerWidth ||
          document.documentElement.clientWidth ||
          0;
        const s1 = measureLineSize(String(props.line1), availableWidth);
        const s2 = l2 ? measureLineSize(String(props.line2), availableWidth) : { width: 0, height: 0 };

        // Always reserve vertical space to avoid line jumping
        l1.style.minHeight = s1.height + 'px';
        if (l2) l2.style.minHeight = s2.height + 'px';

        // Optionally fix widths (no lateral motion)
        if (props.fixedCenter) {
          l1.style.width = s1.width + 'px';
          if (l2) l2.style.width = s2.width + 'px';
        } else {
          l1.style.removeProperty('width');
          if (l2) l2.style.removeProperty('width');
        }

        resetTagline(tag, l1);
        if (props.fixedCenter) {
          const slots1 = buildSlots(l1, String(props.line1));
          for (let i = 0; i < slots1.length; i++) {
            const slot = slots1[i];
            slot.style.visibility = 'visible';
            slot.style.animation = 'glow 0.6s ease';
            const variance = Math.random() * props.typeVariance - props.typeVariance / 2;
            const delay = Math.max(20, props.typeSpeed + variance);
            await sleep(delay);
          }
        } else {
          await typeText(String(props.line1), props.typeSpeed, l1);
        }
        await sleep(props.waitBetweenLines);
        if (l2) {
          if (props.fixedCenter) {
            const slots2 = buildSlots(l2, String(props.line2));
            for (let i = 0; i < slots2.length; i++) {
              const slot = slots2[i];
              slot.style.visibility = 'visible';
              slot.style.animation = 'glow 0.6s ease';
              const variance = Math.random() * props.typeVariance - props.typeVariance / 2;
              const delay = Math.max(20, props.typeSpeed + variance);
              await sleep(delay);
            }
          } else {
            await typeText(String(props.line2), props.typeSpeed, l2);
          }
        }
        await sleep(props.holdAfterLine2);
        tag.classList.add('fade');
        await sleep(props.fadeDuration);
        await sleep(props.waitBeforeRestart);
      }
    }

    onMounted(() => {
      const tag = root.value as HTMLElement | null;
      const l1 = line1Ref.value as HTMLElement | null;
      if (!tag || !l1) return;
      void runSequence(tag, l1);
    });

    return () =>
      h('div', { ref: root, class: 'tagline typewriter', style: 'display:flex;flex-direction:column;align-items:center;text-align:center' }, [
        h('div', { ref: line1Ref, class: 'text line line-1' }),
        h('div', { ref: line2Ref, class: 'text line line-2' }),
      ]);
  },
});


