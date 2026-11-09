import { describe, expect, it } from "vitest";
import type { InstructionSpan } from "@/src/engine/instructions";
import { testTranslator } from "@/src/i18n/test-intl";
import { describeInstructionChange, instructionChanges } from "./instruction-changes";

const span = (from: number, instruction: InstructionSpan["instruction"], source: InstructionSpan["source"]): InstructionSpan => ({
  from,
  instruction,
  source,
});

describe("instructionChanges", () => {
  it("tells a starting instruction other than Équilibré, then each instruction that changes, from the minute after", () => {
    const spans = [
      span(0, "DEFEND", "START"),
      span(15, "DEFEND", "ASSISTANT"),
      span(45, "ATTACK", "MANAGER"),
      span(60, "ATTACK", "MANAGER"),
      span(75, "BALANCED", "ASSISTANT"),
      span(90, "DEFEND", "ASSISTANT"),
    ];

    expect(instructionChanges(spans)).toEqual([
      { minute: 1, period: "REGULAR", instruction: "DEFEND", source: "START" },
      { minute: 46, period: "REGULAR", instruction: "ATTACK", source: "MANAGER" },
      { minute: 76, period: "REGULAR", instruction: "BALANCED", source: "ASSISTANT" },
      { minute: 91, period: "EXTRA_TIME", instruction: "DEFEND", source: "ASSISTANT" },
    ]);
  });

  it("tells nothing of a match played Équilibré, nor of a choice event's instruction, which its decision tells", () => {
    expect(instructionChanges([span(0, "BALANCED", "START"), span(15, "BALANCED", "ASSISTANT")])).toEqual([]);
    expect(instructionChanges([span(0, "BALANCED", "START"), span(60, "DEFEND", "EVENT"), span(75, "DEFEND", "EVENT")])).toEqual([]);
    // After a choice event, a change is one from its instruction.
    expect(instructionChanges([span(0, "BALANCED", "START"), span(60, "DEFEND", "EVENT"), span(90, "BALANCED", "ASSISTANT")])).toEqual([
      { minute: 91, period: "EXTRA_TIME", instruction: "BALANCED", source: "ASSISTANT" },
    ]);
    expect(instructionChanges([])).toEqual([]);
  });
});

describe("describeInstructionChange", () => {
  it("names the instruction and who gave it, in French and in English", () => {
    const change = { minute: 46, period: "REGULAR" as const, instruction: "DEFEND" as const, source: "MANAGER" as const };

    expect(describeInstructionChange(change, testTranslator("fr", "decisions"))).toEqual({ title: "Consigne : Fermer", detail: "Ton coaching" });
    expect(describeInstructionChange({ ...change, source: "START" }, testTranslator("en", "decisions"))).toEqual({
      title: "Instruction: Sit back",
      detail: "Starting instruction",
    });
  });
});
