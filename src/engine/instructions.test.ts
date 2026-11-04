import { describe, expect, it } from "vitest";
import { instructionSpanAt, type InstructionSpan } from "./instructions";

describe("the instruction at a minute of a match", () => {
  const spans: InstructionSpan[] = [
    { from: 0, instruction: "DEFEND", source: "START" },
    { from: 60, instruction: "ATTACK", source: "ASSISTANT" },
  ];

  it("is the span started before it: a boundary's span covers the minutes after it", () => {
    expect(instructionSpanAt(spans, 0)?.instruction).toBe("DEFEND");
    expect(instructionSpanAt(spans, 1)?.instruction).toBe("DEFEND");
    expect(instructionSpanAt(spans, 60)?.instruction).toBe("DEFEND");
    expect(instructionSpanAt(spans, 61)).toEqual(spans[1]);
    expect(instructionSpanAt(spans, 94)).toEqual(spans[1]);
  });

  it("is none before the first span is kept", () => {
    expect(instructionSpanAt([], 30)).toBeNull();
    expect(instructionSpanAt([{ from: 45, instruction: "ATTACK", source: "MANAGER" }], 30)).toBeNull();
  });
});
