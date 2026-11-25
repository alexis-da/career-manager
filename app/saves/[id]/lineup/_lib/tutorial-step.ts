/** The formation's button, the player's own choice while his assistant makes the eleven. */
export const FORMATION_TARGET = '[data-testid="lineup-formation"]';

/** The tutorial's step of the line-up screen, as the page shows it: its line, what it rings, what makes its move. */
export type LineupBubble = {
  text: "lineupAssistant" | "lineup"; // its line, in tutorial.steps
  target: string; // what it rings
  doneOn: string; // a click on it is the move
};

/**
 * The tutorial's step of the line-up (docs/design/tutoriel.md § 1.3, docs/design/simplification.md § 8), at the screen's
 * opening: while the assistant makes the eleven, on the formation, its sheet opened its move; else on the slot of the
 * eleven's weak spot (`weakSlot`, its index), a slot touched its move. Nothing to save after either: every gesture is
 * saved at once (docs/design/effectif-adjoint.md § 1.8). None when the step is not due, or without a weak spot to ring.
 */
export function lineupBubbleOf(due: boolean, byAssistant: boolean, weakSlot: number): LineupBubble | null {
  if (!due) {
    return null;
  }
  if (byAssistant) {
    return { text: "lineupAssistant", target: FORMATION_TARGET, doneOn: FORMATION_TARGET };
  }
  if (weakSlot < 0) {
    return null;
  }
  return {
    text: "lineup",
    target: `[data-testid="pitch-slot"][data-slot-index="${weakSlot}"]`,
    doneOn: '[data-testid="pitch-slot"]',
  };
}
