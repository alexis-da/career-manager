import { describe, expect, it } from "vitest";
import type { InstructionSpan } from "@/src/engine/instructions";
import { shownInstruction } from "./live-instruction";

// A match started closed, its assistant attacking from 60' on, the club behind.
const STARTED: InstructionSpan = { from: 0, instruction: "DEFEND", source: "START" };
const CHASING: InstructionSpan = { from: 60, instruction: "ATTACK", source: "ASSISTANT" };
const SPANS = [STARTED, CHASING];

describe("the instruction the score card shows", () => {
  it("is the starting one from kick-off, its first segment's", () => {
    expect(shownInstruction(SPANS, 0, null)).toEqual({ instruction: "DEFEND", source: "START" });
    expect(shownInstruction(SPANS, 1, null)).toEqual({ instruction: "DEFEND", source: "START" });
    expect(shownInstruction(SPANS, 59, null)).toEqual({ instruction: "DEFEND", source: "START" });
  });

  it("changes at the boundary once the next segment is played, the clock holding there while it is asked for", () => {
    expect(shownInstruction(SPANS, 60, null)).toEqual({ instruction: "ATTACK", source: "ASSISTANT" });
    expect(shownInstruction(SPANS, 75, null)).toEqual({ instruction: "ATTACK", source: "ASSISTANT" });
    // Waiting at 60', its next segment not played: the one the club has just played with.
    expect(shownInstruction([STARTED], 60, null)).toEqual({ instruction: "DEFEND", source: "START" });
  });

  it("shows the manager's from the pause he gave it at, once the match goes on", () => {
    const given: InstructionSpan = { from: 45, instruction: "ATTACK", source: "MANAGER" };
    expect(shownInstruction([STARTED], 45, null)).toEqual({ instruction: "DEFEND", source: "START" });
    expect(shownInstruction([STARTED, given], 45, null)).toEqual({ instruction: "ATTACK", source: "MANAGER" });
    expect(shownInstruction([STARTED, given], 46, null)).toEqual({ instruction: "ATTACK", source: "MANAGER" });
  });

  it("shows at once the instruction a choice event's decision gives at a pause, the event's", () => {
    expect(shownInstruction([STARTED], 75, "BALANCED")).toEqual({ instruction: "BALANCED", source: "EVENT" });
    // Once played on, the spans have it from that boundary: nothing changes as the clock goes on from it.
    const decided: InstructionSpan = { from: 75, instruction: "BALANCED", source: "EVENT" };
    expect(shownInstruction([STARTED, decided], 75, null)).toEqual({ instruction: "BALANCED", source: "EVENT" });
  });

  it("goes on into extra time, from its own spans", () => {
    const extraTime: InstructionSpan = { from: 90, instruction: "DEFEND", source: "START" };
    expect(shownInstruction([...SPANS, extraTime], 89, null)).toEqual({ instruction: "ATTACK", source: "ASSISTANT" });
    expect(shownInstruction([...SPANS, extraTime], 90, null)).toEqual({ instruction: "DEFEND", source: "START" });
    expect(shownInstruction([...SPANS, extraTime], 120, null)).toEqual({ instruction: "DEFEND", source: "START" });
  });

  it("shows none where the spans say nothing: a match over read again, or minutes played before they were kept", () => {
    expect(shownInstruction(null, 30, null)).toBeNull();
    expect(shownInstruction([], 30, null)).toBeNull();
    expect(shownInstruction([CHASING], 30, null)).toBeNull();
  });
});
