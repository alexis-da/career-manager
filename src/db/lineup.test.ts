import "dotenv/config";
import { describe, expect, it } from "vitest";
import { FORMATION_NAMES, formationPositions } from "../engine/formations";
import { resolveLineup, type LineupCandidate } from "../engine/lineup";
import type { Position } from "../engine/positions";

const starters = (count: number) => Array.from({ length: count }, (_, slot) => ({ slot, playerKey: `club#${slot + 1}` }));

// The module creates the Prisma client on import, which needs DATABASE_URL; no query runs here.
describe.skipIf(process.env.DATABASE_URL === undefined)("lineupInputSchema", () => {
  it("accepts a full eleven and refuses an incomplete one with its issue", async () => {
    const { lineupInputSchema, lineupIssueOf } = await import("./lineup");

    expect(lineupInputSchema.safeParse({ formation: "4-4-2", lineup: { starters: starters(11), benchOrder: [] } }).success).toBe(true);
    const incomplete = lineupInputSchema.safeParse({ formation: "4-4-2", lineup: { starters: starters(10), benchOrder: [] } });
    expect(incomplete.success).toBe(false);
    expect(incomplete.error === undefined ? null : lineupIssueOf(incomplete.error)).toBe("incomplete");
  });

  it("keeps the starting instruction saved with the lineup, none for a lineup saved before it was asked", async () => {
    const { lineupInputSchema, parseSavedLineup } = await import("./lineup");
    const lineup = { starters: starters(11), benchOrder: [] };

    expect(lineupInputSchema.safeParse({ formation: "4-4-2", lineup: { ...lineup, instruction: "DEFEND" } }).data?.lineup.instruction).toBe("DEFEND");
    expect(lineupInputSchema.safeParse({ formation: "4-4-2", lineup: { ...lineup, instruction: "PARK_THE_BUS" } }).success).toBe(false);
    expect(parseSavedLineup({ ...lineup, instruction: "ATTACK" })?.instruction).toBe("ATTACK");
    expect(parseSavedLineup(lineup)?.instruction).toBeUndefined();
  });

  it("refuses a slot or a player given twice, and an unknown formation", async () => {
    const { lineupInputSchema } = await import("./lineup");
    const twice = [...starters(10), { slot: 9, playerKey: "club#99" }];
    const sameKey = [...starters(10), { slot: 10, playerKey: "club#1" }];

    expect(lineupInputSchema.safeParse({ formation: "4-4-2", lineup: { starters: twice, benchOrder: [] } }).success).toBe(false);
    expect(lineupInputSchema.safeParse({ formation: "4-4-2", lineup: { starters: sameKey, benchOrder: [] } }).success).toBe(false);
    expect(lineupInputSchema.safeParse({ formation: "4-4-3", lineup: { starters: starters(11), benchOrder: [] } }).success).toBe(false);
  });
});

/**
 * The seven formations of gameplay v1, slot by slot, as lineups were saved with them: ClubSave.formation keeps the
 * formation's name, ClubSave.lineup a player key per slot index. Gameplay v2 adds formations and relabels three of these,
 * never renaming one nor reordering its slots: a lineup saved before reads back the same.
 */
const LEGACY_FORMATIONS: Readonly<Record<string, readonly Position[]>> = {
  "4-3-3": ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CM", "RW", "ST", "LW"],
  "4-4-2": ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"],
  "4-2-3-1": ["GK", "RB", "CB", "CB", "LB", "CDM", "CDM", "RW", "CAM", "LW", "ST"],
  "4-1-4-1": ["GK", "RB", "CB", "CB", "LB", "CDM", "RM", "CM", "CM", "LM", "ST"],
  "3-5-2": ["GK", "CB", "CB", "CB", "CDM", "CDM", "RM", "CAM", "LM", "ST", "ST"],
  "3-4-3": ["GK", "CB", "CB", "CB", "RM", "CM", "CM", "LM", "RW", "ST", "LW"],
  "5-3-2": ["GK", "RB", "CB", "CB", "CB", "LB", "CM", "CDM", "CM", "ST", "ST"],
};

describe.skipIf(process.env.DATABASE_URL === undefined)("a lineup saved before gameplay v2", () => {
  it.each(Object.entries(LEGACY_FORMATIONS))("in the %s reads back the same: its formation, each player in his slot", async (name, positions) => {
    const { parseFormation, parseSavedLineup } = await import("./lineup");
    // As the club's row kept it, through JSON: the formation's name, a player key per slot index, a substitute.
    const stored = JSON.parse(
      JSON.stringify({
        formation: name,
        lineup: { starters: positions.map((_, slot) => ({ slot, playerKey: `club#${slot}` })), benchOrder: ["club#11"] },
      }),
    ) as { formation: string; lineup: unknown };
    const squad: LineupCandidate[] = [
      ...positions.map((position, slot) => ({ id: `club#${slot}`, position, overall: 70, injured: false })),
      { id: "club#11", position: "CM", overall: 60, injured: false },
    ];

    // Its own formation, not the 4-3-3 an unknown name falls back on, its slots in the same order.
    const formation = parseFormation(stored.formation);
    expect(formation).toBe(name);
    expect(formationPositions(formation)).toEqual(positions);
    // Every player where he was saved, at the position of his slot then.
    const lineup = resolveLineup(formation, parseSavedLineup(stored.lineup), squad);
    expect(lineup.starters.map(({ index, slot, player }) => [index, slot, player.id])).toEqual(
      positions.map((position, slot) => [slot, position, `club#${slot}`]),
    );
    expect(lineup.bench.map((player) => player.id)).toEqual(["club#11"]);
  });

  it("covers every formation of gameplay v1, all of them still formations", () => {
    expect(Object.keys(LEGACY_FORMATIONS)).toHaveLength(7);
    for (const name of Object.keys(LEGACY_FORMATIONS)) {
      expect(FORMATION_NAMES).toContain(name);
    }
  });
});
