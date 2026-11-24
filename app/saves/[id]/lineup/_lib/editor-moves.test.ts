import { describe, expect, it } from "vitest";
import { ROTATION_FITNESS } from "@/src/engine/balance";
import { formationPositions } from "@/src/engine/formations";
import { BENCH_SIZE, selectAssistantLineup, type LineupCandidate } from "@/src/engine/lineup";
import {
  automaticState,
  moveToBenchFront,
  pinnedSheetKey,
  placeInSlot,
  restedOf,
  sendSlotToBench,
  swapSlots,
  type EditorState,
} from "./editor-moves";

const state: EditorState = {
  formation: "4-3-3",
  starters: ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"],
  bench: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
  instruction: "BALANCED",
};

type Candidate = LineupCandidate & { fitness: number };

/** Two players at each position of the 4-3-3, the first one rated 80 and rested, the second 77, then a few at 60. */
function squad(): Candidate[] {
  return formationPositions("4-3-3").flatMap((position, index) => [
    { id: `${position}${index}a`, position, overall: 80, injured: false, fitness: 100 },
    { id: `${position}${index}b`, position, overall: 77, injured: false, fitness: 100 },
  ]);
}

describe("the automatic eleven", () => {
  it("is the assistant's: a tired player rested where a rested one is hardly worse, nobody injured or suspended", () => {
    const players = squad().map((player) =>
      player.id === "RB1a"
        ? { ...player, fitness: ROTATION_FITNESS - 10 }
        : player.id === "ST9a"
          ? { ...player, suspended: true }
          : player.id === "GK0a"
            ? { ...player, injured: true }
            : player,
    );
    const next = automaticState(state, "4-3-3", players);

    expect(next.formation).toBe("4-3-3");
    expect(next.starters[1]).toBe("RB1b");
    expect(next.starters[9]).toBe("ST9b");
    expect(next.starters[0]).toBe("GK0b");
    expect(next.starters[2]).toBe("CB2a");
    // The tired one sits on the bench, where the others are not.
    expect(next.bench).toContain("RB1a");
    expect(next.bench).not.toContain("ST9a");
    expect(next.bench).not.toContain("GK0a");
  });

  it("switches the formation with it, every slot filled", () => {
    const next = automaticState(state, "4-4-2", squad());

    expect(next.formation).toBe("4-4-2");
    expect(next.starters.every((key) => key !== null)).toBe(true);
    expect(new Set(next.starters).size).toBe(11);
  });

  it("starts the Jeunesse objective's young player, as the club's match plays its assistant's eleven", () => {
    // A centre-back of 78 at his own position, two points below the first one: the assistant starts him there.
    const players = [...squad(), { id: "young", position: "CB" as const, overall: 78, injured: false, fitness: 100 }];
    const youth = { id: "young", leagueStarts: 0 };
    const next = automaticState(state, "4-3-3", players, youth);
    const lineup = selectAssistantLineup(players, formationPositions("4-3-3"), youth);

    expect(next.starters).toEqual(formationPositions("4-3-3").map((_, index) => lineup.starters.find((starter) => starter.index === index)?.player.id ?? null));
    expect(next.starters).toContain("young");
    expect(next.bench).toEqual(lineup.bench.map(({ id }) => id));
    // Without him, the rested eleven alone.
    expect(automaticState(state, "4-3-3", players).starters).not.toContain("young");
    expect(next.instruction).toBe(state.instruction);
  });
});

describe("the players the assistant rests", () => {
  it("names those the best eleven would start, tired, out of his: the most tired first", () => {
    const players = squad().map((player) =>
      player.id === "RB1a" ? { ...player, fitness: ROTATION_FITNESS - 10 } : player.id === "ST9a" ? { ...player, fitness: ROTATION_FITNESS - 3 } : player,
    );
    const rested = automaticState(state, "4-3-3", players);

    expect(restedOf(players, "4-3-3", rested.starters).map(({ id }) => id)).toEqual(["RB1a", "ST9a"]);
    // Tired but starting all the same, or not of the best eleven: not rested.
    expect(restedOf(players, "4-3-3", [...rested.starters.slice(0, 1), "RB1a", ...rested.starters.slice(2)]).map(({ id }) => id)).toEqual(["ST9a"]);
    const reserve = squad().map((player) => (player.id === "RB1b" ? { ...player, fitness: 60 } : player));
    expect(restedOf(reserve, "4-3-3", automaticState(state, "4-3-3", reserve).starters)).toEqual([]);
  });
});

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

describe("the sheet beside the pitch", () => {
  const squad = [
    { id: "a", overall: 70 },
    { id: "b", overall: 81 },
    { id: "c", overall: 81 },
  ];

  it("follows the selected slot, then the last player chosen, then the best rated", () => {
    expect(pinnedSheetKey("a", "c", squad)).toBe("a");
    expect(pinnedSheetKey(null, "c", squad)).toBe("c");
    expect(pinnedSheetKey(null, null, squad)).toBe("b");
  });

  it("forgets a player who has left the squad, and stays empty only without a squad", () => {
    expect(pinnedSheetKey(null, "sold", squad)).toBe("b");
    expect(pinnedSheetKey(null, null, [])).toBeNull();
  });
});
