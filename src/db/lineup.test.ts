import "dotenv/config";
import { describe, expect, it } from "vitest";

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
