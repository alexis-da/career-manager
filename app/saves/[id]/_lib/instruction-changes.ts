import { REGULATION_MINUTES } from "@/src/engine/balance";
import { DEFAULT_INSTRUCTION, type Instruction, type InstructionSpan } from "@/src/engine/instructions";
import type { Translator } from "@/src/i18n/translator";

// The changes of the managed club's instruction its match tells, in its feed and on its match sheet: its starting
// instruction when it is not Équilibré, then each instruction its manager (at a pause, the Coaching panel) or its assistant
// (his rule) changes to. A choice event's instruction is told by its decision (« Consigne jusqu'à la fin : fermer le
// jeu ») : not again here. Its words are messages: decisions.instruction.

/** Who changed the instruction, of those a change line names. */
export type InstructionChangeSource = Exclude<InstructionSpan["source"], "EVENT">;

/** A change of instruction as a match tells it: from the minute after its boundary, the instruction and who gave it. */
export type InstructionChange = {
  minute: number;
  period: "REGULAR" | "EXTRA_TIME";
  instruction: Instruction;
  source: InstructionChangeSource;
};

/**
 * The changes a match tells of the instructions its managed club played its segments with (the spans of its engine
 * state, or those kept with it once played): the first when it is not Équilibré, each later one whose instruction is not
 * the one before it, a choice event's left to its decision. At the minute after the boundary its segment starts at.
 */
export function instructionChanges(spans: readonly InstructionSpan[]): InstructionChange[] {
  const changes: InstructionChange[] = [];
  let previous: Instruction = DEFAULT_INSTRUCTION;
  for (const span of spans) {
    const changed = span.instruction !== previous;
    previous = span.instruction;
    if (changed && span.source !== "EVENT") {
      changes.push({
        minute: span.from + 1,
        period: span.from >= REGULATION_MINUTES ? "EXTRA_TIME" : "REGULAR",
        instruction: span.instruction,
        source: span.source,
      });
    }
  }
  return changes;
}

/** A change's line: what it is (« Consigne : Fermer ») and who gave it (« Ton coaching »). */
export function describeInstructionChange(change: InstructionChange, t: Translator<"decisions">): { title: string; detail: string } {
  return {
    title: t("instruction.change", { instruction: t(`instruction.name.${change.instruction}`) }),
    detail: t(`instruction.by.${change.source}`),
  };
}
