import { describe, expect, it } from "vitest";
import type { LineupPlayer } from "@/src/db/lineup";
import { secondaryPositions, type Position } from "@/src/engine/positions";
import { placeOf, slotCandidates } from "./candidates";
import type { EditorState } from "./editor-moves";

const player = (id: string, position: Position, overall: number, more: Partial<LineupPlayer> = {}): LineupPlayer => ({
  id,
  position,
  overall,
  injured: false,
  firstName: "Test",
  lastName: id,
  age: 25,
  injuredUntil: null,
  fitness: 100,
  form: 50,
  ...more,
});

/** The first test key whose secondary positions, drawn from the key alone, do or do not include a position. */
const keyWhere = (primary: Position, wanted: Position, has: boolean): string => {
  const key = Array.from({ length: 1_000 }, (_, index) => `test#${index}`).find(
    (candidate) => secondaryPositions(candidate, primary).includes(wanted) === has,
  );
  if (key === undefined) {
    throw new Error(`No test key ${has ? "with" : "without"} ${wanted} as a secondary position of ${primary}`);
  }
  return key;
};

const SLOT_COUNT = 11;
const STRIKER_SLOT = 9; // of the 4-3-3: GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW
const MIDFIELD_SLOT = 6;

describe("where a player stands", () => {
  const state: Pick<EditorState, "starters" | "bench"> = { starters: ["a", null, "b"], bench: ["c", "d"] };

  it("is a slot, a place on the bench counted from 1, or neither", () => {
    expect(placeOf("b", state)).toEqual({ kind: "starter", slot: 2 });
    expect(placeOf("d", state)).toEqual({ kind: "substitute", number: 2 });
    expect(placeOf("e", state)).toEqual({ kind: "reserve" });
  });
});

describe("the candidates for a slot", () => {
  // The striker's slot, held by a striker. A right winger who has the striker's position among his secondary ones, a left
  // winger who has not, a centre-back, a striker on the bench, an injured one on the bench too and a suspended one in the
  // stands, and a midfielder who starts elsewhere.
  const occupant = player("occupant", "ST", 75);
  const secondary = player(keyWhere("RW", "ST", true), "RW", 72);
  const winger = player(keyWhere("LW", "ST", false), "LW", 74);
  const centreBack = player("centre-back", "CB", 80);
  const substitute = player("substitute", "ST", 66);
  const injured = player("injured", "ST", 79, { injured: true });
  const suspended = player("suspended", "ST", 60, { suspended: true });
  const midfielder = player("midfielder", "CM", 70);
  const squad = [occupant, centreBack, injured, midfielder, suspended, substitute, winger, secondary];
  const starters: (string | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  starters[STRIKER_SLOT] = occupant.id;
  starters[MIDFIELD_SLOT] = midfielder.id;
  const state = { starters, bench: [substitute.id, injured.id] };

  const candidates = slotCandidates(squad, state, STRIKER_SLOT, "ST");
  const summary = candidates.map(({ player: { id }, rating, fit, available }) => ({
    id,
    rating: Math.round(rating * 100) / 100,
    fit,
    available,
  }));

  it("leaves out the slot's own player, and lists those who can play first, best rated at the slot first", () => {
    expect(summary).toEqual([
      { id: secondary.id, rating: 69.84, fit: "secondary", available: true }, // 72 × 0.97
      { id: winger.id, rating: 68.08, fit: "line", available: true }, // 74 × 0.92
      { id: substitute.id, rating: 66, fit: "exact", available: true },
      { id: midfielder.id, rating: 56, fit: "other-line", available: true }, // 70 × 0.8
      { id: centreBack.id, rating: 48, fit: "other-line", available: true }, // 80 × 0.6
      { id: injured.id, rating: 79, fit: "exact", available: false },
      { id: suspended.id, rating: 60, fit: "exact", available: false },
    ]);
  });

  it("says where each one is now: in another slot, on the bench, or neither", () => {
    const placeOfCandidate = (id: string) => candidates.find((candidate) => candidate.player.id === id)?.place;

    expect(placeOfCandidate(midfielder.id)).toEqual({ kind: "starter", slot: MIDFIELD_SLOT });
    expect(placeOfCandidate(substitute.id)).toEqual({ kind: "substitute", number: 1 });
    expect(placeOfCandidate(injured.id)).toEqual({ kind: "substitute", number: 2 });
    expect(placeOfCandidate(winger.id)).toEqual({ kind: "reserve" });
  });

  it("lists everyone for an empty slot, and breaks ties by name, then by key, whatever the order of the squad", () => {
    const twins = [
      player("b", "ST", 70, { lastName: "Martin" }),
      player("a", "ST", 70, { lastName: "Martin" }),
      player("c", "ST", 70, { lastName: "Abel" }),
    ];
    const empty = { starters: Array.from({ length: SLOT_COUNT }, () => null), bench: [] };

    expect(slotCandidates(twins, empty, STRIKER_SLOT, "ST").map(({ player: { id } }) => id)).toEqual(["c", "a", "b"]);
    expect(slotCandidates([...twins].reverse(), empty, STRIKER_SLOT, "ST").map(({ player: { id } }) => id)).toEqual(["c", "a", "b"]);
  });
});
