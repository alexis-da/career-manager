import { instructionSpanAt, type Instruction, type InstructionSpan } from "@/src/engine/instructions";

/** The instruction the score card shows, and who set it. */
export type ShownInstruction = Pick<InstructionSpan, "instruction" | "source">;

/**
 * The instruction the managed club plays with as the live page's clock reads a minute, and who set it: its segment's, in
 * the spans the server keeps; at a boundary, where the clock holds while the next segment is asked for, that segment's
 * once it is played, so that what was decided at a pause shows as soon as the match goes on. While the match waits at a
 * pause, `decided` is the instruction the decision on its choice event gives (a late tactical choice), the event's at
 * once: it holds from the next segment, as the Coaching panel has it. None for a minute no span covers: a match over and
 * read again, its state gone, or one paused before its spans were kept.
 */
export function shownInstruction(
  spans: readonly InstructionSpan[] | null,
  minute: number,
  decided: Instruction | null,
): ShownInstruction | null {
  if (decided !== null) {
    return { instruction: decided, source: "EVENT" };
  }
  // instructionSpanAt gives a boundary to the segment it ends: the minute after it, to the segment that starts there.
  const span = spans === null ? null : instructionSpanAt(spans, minute + 1);
  return span === null ? null : { instruction: span.instruction, source: span.source };
}
