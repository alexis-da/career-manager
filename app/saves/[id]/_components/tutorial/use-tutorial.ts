"use client";

import { useCallback } from "react";
import type { TutorialEvent } from "@/src/lib/tutorial";
import { tutorialStepAction } from "../../tutorial/actions";

/**
 * How a screen tells the server what its tutorial's bubbles and lines do: shown, closed. Fire and forget: the tutorial is
 * never part of the game, a failure costs a count and nothing else.
 */
export function useTutorialEvents(saveId: string): (events: TutorialEvent[]) => void {
  return useCallback(
    (events: TutorialEvent[]) => {
      void tutorialStepAction(saveId, events).catch((error: unknown) => {
        console.warn("[tutorial] an event was not recorded", error);
      });
    },
    [saveId],
  );
}

/** Whether a modal sheet is open over the page: its own Escape is its own. */
export const modalOpen = (): boolean => document.querySelector('[role="dialog"][data-open]') !== null;
