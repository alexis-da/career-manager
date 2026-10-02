import { describe, expect, it } from "vitest";
import { BENCH_SIZE, DEFAULT_FORMATION, selectLineup, type Lineup, type SquadPlayer } from "./lineup";
import type { Position } from "./positions";

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
      ["RW", "rw-1"],
      ["ST", "st-1"],
      ["LW", "lw-1"],
    ]);
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
