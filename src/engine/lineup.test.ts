import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { FORMATION_NAMES, formationPositions } from "./formations";
import {
  autoFilledSlots,
  averageStarterRating,
  BENCH_SIZE,
  changeFormation,
  DEFAULT_FORMATION,
  maxRotationGap,
  resolveLineup,
  restedLineups,
  selectLineup,
  selectRestedLineup,
  type Lineup,
  type SavedLineup,
  type SquadPlayer,
} from "./lineup";
import { POSITIONS, ratingAt, secondaryPositions, type Position } from "./positions";

function player(id: string, position: Position, overall: number, overrides: Partial<SquadPlayer> = {}): SquadPlayer {
  return {
    id,
    position,
    overall,
    pace: overall,
    shooting: overall,
    passing: overall,
    dribbling: overall,
    defending: overall,
    physical: overall,
    goalkeeping: position === "GK" ? overall : 10,
    form: 50,
    morale: 50,
    fitness: 100,
    injured: false,
    ...overrides,
  };
}

const range = (prefix: string, position: Position, overalls: number[]): SquadPlayer[] =>
  overalls.map((overall, index) => player(`${prefix}-${index + 1}`, position, overall));

// The 23 of the squad template: 2 GK, 2 RB, 4 CB, 2 LB, 2 CDM, 3 CM, 2 CAM, RM + RW, LM + LW, 2 ST.
const squad: SquadPlayer[] = [
  ...range("gk", "GK", [70, 75]),
  ...range("rb", "RB", [66, 62]),
  ...range("cb", "CB", [71, 68, 65, 60]),
  ...range("lb", "LB", [64, 59]),
  ...range("cdm", "CDM", [69, 61]),
  ...range("cm", "CM", [72, 67, 58]),
  ...range("cam", "CAM", [73, 63]),
  player("rm-1", "RM", 65),
  player("rw-1", "RW", 70),
  player("lm-1", "LM", 64),
  player("lw-1", "LW", 68),
  ...range("st", "ST", [74, 66]),
];

const startersOf = (lineup: Lineup): [Position, string][] =>
  lineup.starters.map(({ slot, player: starter }) => [slot, starter.id]);

describe("selectLineup", () => {
  it("fills the 11 slots of the 4-3-3 in order, the best rated player in each, nobody twice", () => {
    const lineup = selectLineup(squad);
    const ids = lineup.starters.map((starter) => starter.player.id);

    expect(lineup.starters.map((starter) => starter.slot)).toEqual(DEFAULT_FORMATION);
    expect(new Set(ids).size).toBe(11);
    expect(startersOf(lineup)).toEqual([
      ["GK", "gk-2"],
      ["RB", "rb-1"],
      ["CB", "cb-1"],
      ["CB", "cb-2"],
      ["LB", "lb-1"],
      ["CDM", "cdm-1"],
      ["CM", "cm-1"],
      // cam-1 (73 × 0.92 = 67.16) edges cm-2 (67): another midfield position, still the better player here.
      ["CM", "cam-1"],
      // st-1 has right wing among his secondary positions: 74 × 0.97 = 71.78 edges rw-1 (70), and st-2 plays up front.
      ["RW", "st-1"],
      ["ST", "st-2"],
      ["LW", "lw-1"],
    ]);
    expect(secondaryPositions("st-1", "ST")).toContain("RW");
  });

  it("prefers a right-back rated 70 to a centre-back rated 74 at right-back", () => {
    const lineup = selectLineup([player("dc", "CB", 74), player("dd", "RB", 70)], ["RB"]);

    expect(startersOf(lineup)).toEqual([["RB", "dd"]]);
  });

  it("names 7 substitutes, the backup goalkeeper first, none of them starting", () => {
    const lineup = selectLineup(squad);
    const starterIds = new Set(lineup.starters.map((starter) => starter.player.id));

    expect(lineup.bench).toHaveLength(BENCH_SIZE);
    expect(lineup.bench[0].id).toBe("gk-1");
    expect(lineup.bench.some((substitute) => starterIds.has(substitute.id))).toBe(false);
  });

  it("leaves injured players out of the lineup and the bench", () => {
    const injured = new Set(["gk-2", "st-1", "rb-1"]);
    const lineup = selectLineup(squad.map((member) => ({ ...member, injured: injured.has(member.id) })));
    const selected = [...lineup.starters.map((starter) => starter.player.id), ...lineup.bench.map((sub) => sub.id)];

    expect(selected.some((id) => injured.has(id))).toBe(false);
    expect(startersOf(lineup)).toContainEqual(["GK", "gk-1"]);
    // At right-back, the best centre-back (71 × 0.92 = 65.32) beats the other right-back (62).
    expect(startersOf(lineup)[1]).toEqual(["RB", "cb-1"]);
    expect(startersOf(lineup)).toContainEqual(["ST", "st-2"]);
  });

  it("puts the best rated outfield player in goal when every goalkeeper is injured", () => {
    const lineup = selectLineup(squad.map((member) => (member.position === "GK" ? { ...member, injured: true } : member)));

    expect(lineup.starters).toHaveLength(11);
    expect(startersOf(lineup)[0]).toEqual(["GK", "st-1"]);
  });

  it("breaks rating ties by id and does not depend on the order of the squad", () => {
    const twins = [player("b", "ST", 70), player("a", "ST", 70)];

    expect(startersOf(selectLineup(twins, ["ST"]))).toEqual([["ST", "a"]]);
    expect(selectLineup([...squad].reverse())).toEqual(selectLineup(squad));
    expect(selectLineup(squad)).toEqual(selectLineup(squad));
  });
});

describe("selectRestedLineup", () => {
  const tired = (id: string, position: Position, overall: number, fitness: number) => player(id, position, overall, { fitness });

  it("picks selectLineup's eleven when nobody is below 75 of fitness", () => {
    const fit = squad.map((member, index) => ({ ...member, fitness: 75 + (index % 26) }));

    expect(selectRestedLineup(fit)).toEqual(selectLineup(fit));
  });

  it("gives way for 5 points at 75 of fitness, 2 more for each point below", () => {
    expect([75, 74, 70, 65, 60, 100].map(maxRotationGap)).toEqual([5, 7, 15, 25, 35, 5]);
  });

  it("rests a player below 75 for a rested one at most that much worse in his slot, and only then", () => {
    // At 74, 7 points.
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 74), player("b", "ST", 73)], ["ST"]))).toEqual([["ST", "b"]]);
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 74), player("b", "ST", 72)], ["ST"]))).toEqual([["ST", "a"]]);
    // At 70, 15 points.
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 70), player("b", "ST", 76)], ["ST"]))).toEqual([["ST", "b"]]);
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 70), player("b", "ST", 65)], ["ST"]))).toEqual([["ST", "b"]]);
    // More than that worse, tired as well, or the player not tired enough: he plays.
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 70), player("b", "ST", 64)], ["ST"]))).toEqual([["ST", "a"]]);
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 70), tired("b", "ST", 79, 60)], ["ST"]))).toEqual([["ST", "a"]]);
    expect(startersOf(selectRestedLineup([tired("a", "ST", 80, 75), player("b", "ST", 79)], ["ST"]))).toEqual([["ST", "a"]]);
  });

  it("may still start a tired player in a later slot, or sit him on the bench", () => {
    const players = [tired("a", "ST", 80, 70), player("b", "ST", 76), player("c", "ST", 60)];

    expect(startersOf(selectRestedLineup(players, ["ST", "ST"]))).toEqual([["ST", "b"], ["ST", "a"]]);
    const rested = selectRestedLineup([...players, player("d", "ST", 78)], ["ST", "ST"]);
    expect(startersOf(rested)).toEqual([["ST", "d"], ["ST", "b"]]);
    expect(rested.bench.map((substitute) => substitute.id)).toContain("a");
  });

  it("rests the goalkeeper too, and does not depend on the order of the squad", () => {
    const weary = squad.map((member) => (member.id === "gk-2" ? { ...member, fitness: 60 } : member));

    // gk-1 (70) is 5 points below gk-2 (75), at 60 of fitness: he plays, gk-2 is the backup on the bench.
    expect(startersOf(selectRestedLineup(weary))[0]).toEqual(["GK", "gk-1"]);
    expect(selectRestedLineup(weary).bench[0].id).toBe("gk-2");
    expect(selectRestedLineup([...weary].reverse())).toEqual(selectRestedLineup(weary));
  });
});

describe("restedLineups", () => {
  // Squads drawn from a fixed seed: any position, overalls close enough to tie, a third of the players tired, some
  // injured or suspended, a few squads too short for an eleven.
  const drawnSquad = (seed: number): SquadPlayer[] => {
    const rng = makeRng(`rested-lineups:${seed}`);
    return Array.from({ length: 6 + Math.floor(rng() * 24) }, (_, index) => {
      const roll = rng();
      const position = POSITIONS[Math.floor(rng() * POSITIONS.length)];
      return player(`p${seed}-${index}`, position, 60 + Math.floor(rng() * 8), {
        fitness: rng() < 0.33 ? 55 + Math.floor(rng() * 20) : 75 + Math.floor(rng() * 26),
        injured: roll < 0.05,
        suspended: roll > 0.95,
      });
    });
  };

  it("picks selectRestedLineup's eleven and bench in every formation, for any squad", () => {
    for (let seed = 0; seed < 200; seed++) {
      const players = drawnSquad(seed);
      const lineupIn = restedLineups(players);
      for (const formation of FORMATION_NAMES) {
        const positions = formationPositions(formation);
        expect(lineupIn(positions)).toEqual(selectRestedLineup(players, positions));
      }
    }
  });
});

describe("resolveLineup", () => {
  // A 4-4-2 picked by the manager: the backup goalkeeper, second choices, a playmaker up front.
  const saved: SavedLineup = {
    starters: ["gk-1", "rb-2", "cb-3", "cb-4", "lb-2", "rm-1", "cm-2", "cm-3", "lm-1", "st-2", "cam-2"].map(
      (playerKey, slot) => ({ slot, playerKey }),
    ),
    benchOrder: ["st-1", "gk-2"],
  };
  const savedKeys = saved.starters.map((starter) => starter.playerKey);
  const keysOf = (lineup: Lineup): string[] => lineup.starters.map((starter) => starter.player.id);
  const withSlots = (changes: Record<number, string>): SavedLineup => ({
    ...saved,
    starters: saved.starters.map((starter) => ({ ...starter, playerKey: changes[starter.slot] ?? starter.playerKey })),
  });

  it("plays a complete saved lineup as saved, with the saved substitutes first on the bench", () => {
    const lineup = resolveLineup("4-4-2", saved, squad);

    expect(keysOf(lineup)).toEqual(savedKeys);
    expect(lineup.starters.map((starter) => starter.slot)).toEqual(formationPositions("4-4-2"));
    expect(lineup.starters.map((starter) => starter.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lineup.bench.slice(0, 2).map((player) => player.id)).toEqual(["st-1", "gk-2"]);
    expect(lineup.bench).toHaveLength(BENCH_SIZE);
  });

  it("refills only the slot of an injured starter, with the best rated available player", () => {
    const lineup = resolveLineup(
      "4-4-2",
      saved,
      squad.map((member) => (member.id === "cb-3" ? { ...member, injured: true } : member)),
    );

    // cb-1 (71) is the best centre-back left; every other slot keeps its saved player.
    expect(keysOf(lineup)).toEqual(savedKeys.map((key) => (key === "cb-3" ? "cb-1" : key)));
  });

  it("refills the slot of a player who left the squad", () => {
    const lineup = resolveLineup(
      "4-4-2",
      saved,
      squad.filter((member) => member.id !== "st-2"),
    );

    expect(keysOf(lineup)).toEqual(savedKeys.map((key) => (key === "st-2" ? "st-1" : key)));
    expect(lineup.bench.map((player) => player.id)).not.toContain("st-1");
  });

  it("keeps a player saved twice in his first slot only and refills the other", () => {
    const lineup = resolveLineup("4-4-2", withSlots({ 10: "st-2" }), squad);

    expect(keysOf(lineup)).toEqual([...savedKeys.slice(0, 10), "st-1"]);
    expect(new Set(keysOf(lineup)).size).toBe(11);
  });

  it("picks everything automatically without a saved lineup, as selectLineup does", () => {
    expect(resolveLineup("4-3-3", null, squad)).toEqual(selectLineup(squad));
    expect(resolveLineup("4-4-2", null, squad)).toEqual(selectLineup(squad, formationPositions("4-4-2")));
    expect(resolveLineup("3-5-2", { starters: [], benchOrder: [] }, squad)).toEqual(
      selectLineup(squad, formationPositions("3-5-2")),
    );
  });

  it("ignores saved slots outside the formation and substitutes who start or left", () => {
    const lineup = resolveLineup(
      "4-4-2",
      { starters: [...saved.starters, { slot: 11, playerKey: "st-1" }], benchOrder: ["cam-2", "gone", "st-1"] },
      squad,
    );

    expect(keysOf(lineup)).toEqual(savedKeys);
    expect(lineup.bench[0].id).toBe("st-1");
  });

  it("counts the starters picked automatically in place of the saved ones", () => {
    const injuredCentreBack = squad.map((member) => (member.id === "cb-3" ? { ...member, injured: true } : member));
    const withoutStriker = injuredCentreBack.filter((member) => member.id !== "st-2");

    expect(autoFilledSlots(saved, resolveLineup("4-4-2", saved, squad))).toBe(0);
    expect(autoFilledSlots(saved, resolveLineup("4-4-2", saved, injuredCentreBack))).toBe(1);
    expect(autoFilledSlots(saved, resolveLineup("4-4-2", saved, withoutStriker))).toBe(2);
    expect(autoFilledSlots(withSlots({ 10: "st-2" }), resolveLineup("4-4-2", withSlots({ 10: "st-2" }), squad))).toBe(1);
    const nineSaved = { ...saved, starters: saved.starters.slice(0, 9) };
    expect(autoFilledSlots(nineSaved, resolveLineup("4-4-2", nineSaved, squad))).toBe(2);
  });

  it("counts nothing for an eleven picked automatically by choice", () => {
    expect(autoFilledSlots(null, resolveLineup("4-3-3", null, squad))).toBe(0);
    expect(autoFilledSlots({ starters: [], benchOrder: [] }, selectLineup(squad))).toBe(0);
  });

  it("is deterministic and does not depend on the order of the squad", () => {
    const injured = squad.map((member) => (member.id === "rm-1" ? { ...member, injured: true } : member));

    expect(resolveLineup("4-4-2", saved, injured)).toEqual(resolveLineup("4-4-2", saved, injured));
    expect(resolveLineup("4-4-2", saved, [...injured].reverse())).toEqual(resolveLineup("4-4-2", saved, injured));
  });
});

describe("changeFormation", () => {
  const starters = selectLineup(squad).starters.map((starter) => starter.player.id);

  it("keeps the starters whose position or line still has a slot, and fills the rest automatically", () => {
    const next = changeFormation("4-3-3", "4-4-2", starters, squad);

    // GK, back four and the two central midfielders keep their position; the striker stays up front.
    expect(next.slice(0, 5)).toEqual(starters.slice(0, 5));
    expect(next.slice(6, 8)).toEqual([starters[6], starters[7]]);
    expect(next[9]).toBe(starters[9]);
    expect(new Set(next).size).toBe(11);
    expect(next.every((key) => key !== null)).toBe(true);
  });

  it("is deterministic and leaves the starters unchanged when the formation stays", () => {
    expect(changeFormation("4-3-3", "4-3-3", starters, squad)).toEqual(starters);
    expect(changeFormation("4-3-3", "3-5-2", starters, squad)).toEqual(changeFormation("4-3-3", "3-5-2", starters, squad));
  });
});

describe("averageStarterRating", () => {
  it("averages the starters' ratings in the slots they play, out of position included", () => {
    const lineup = selectLineup(squad);
    const expected = lineup.starters.reduce((sum, { player: starter, slot }) => sum + ratingAt(starter, slot), 0) / 11;

    expect(averageStarterRating(lineup)).toBeCloseTo(expected, 10);
    // A centre-back moved to the right-back slot counts at 92 % of his rating.
    const moved: Lineup = { ...lineup, starters: [{ ...lineup.starters[0], player: player("cb", "CB", 80), slot: "RB" }] };
    expect(averageStarterRating(moved)).toBeCloseTo(80 * 0.92, 10);
  });

  it("is 0 for an empty eleven", () => {
    expect(averageStarterRating({ starters: [], bench: [] })).toBe(0);
  });
});
