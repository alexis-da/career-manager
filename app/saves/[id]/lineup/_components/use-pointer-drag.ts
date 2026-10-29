"use client";

import { useRef, useState, type MouseEvent, type PointerEvent, type RefCallback } from "react";

/** What is dragged: a starter from his slot, or a player from outside the eleven. */
export type DragSource = { kind: "slot"; index: number; key: string } | { kind: "reserve"; key: string };

/** Where it can be dropped: a slot of the pitch, or the bench. */
export type DropTarget = { kind: "slot"; index: number } | { kind: "bench" };

export type DragState = { source: DragSource; x: number; y: number; over: DropTarget | null };

/** Distance the pointer must travel before a press becomes a drag: below it, it stays a click. */
const DRAG_THRESHOLD_PX = 6;

/**
 * How long a finger rests on a player before the press becomes a drag. A finger that moves sooner scrolls the page,
 * as anywhere else: the pitch and the lists, covered with players, stay scrollable by finger.
 */
const TOUCH_HOLD_MS = 250;

/**
 * During a finger's drag, how close to the top or the bottom of the screen the page scrolls by itself, and by how much
 * a frame: under the save's header, above a phone's action bar, a player can be carried from the list to the pitch.
 */
const AUTO_SCROLL_EDGE_PX = { top: 140, bottom: 110 };
const AUTO_SCROLL_STEP_PX = 12;

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

type Press = {
  source: DragSource;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  dragging: boolean;
  over: DropTarget | null;
  touch: boolean;
  held: boolean; // a mouse's or a pen's press at once, a finger's once it has rested TOUCH_HOLD_MS
  holdTimer: number | null;
};

/** The page's own scrolling a frame during a finger's drag, up or down: none away from the screen's edges. */
function autoScrollStep({ touch, dragging, y }: Press): number {
  if (!touch || !dragging) {
    return 0;
  }
  if (y < AUTO_SCROLL_EDGE_PX.top) {
    return -AUTO_SCROLL_STEP_PX;
  }
  return y > window.innerHeight - AUTO_SCROLL_EDGE_PX.bottom ? AUTO_SCROLL_STEP_PX : 0;
}

/**
 * Drag and drop with pointer events (mouse, pen and touch alike), for the lineup editor and the half-time screen. A
 * press only becomes a drag past DRAG_THRESHOLD_PX; a finger's, once it has rested TOUCH_HOLD_MS, so that a swipe
 * still scrolls the page (the sources leave touch-action alone, and a held finger's moves are kept from scrolling).
 * The click that follows a drag is swallowed, so a press that did not move stays a click. Drop targets are found under
 * the pointer by their DROP_TARGET_ATTRIBUTE. The keyboard keeps the click-click way.
 */
export function usePointerDrag(onDrop: (source: DragSource, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<Press | null>(null);
  const swallowClick = useRef(false);
  const scrollFrame = useRef<number | null>(null);

  const follow = (current: Press): void => {
    current.over = targetAt(current.x, current.y);
    setDrag({ source: current.source, x: current.x, y: current.y, over: current.over });
  };

  // Near an edge, the page scrolls under the resting finger, and what is under it changes.
  const keepScrolling = (): void => {
    const current = press.current;
    const step = current === null ? 0 : autoScrollStep(current);
    if (current === null || step === 0) {
      scrollFrame.current = null;
      return;
    }
    window.scrollBy(0, step);
    follow(current);
    scrollFrame.current = requestAnimationFrame(keepScrolling);
  };

  const end = (): void => {
    const holdTimer = press.current?.holdTimer ?? null;
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
    }
    if (scrollFrame.current !== null) {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
    }
    press.current = null;
    setDrag(null);
  };

  // Once a finger holds a player, its moves carry him instead of scrolling the page. Not passive, hence a native
  // listener: React's touch listeners are.
  const keepFromScrolling = (event: TouchEvent): void => {
    if (press.current?.touch === true && press.current.held) {
      event.preventDefault();
    }
  };

  const holdOnTouch: RefCallback<HTMLElement> = (element) => {
    element?.addEventListener("touchmove", keepFromScrolling, { passive: false });
    return () => element?.removeEventListener("touchmove", keepFromScrolling);
  };

  const sourceProps = (source: DragSource) => ({
    ref: holdOnTouch,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      swallowClick.current = false;
      if (event.button !== 0) {
        return;
      }
      const touch = event.pointerType === "touch";
      const current: Press = {
        source,
        pointerId: event.pointerId,
        x0: event.clientX,
        y0: event.clientY,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
        over: null,
        touch,
        held: !touch,
        holdTimer: null,
      };
      press.current = current;
      if (touch) {
        // A finger's own pointer is captured by the element it pressed; after the hold, the player lifts at once.
        current.holdTimer = window.setTimeout(() => {
          if (press.current === current) {
            current.holdTimer = null;
            current.held = true;
            current.dragging = true;
            follow(current);
          }
        }, TOUCH_HOLD_MS);
      } else {
        // Keeps the pointer's events on the source while it moves over the pitch or the bench.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = press.current;
      if (current === null || current.pointerId !== event.pointerId) {
        return;
      }
      current.x = event.clientX;
      current.y = event.clientY;
      // A finger that moves before its hold scrolls the page: the browser takes it over, and cancels the pointer.
      if (!current.held) {
        return;
      }
      if (!current.dragging) {
        if (Math.hypot(event.clientX - current.x0, event.clientY - current.y0) < DRAG_THRESHOLD_PX) {
          return;
        }
        current.dragging = true;
      }
      follow(current);
      if (scrollFrame.current === null && autoScrollStep(current) !== 0) {
        scrollFrame.current = requestAnimationFrame(keepScrolling);
      }
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
    // A long press of a finger is a drag, not the browser's menu.
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (press.current?.touch === true) {
        event.preventDefault();
      }
    },
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
