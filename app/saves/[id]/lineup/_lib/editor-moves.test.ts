import { describe, expect, it } from "vitest";
import { BENCH_SIZE } from "@/src/engine/lineup";
import { moveToBenchFront, placeInSlot, sendSlotToBench, swapSlots, type EditorState } from "./editor-moves";

const state: EditorState = {
  formation: "4-3-3",
  starters: ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"],
  bench: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
};

describe("editor moves", () => {
  it("puts a substitute in a slot and its occupant in the substitute's place on the bench", () => {
    const next = placeInSlot(state, 9, "b3");

    expect(next.starters[9]).toBe("b3");
    expect(next.bench).toEqual(["b1", "b2", "s9", "b4", "b5", "b6", "b7"]);
  });

  it("puts a reserve in a slot and its occupant first on the bench", () => {
    const next = placeInSlot(state, 2, "r1");

    expect(next.starters[2]).toBe("r1");
    expect(next.bench).toEqual(["s2", "b1", "b2", "b3", "b4", "b5", "b6"]);
    expect(next.bench).toHaveLength(BENCH_SIZE);
  });

  it("swaps two starters, also when a starter is placed in another slot", () => {
    expect(swapSlots(state, 1, 4).starters.slice(0, 5)).toEqual(["s0", "s4", "s2", "s3", "s1"]);
    expect(placeInSlot(state, 4, "s1")).toEqual(swapSlots(state, 1, 4));
  });

  it("sends a starter to the front of the bench and leaves his slot empty", () => {
    const next = sendSlotToBench(state, 3);

    expect(next.starters[3]).toBeNull();
    expect(next.bench[0]).toBe("s3");
    expect(sendSlotToBench(next, 3)).toEqual(next);
  });

  it("moves a reserve to the front of the bench, never a starter", () => {
    expect(moveToBenchFront(state, "b5").bench).toEqual(["b5", "b1", "b2", "b3", "b4", "b6", "b7"]);
    expect(moveToBenchFront(state, "s2")).toEqual(state);
  });
});
