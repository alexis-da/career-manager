/** The formation's button, the player's own choice while his assistant makes the eleven. */
export const FORMATION_TARGET = '[data-testid="lineup-formation"]';

/** « Enregistrer », the move a slot's touch leads to while the player makes his own eleven. */
export const SAVE_TARGET = '[data-testid="lineup-save"]';

/** The tutorial's step of the line-up screen, as the page shows it: its line, what it rings, what makes its move. */
export type LineupBubble = {
  text: "lineupAssistant" | "lineup"; // its line, in tutorial.steps
  target: string; // what it rings
  doneOn: string; // a click on it is the move
  followUp: boolean; // once the move is made, « lineupPick » rings « Enregistrer »
};

/**
 * The tutorial's step of the line-up (docs/design/tutoriel.md § 1.3, docs/design/simplification.md § 8), at the screen's
 * opening: while the assistant makes the eleven, on the formation, its sheet opened its move, nothing to save after it;
 * else on the slot of the eleven's weak spot (`weakSlot`, its index), a slot touched its move, then « Enregistrer ». None
 * when the step is not due, or without a weak spot to ring.
 */
export function lineupBubbleOf(due: boolean, byAssistant: boolean, weakSlot: number): LineupBubble | null {
  if (!due) {
    return null;
  }
  if (byAssistant) {
    return { text: "lineupAssistant", target: FORMATION_TARGET, doneOn: FORMATION_TARGET, followUp: false };
  }
  if (weakSlot < 0) {
    return null;
  }
  return {
    text: "lineup",
    target: `[data-testid="pitch-slot"][data-slot-index="${weakSlot}"]`,
    // A slot touched is its move (« Enregistrer » too, the follow-up then moot).
    doneOn: `[data-testid="pitch-slot"], ${SAVE_TARGET}`,
    followUp: true,
  };
}
