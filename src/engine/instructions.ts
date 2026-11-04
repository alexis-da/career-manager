/** What a team plays for: Attaquer, Équilibré, Fermer. In the order the screens offer them. */
export const INSTRUCTIONS = ["ATTACK", "BALANCED", "DEFEND"] as const;

export type Instruction = (typeof INSTRUCTIONS)[number];

/** The instruction a club plays for unless told otherwise: AI clubs always start with it. */
export const DEFAULT_INSTRUCTION: Instruction = "BALANCED";

export function isInstruction(value: string): value is Instruction {
  return (INSTRUCTIONS as readonly string[]).includes(value);
}

/**
 * Who set the instruction a side plays a segment with: its starting instruction (the manager's, saved with his lineup;
 * Équilibré otherwise), its assistant's rule, its manager at a pause of a live match, or a choice event's decision.
 */
export type InstructionSource = "START" | "ASSISTANT" | "MANAGER" | "EVENT";

/** An instruction a side plays with from a minute on (the minutes played when its segment starts), and who set it. */
export type InstructionSpan = { from: number; instruction: Instruction; source: InstructionSource };

/** The instruction a side plays with at a minute of its match, from its spans: the last one started before it. */
export function instructionSpanAt(spans: readonly InstructionSpan[], minute: number): InstructionSpan | null {
  let current: InstructionSpan | null = null;
  for (const span of spans) {
    // A span starting at a boundary covers the minutes after it: the 16th minute is the second segment's.
    if (span.from < Math.max(minute, 1)) {
      current = span;
    }
  }
  return current;
}
