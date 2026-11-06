/**
 * The builder's frame: the top bar, the panels and the canvas. The real page sits
 * in the middle, in a sandboxed frame, with the overlay above it.
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref, type VNode } from 'vue';
import { mountCanvas, view } from '../canvas/controller';
import { FRAME_SANDBOX } from '../canvas/frame';
import { session } from '../session';
import {
  canRedo,
  canUndo,
  DEVICES,
  duplicateElement,
  duplicateSection,
  page,
  placeElement,
  redo,
  removeElement,
  removeSection,
  select,
  selectedElement,
  selectedSection,
  state,
  undo,
  type Device,
} from '../store';
import { Inspector } from './inspector';
import { Overlay } from './overlay';
import { LeftPanel } from './panels';
import { Messages, PublishControls, SignIn } from './publish';
import { TextEditor } from './text-editor';

const DEVICE_NAMES: Record<Device, string> = { desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' };

const typing = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

function onKeydown(event: KeyboardEvent): void {
  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLowerCase() === 'z') {
    if (typing(event.target)) return;
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (typing(event.target)) return;

  const section = selectedSection.value;
  const element = selectedElement.value;
  if (event.key === 'Escape') {
    select(element ? { section: section!.id } : null);
    return;
  }
  if (command && event.key.toLowerCase() === 'd' && section) {
    event.preventDefault();
    if (element) duplicateElement(section.id, element.id);
    else duplicateSection(section.id);
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && section) {
    event.preventDefault();
    if (element) removeElement(section.id, element.id);
    else removeSection(section.id);
    return;
  }
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const move = arrows[event.key];
  if (move && section && element && state.device !== 'phone') {
    event.preventDefault();
    placeElement(section.id, element.id, { col: element.col + move[0], row: element.row + move[1], w: element.w, h: element.h });
  }
}

const TopBar = defineComponent({
  name: 'TopBar',
  setup() {
    return () =>
      h('header', { class: 'bar' }, [
        h('img', { class: 'bar__mark', src: '/favicon.svg', alt: 'peachless.' }),
        h('p', { class: 'bar__page' }, page.value?.raw.title ?? ''),
        h(
          'div',
          { class: 'bar__group', role: 'group', 'aria-label': 'Screen size' },
          (Object.keys(DEVICES) as Device[]).map((device) =>
            h(
              'button',
              {
                type: 'button',
                class: 'device',
                'aria-pressed': state.device === device ? 'true' : 'false',
                title: `${DEVICES[device]} pixels wide`,
                onClick: () => (state.device = device),
              },
              DEVICE_NAMES[device]
            )
          )
        ),
        h('div', { class: 'bar__group' }, [
          h('button', { type: 'button', class: 'device', disabled: !canUndo.value, onClick: undo }, 'Undo'),
          h('button', { type: 'button', class: 'device', disabled: !canRedo.value, onClick: redo }, 'Redo'),
        ]),
        h('span', { class: 'bar__fill' }),
        h(PublishControls),
      ]);
  },
});

const Canvas = defineComponent({
  name: 'Canvas',
  setup() {
    const frame = ref<HTMLIFrameElement | null>(null);
    const specimens = ref<HTMLIFrameElement | null>(null);
    const scroller = ref<HTMLElement | null>(null);

    onMounted(() => {
      if (frame.value && specimens.value && scroller.value) mountCanvas(frame.value, specimens.value, scroller.value);
    });

    return () =>
      h('main', { ref: scroller, class: 'canvas', 'aria-label': 'Page' }, [
        h('div', { class: 'canvas__spacer', style: { height: `${Math.max(view.contentHeight * view.scale, view.stageHeight)}px` } }, [
          h('div', { class: 'canvas__stage', style: { height: `${view.stageHeight}px` } }, [
            h('iframe', { ref: frame, class: 'canvas__frame', sandbox: FRAME_SANDBOX, title: 'The page you’re editing', tabindex: -1 }),
            h(Overlay),
            h(TextEditor),
            view.error ? h('p', { class: 'canvas__status', role: 'alert' }, view.error) : view.loading ? h('p', { class: 'canvas__status' }, 'Opening the page…') : null,
          ]),
        ]),
        h('iframe', { ref: specimens, class: 'canvas__specimens', sandbox: FRAME_SANDBOX, title: 'Section specimens', tabindex: -1, 'aria-hidden': 'true' }),
      ]);
  },
});

function gate(title: string, body: string, action?: VNode): VNode {
  return h('div', { class: 'gate' }, [
    h('img', { class: 'gate__mark', src: '/favicon.svg', alt: '' }),
    h('h1', { class: 'gate__title' }, title),
    h('p', body),
    action,
  ]);
}

export const App = defineComponent({
  name: 'App',
  setup() {
    onMounted(() => window.addEventListener('keydown', onKeydown));
    onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

    return () => {
      if (session.phase === 'starting') return gate('Opening the builder', 'Reading the site…');
      if (session.phase === 'signed-out') return h(SignIn);
      if (session.phase === 'other-tab') return gate('The builder is open in another tab', 'Use that one, so two tabs can’t overwrite each other. Close it, then reload this one to carry on here.');
      if (session.phase === 'failed') return gate('The builder didn’t open', session.error);
      return [
        h(TopBar),
        h(LeftPanel),
        h(Canvas),
        h(Inspector),
        h(Messages),
        h('p', { class: 'too-small' }, 'The builder needs a wider window: a laptop or desktop, or a tablet turned sideways.'),
      ];
    };
  },
});
