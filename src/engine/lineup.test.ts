import { describe, expect, it } from "vitest";
import type { Position } from "./generation";
import { BENCH_SIZE, selectLineup, type SquadPlayer } from "./lineup";

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

const squad: SquadPlayer[] = [
  ...range("gk", "GK", [70, 75]),
  ...range("df", "DF", [60, 68, 62, 71, 65, 66, 59, 70]),
  ...range("mf", "MF", [64, 72, 61, 69, 67, 58, 73, 60]),
  ...range("fw", "FW", [74, 63, 70, 66, 71]),
];

const idsInSlot = (lineup: ReturnType<typeof selectLineup>, slot: Position): string[] =>
  lineup.starters.filter((starter) => starter.slot === slot).map((starter) => starter.player.id);

describe("selectLineup", () => {
  it("picks 1 GK, 4 DF, 3 MF and 3 FW, the best by overall at each position", () => {
    const lineup = selectLineup(squad);

    expect(idsInSlot(lineup, "GK")).toEqual(["gk-2"]);
    expect(idsInSlot(lineup, "DF")).toEqual(["df-4", "df-8", "df-2", "df-6"]);
    expect(idsInSlot(lineup, "MF")).toEqual(["mf-7", "mf-2", "mf-4"]);
    expect(idsInSlot(lineup, "FW")).toEqual(["fw-1", "fw-5", "fw-3"]);
  });

  it("names 7 substitutes, the backup goalkeeper first, none of them starting", () => {
    const lineup = selectLineup(squad);
    const starterIds = new Set(lineup.starters.map((starter) => starter.player.id));

    expect(lineup.bench).toHaveLength(BENCH_SIZE);
    expect(lineup.bench[0].id).toBe("gk-1");
    expect(lineup.bench.some((substitute) => starterIds.has(substitute.id))).toBe(false);
  });

  it("leaves injured players out of the lineup and the bench", () => {
    const injured = new Set(["gk-2", "fw-1", "df-4"]);
    const lineup = selectLineup(squad.map((member) => ({ ...member, injured: injured.has(member.id) })));
    const selected = [...lineup.starters.map((starter) => starter.player.id), ...lineup.bench.map((sub) => sub.id)];

    expect(selected.some((id) => injured.has(id))).toBe(false);
    expect(idsInSlot(lineup, "GK")).toEqual(["gk-1"]);
    expect(idsInSlot(lineup, "FW")).toEqual(["fw-5", "fw-3", "fw-4"]);
  });

  it("fills a slot left empty by injuries with the best remaining player for it", () => {
    const lineup = selectLineup(
      squad.map((member) =>
        member.position === "GK"
          ? { ...member, injured: true }
          : member.id === "df-7"
            ? { ...member, goalkeeping: 40 }
            : member,
      ),
    );

    expect(lineup.starters).toHaveLength(11);
    expect(idsInSlot(lineup, "GK")).toEqual(["df-7"]);
  });

  it("does not depend on the order of the squad", () => {
    expect(selectLineup([...squad].reverse())).toEqual(selectLineup(squad));
  });
});
