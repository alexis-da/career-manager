"use client";

import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** What is dragged: a starter from his slot, or a player from outside the eleven. */
export type DragSource = { kind: "slot"; index: number; key: string } | { kind: "reserve"; key: string };

/** Where it can be dropped: a slot of the pitch, or the bench. */
export type DropTarget = { kind: "slot"; index: number } | { kind: "bench" };

export type DragState = { source: DragSource; x: number; y: number; over: DropTarget | null };

/** Distance the pointer must travel before a press becomes a drag: below it, it stays a click. */
const DRAG_THRESHOLD_PX = 6;

/** Attribute marking a drop target: data-drop-target="slot:3" or "bench". */
const DROP_TARGET_ATTRIBUTE = "data-drop-target";

export const slotTarget = (index: number): string => `slot:${index}`;
export const BENCH_TARGET = "bench";

function targetAt(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y)?.closest(`[${DROP_TARGET_ATTRIBUTE}]`);
  const value = element?.getAttribute(DROP_TARGET_ATTRIBUTE);
  if (value === BENCH_TARGET) {
    return { kind: "bench" };
  }
  const index = value?.startsWith("slot:") === true ? Number(value.slice("slot:".length)) : Number.NaN;
  return Number.isInteger(index) ? { kind: "slot", index } : null;
}

type Press = { source: DragSource; pointerId: number; x0: number; y0: number; dragging: boolean; over: DropTarget | null };

/**
 * Drag and drop with pointer events (mouse, pen and touch alike), for the lineup editor. A press only becomes a drag
 * past DRAG_THRESHOLD_PX; the click that follows a drag is swallowed, so a press that did not move stays a click.
 * Drop targets are found under the pointer by their DROP_TARGET_ATTRIBUTE. The keyboard keeps the click-click way.
 */
export function usePointerDrag(onDrop: (source: DragSource, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<Press | null>(null);
  const swallowClick = useRef(false);

  const end = (): void => {
    press.current = null;
    setDrag(null);
  };

  const sourceProps = (source: DragSource) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      swallowClick.current = false;
      if (event.button !== 0) {
        return;
      }
      press.current = { source, pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, dragging: false, over: null };
      // Keeps the pointer's events on the source while it moves over the pitch or the bench.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = press.current;
      if (current === null || current.pointerId !== event.pointerId) {
        return;
      }
      if (!current.dragging) {
        if (Math.hypot(event.clientX - current.x0, event.clientY - current.y0) < DRAG_THRESHOLD_PX) {
          return;
        }
        current.dragging = true;
      }
      current.over = targetAt(event.clientX, event.clientY);
      setDrag({ source: current.source, x: event.clientX, y: event.clientY, over: current.over });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const current = press.current;
      if (current === null || current.pointerId !== event.pointerId) {
        return;
      }
      end();
      if (current.dragging) {
        swallowClick.current = true;
        if (current.over !== null) {
          onDrop(current.source, current.over);
        }
      }
    },
    onPointerCancel: end,
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  });

  return { drag, sourceProps };
}

export type DragSourceProps = ReturnType<ReturnType<typeof usePointerDrag>["sourceProps"]>;
