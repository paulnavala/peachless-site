/**
 * Everything drawn over the page: outlines, crop marks, handles, column guides
 * and the section toolbar. The frame is passive, so every pointer event lands
 * here, and hit-testing asks the frame what's underneath.
 *
 * Selection is shown as crop marks, as on a printer's proof.
 */
import { computed, defineComponent, h, ref, type VNode } from 'vue';
import { definitionOf } from '../../lib/section-catalogue';
import { fieldElement, frameDocument, hitTest, scrollBy, view, type Box } from '../canvas/controller';
import { clampCell, nearestEnd, nearestTrack, resizeTo, type Cell, type Edge, type Track } from '../grid/layout';
import {
  dragElement,
  duplicateElement,
  duplicateSection,
  endGesture,
  moveSection,
  page,
  removeElement,
  removeSection,
  sections,
  select,
  selectedElement,
  selectedSection,
  state,
  toggleHidden,
  type RawElement,
} from '../store';

const EDGES: Edge[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const AUTOSCROLL_ZONE = 56;
const AUTOSCROLL_STEP = 14;
const DRAG_THRESHOLD = 4;

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const boxStyle = (box: Pick<Box, 'top' | 'left' | 'width' | 'height'>) => ({
  top: px(box.top),
  left: px(box.left),
  width: px(box.width),
  height: px(box.height),
});

const cropMarks = () => ['nw', 'ne', 'se', 'sw'].map((corner) => h('span', { class: `crop crop--${corner}`, 'aria-hidden': 'true' }));

interface Gesture {
  move(event: PointerEvent): void;
  end(): void;
}

/** Where a section's outline stops being useful: the part on screen. */
const onStage = (box: Box) => box.top + box.height > 0 && box.top < view.stageHeight;

const frameScrollY = (): number => frameDocument()?.defaultView?.scrollY ?? 0;

export const Overlay = defineComponent({
  name: 'Overlay',
  setup() {
    const root = ref<HTMLElement | null>(null);
    const ghost = ref<Cell | null>(null);
    const dropLine = ref<number | null>(null);
    let gesture: Gesture | null = null;
    let pending: { start: PointerEvent; begin: () => Gesture } | null = null;

    const canDragElements = computed(() => state.device !== 'phone');

    const stagePoint = (event: { clientX: number; clientY: number }) => {
      const rect = root.value!.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    /** The frame's pixels, counted from the top of the page. */
    const pagePoint = (event: { clientX: number; clientY: number }, scrollY: number) => {
      const point = stagePoint(event);
      return { x: point.x / view.scale, y: point.y / view.scale + scrollY };
    };

    function autoscroll(event: PointerEvent): void {
      const { y } = stagePoint(event);
      if (y < AUTOSCROLL_ZONE) scrollBy(-AUTOSCROLL_STEP);
      else if (y > view.stageHeight - AUTOSCROLL_ZONE) scrollBy(AUTOSCROLL_STEP);
    }

    /** Tracks held still for the whole drag, counted from the top of the page. */
    function freezeTracks(scrollY: number) {
      const geometry = view.grid!;
      const shift = (tracks: Track[], by: number) => tracks.map((t) => ({ ...t, start: t.start + by }));
      return { columns: geometry.columns, rows: shift(geometry.rows, scrollY), pitch: geometry.pitch };
    }

    function moveGesture(element: RawElement, box: Box, start: PointerEvent): Gesture {
      const section = selectedSection.value!;
      const base = JSON.parse(JSON.stringify(section.elements)) as RawElement[];
      const startScroll = frameScrollY();
      const tracks = freezeTracks(startScroll);
      const grabbed = pagePoint(start, startScroll);
      const offset = { x: grabbed.x - box.left / view.scale, y: grabbed.y - (box.top / view.scale + startScroll) };
      let last = '';
      return {
        move(event) {
          autoscroll(event);
          const point = pagePoint(event, frameScrollY());
          const col = nearestTrack(tracks.columns, point.x - offset.x);
          const row = nearestTrack(tracks.rows, point.y - offset.y, tracks.pitch);
          const cell = clampCell({ col, row, w: element.w, h: element.h }, element.type);
          const key = `${cell.col}:${cell.row}`;
          if (key === last) return;
          last = key;
          ghost.value = cell;
          dragElement(section.id, element.id, cell, base);
        },
        end() {
          ghost.value = null;
          endGesture();
        },
      };
    }

    function resizeGesture(element: RawElement, edge: Edge, start: PointerEvent): Gesture {
      const section = selectedSection.value!;
      const base = JSON.parse(JSON.stringify(section.elements)) as RawElement[];
      const original: Cell = { col: element.col, row: element.row, w: element.w, h: element.h };
      const tracks = freezeTracks(frameScrollY());
      let last = '';
      void start;
      return {
        move(event) {
          autoscroll(event);
          const point = pagePoint(event, frameScrollY());
          const col = edge.includes('w') ? nearestTrack(tracks.columns, point.x) : nearestEnd(tracks.columns, point.x);
          const row = edge.includes('n') ? nearestTrack(tracks.rows, point.y, tracks.pitch) : nearestEnd(tracks.rows, point.y, tracks.pitch);
          const cell = resizeTo(original, edge, col, row, element.type);
          const key = JSON.stringify(cell);
          if (key === last) return;
          last = key;
          dragElement(section.id, element.id, cell, base);
        },
        end() {
          endGesture();
        },
      };
    }

    function reorderGesture(id: string): Gesture {
      let target = sections.value.findIndex((s) => s.id === id);
      return {
        move(event) {
          autoscroll(event);
          const { y } = stagePoint(event);
          const boxes = view.sections;
          const index = boxes.findIndex((box) => y < box.top + box.height / 2);
          target = index === -1 ? boxes.length : index;
          dropLine.value = target < boxes.length ? boxes[target].top : (boxes.at(-1)?.top ?? 0) + (boxes.at(-1)?.height ?? 0);
        },
        end() {
          const from = sections.value.findIndex((s) => s.id === id);
          dropLine.value = null;
          // Hidden sections aren't on the canvas, so a position there is a position among the visible.
          const visible = sections.value.filter((s) => !s.hidden);
          const anchor = visible[target];
          const to = anchor ? sections.value.indexOf(anchor) : sections.value.length;
          moveSection(id, to > from ? to - 1 : to);
        },
      };
    }

    const startGesture = (begin: () => Gesture, event: PointerEvent, immediately = false) => {
      event.preventDefault();
      event.stopPropagation();
      root.value?.setPointerCapture(event.pointerId);
      if (immediately) gesture = begin();
      else pending = { start: event, begin };
    };

    function onPointerMove(event: PointerEvent): void {
      if (pending) {
        const moved = Math.hypot(event.clientX - pending.start.clientX, event.clientY - pending.start.clientY);
        if (moved >= DRAG_THRESHOLD) {
          gesture = pending.begin();
          pending = null;
        }
      }
      if (gesture) {
        gesture.move(event);
        return;
      }
      const { x, y } = stagePoint(event);
      const hit = hitTest(x, y);
      state.hover = hit && { section: hit.section, element: hit.element };
    }

    function onPointerDown(event: PointerEvent): void {
      if (event.button !== 0) return;
      const { x, y } = stagePoint(event);
      const hit = hitTest(x, y);
      if (!hit) {
        select(null);
        return;
      }
      const sameSection = hit.section === state.selection?.section;
      // First click picks the section; once inside it, a click picks an element.
      if (hit.element && sameSection) {
        select({ section: hit.section, element: hit.element });
        const element = selectedElement.value;
        const box = view.elements.find((e) => e.id === hit.element);
        if (element && box && canDragElements.value) startGesture(() => moveGesture(element, box, event), event);
      } else {
        select({ section: hit.section });
      }
    }

    function onPointerUp(): void {
      pending = null;
      gesture?.end();
      gesture = null;
    }

    function onDoubleClick(event: MouseEvent): void {
      const { x, y } = stagePoint(event);
      const hit = hitTest(x, y);
      if (!hit) return;
      select({ section: hit.section, element: hit.element });
      if (!hit.field) return;
      const section = sections.value.find((s) => s.id === hit.section);
      const field = section && definitionOf(section.type).fields.find((f) => f.key === hit.field);
      const inPlace = hit.element || field?.kind === 'text' || field?.kind === 'area' || field?.kind === 'lit';
      if (inPlace && fieldElement(hit.section, hit.element, hit.field)) {
        state.editing = { section: hit.section, element: hit.element, key: hit.field };
      } else {
        state.focusField = hit.field === 'tagline' ? 'line1' : hit.field;
      }
    }

    const sectionLabel = (id: string) => {
      const section = sections.value.find((s) => s.id === id);
      return section ? definitionOf(section.type).name : '';
    };

    function toolbar(box: Box): VNode {
      const section = selectedSection.value!;
      const def = definitionOf(section.type);
      const index = sections.value.indexOf(section);
      const button = (label: string, action: () => void, disabled = false) =>
        h('button', { type: 'button', class: 'tool', disabled, onClick: action, onPointerdown: (e: Event) => e.stopPropagation() }, label);
      return h(
        'div',
        {
          class: 'toolbar',
          role: 'toolbar',
          'aria-label': `${def.name} section`,
          style: { top: px(Math.max(8, Math.min(box.top + 8, view.stageHeight - 48))), right: px(16) },
        },
        [
          h(
            'button',
            {
              type: 'button',
              class: 'tool tool--grip',
              title: 'Drag to move this section',
              onPointerdown: (e: PointerEvent) => startGesture(() => reorderGesture(section.id), e, true),
            },
            'Move'
          ),
          button('Up', () => moveSection(section.id, index - 1), index === 0),
          button('Down', () => moveSection(section.id, index + 1), index === sections.value.length - 1),
          def.once ? null : button('Duplicate', () => duplicateSection(section.id)),
          // A story block has no hidden state in its file.
          page.value.raw.story ? null : button('Hide', () => toggleHidden(section.id)),
          def.required ? null : button('Delete', () => removeSection(section.id)),
        ]
      );
    }

    function insertButton(index: number, top: number): VNode {
      return h(
        'button',
        {
          type: 'button',
          class: 'insert',
          style: { top: px(top) },
          onPointerdown: (e: Event) => e.stopPropagation(),
          onClick: () => {
            state.panel = 'add';
            state.insertAt = index;
          },
        },
        'Add section'
      );
    }

    function columnGuides(): VNode | null {
      const grid = view.grid;
      if (!grid || !canDragElements.value || selectedSection.value?.type !== 'grid') return null;
      const section = view.sections.find((s) => s.id === grid.section);
      if (!section) return null;
      return h(
        'div',
        { class: 'guides', 'aria-hidden': 'true', style: { top: px(section.top), height: px(section.height) } },
        grid.columns.map((track) => h('span', { class: 'guide', style: { left: px(track.start * view.scale), width: px(track.size * view.scale) } }))
      );
    }

    function elementHandles(box: Box): VNode {
      const element = selectedElement.value!;
      const section = selectedSection.value!;
      return h('div', { class: 'selected selected--element', style: boxStyle(box) }, [
        ...cropMarks(),
        h('span', { class: 'measure', 'aria-hidden': 'true' }, `${element.w} × ${element.h}`),
        ...(canDragElements.value
          ? EDGES.map((edge) =>
              h('span', {
                class: `handle handle--${edge}`,
                'aria-hidden': 'true',
                onPointerdown: (e: PointerEvent) => startGesture(() => resizeGesture(element, edge, e), e, true),
              })
            )
          : []),
        h('div', { class: 'toolbar toolbar--element' }, [
          h('button', { type: 'button', class: 'tool', onPointerdown: (e: Event) => e.stopPropagation(), onClick: () => duplicateElement(section.id, element.id) }, 'Duplicate'),
          h('button', { type: 'button', class: 'tool', onPointerdown: (e: Event) => e.stopPropagation(), onClick: () => removeElement(section.id, element.id) }, 'Delete'),
        ]),
      ]);
    }

    return () => {
      const hoverBox = state.hover && !state.selection?.element ? view.sections.find((s) => s.id === state.hover?.section) : null;
      const selectedBox = view.sections.find((s) => s.id === state.selection?.section);
      const elementBox = view.elements.find((e) => e.id === state.selection?.element);
      const hoverIndex = hoverBox ? view.sections.indexOf(hoverBox) : -1;
      const nodes: (VNode | null)[] = [];

      nodes.push(columnGuides());

      if (hoverBox && hoverBox.id !== selectedBox?.id && onStage(hoverBox)) {
        nodes.push(
          h('div', { class: 'outline', style: boxStyle(hoverBox) }, [h('span', { class: 'tag' }, sectionLabel(hoverBox.id))])
        );
      }
      if (hoverBox && onStage(hoverBox)) {
        const position = sections.value.findIndex((s) => s.id === hoverBox.id);
        // The opener stays first, so nothing is offered above it.
        if (hoverIndex > 0) nodes.push(insertButton(position, hoverBox.top));
        nodes.push(insertButton(position + 1, hoverBox.top + hoverBox.height));
      }
      if (selectedBox && onStage(selectedBox)) {
        nodes.push(
          h('div', { class: 'selected', style: boxStyle(selectedBox) }, [
            ...cropMarks(),
            h('span', { class: 'tag tag--selected' }, sectionLabel(selectedBox.id)),
          ])
        );
        if (!elementBox) nodes.push(toolbar(selectedBox));
      }
      for (const box of view.elements) {
        if (box.id !== elementBox?.id) nodes.push(h('div', { class: 'element-outline', style: boxStyle(box) }));
      }
      if (elementBox && selectedElement.value) nodes.push(elementHandles(elementBox));
      if (dropLine.value !== null) nodes.push(h('div', { class: 'drop-line', style: { top: px(dropLine.value) } }));

      return h(
        'div',
        {
          ref: root,
          class: 'overlay',
          style: { left: px(view.stageLeft), width: px(view.frameWidth * view.scale), height: px(view.stageHeight) },
          onPointermove: onPointerMove,
          onPointerdown: onPointerDown,
          onPointerup: onPointerUp,
          onPointercancel: onPointerUp,
          onPointerleave: () => {
            if (!gesture) state.hover = null;
          },
          onDblclick: onDoubleClick,
        },
        nodes
      );
    };
  },
});

