import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { YOUTH_OBJECTIVE_STARTS } from "../engine/balance";
import { FORMATION_NAMES, formationPositions } from "../engine/formations";
import {
  resolveLineup,
  selectAssistantLineup,
  selectLineup,
  youthCandidate,
  type LineupCandidate,
  type SavedLineup,
} from "../engine/lineup";
import type { Position } from "../engine/positions";
import { seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";

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

// Who makes the managed club's line-up (docs/design/simplification.md § 3), on a throwaway twin of the demo save, a new
// career: its assistant, then its player once he saves his own, then a career from before the setting. Runs against
// DATABASE_URL and is skipped without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("who makes the managed club's line-up", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const settingOf = async (): Promise<boolean | null> =>
    (await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { lineupByAssistant: true } })).lineupByAssistant;
  const clubRow = () =>
    database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { formation: true, lineup: true } });

  beforeAll(async () => {
    const [{ prisma }, support] = await Promise.all([import("./client"), import("./test-support")]);
    db = prisma;
    saveId = await support.createDemoTwin("Test composition de l'adjoint");
  }, 120_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 60_000);

  it("is the assistant in a new career: his eleven, nobody to do without, the market's weak spot on the best available", async () => {
    const { getLineupEditor, getManagedLineup } = await import("./lineup");
    const [editor, managed] = await Promise.all([getLineupEditor(saveId), getManagedLineup(saveId)]);
    const positions = formationPositions(editor.formation);

    expect(await settingOf()).toBe(true);
    expect(editor.byAssistant).toBe(true);
    expect(managed).toMatchObject({ byAssistant: true, missingStarters: [] });
    expect(managed.lineup).toEqual(selectAssistantLineup(editor.players, positions, editor.youth ?? null));
    expect(managed.weakSpotLineup).toEqual(selectLineup(editor.players, positions));
    expect(managed.keptOffSales).toEqual(selectLineup(editor.players, positions).starters.map(({ player }) => player.id));
  });

  it("reads, before the season's first match, the optional objective its assistant will choose then: Jeunesse when proposed", async () => {
    const { getLineupEditor } = await import("./lineup");
    const db = database();
    const club = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, competitionId: true } });
    const season = await db.season.findFirstOrThrow({
      where: { saveId, competitionId: club.competitionId, startYear: WORLD_START_YEAR },
      select: { id: true },
    });
    const players = await db.playerSave.findMany({ where: { saveId, clubSaveId: club.id }, select: { playerKey: true, overall: true, birthDate: true } });
    const firstDay = seasonStartDate(WORLD_START_YEAR);
    const candidate = youthCandidate(
      players.map((player) => ({ id: player.playerKey, overall: player.overall, seasonAge: ageInYears(player.birthDate, firstDay) })),
    );
    expect(candidate).not.toBeNull();
    // Jeunesse among those proposed, none chosen yet: the assistant's pick at the first match.
    await db.seasonObjective.updateMany({ where: { saveId, seasonId: season.id, imposed: false }, data: { chosen: false } });
    await db.seasonObjective.upsert({
      where: { seasonId_kind: { seasonId: season.id, kind: "YOUTH" } },
      create: { saveId, seasonId: season.id, kind: "YOUTH", imposed: false, target: YOUTH_OBJECTIVE_STARTS },
      update: {},
    });
    expect((await getLineupEditor(saveId)).youth).toEqual({ id: candidate?.id, leagueStarts: 0 });

    // Another one chosen by the player: no Jeunesse.
    await db.seasonObjective.updateMany({ where: { saveId, seasonId: season.id, imposed: false, kind: { not: "YOUTH" } }, data: { chosen: true } });
    expect((await getLineupEditor(saveId)).youth).toBeNull();
    await db.seasonObjective.updateMany({ where: { saveId, seasonId: season.id, imposed: false }, data: { chosen: false } });
  });

  it("saves its formation and starting instruction at once, the assistant keeping it, a line-up saved before kept as it is", async () => {
    const { getLineupEditor, saveLineupPlan } = await import("./lineup");
    const before = { starters: [{ slot: 0, playerKey: "gone" }], benchOrder: ["gone-too"] };
    await database().clubSave.updateMany({ where: { saveId, isManaged: true }, data: { lineup: before } });

    expect(await saveLineupPlan(saveId, { formation: "3-5-2", instruction: "DEFEND" })).toEqual({ formation: true, instruction: true });
    expect(await saveLineupPlan(saveId, { formation: "3-5-2", instruction: "ATTACK" })).toEqual({ formation: false, instruction: true });
    expect(await saveLineupPlan(saveId, { formation: "4-4-2", instruction: "ATTACK" })).toEqual({ formation: true, instruction: false });
    expect(await clubRow()).toEqual({ formation: "4-4-2", lineup: { ...before, instruction: "ATTACK" } });
    expect(await settingOf()).toBe(true);
    const editor = await getLineupEditor(saveId);
    expect(editor).toMatchObject({ formation: "4-4-2", byAssistant: true, instruction: "ATTACK" });
  });

  it("takes the line-up from the assistant once the player saves his, which plays then, and refuses him a plan", async () => {
    const { getLineupEditor, getManagedLineup, LineupPlanError, saveLineupPlan, saveManagedLineup } = await import("./lineup");
    const { players } = await getLineupEditor(saveId);
    const picked = selectLineup(players, formationPositions("3-5-2"));
    const saved: SavedLineup = {
      starters: picked.starters.map(({ index, player }) => ({ slot: index, playerKey: player.id })),
      benchOrder: picked.bench.map(({ id }) => id),
      instruction: "DEFEND",
    };
    await saveManagedLineup(saveId, { formation: "3-5-2", lineup: saved });

    expect(await settingOf()).toBe(false);
    const managed = await getManagedLineup(saveId);
    expect(managed.byAssistant).toBe(false);
    expect(managed.lineup).toEqual(resolveLineup("3-5-2", saved, players));
    expect(managed.weakSpotLineup).toEqual(managed.lineup);
    expect(managed.keptOffSales).toEqual(saved.starters.map(({ playerKey }) => playerKey));
    await expect(saveLineupPlan(saveId, { formation: "4-3-3", instruction: "BALANCED" })).rejects.toBeInstanceOf(LineupPlanError);
    expect(await clubRow()).toMatchObject({ formation: "3-5-2", lineup: saved });
  });

  it("leaves a career from before the setting its saved line-up's way: the player's with starters, the assistant's without", async () => {
    const { getManagedLineup, saveLineupPlan } = await import("./lineup");
    await database().save.update({ where: { id: saveId }, data: { lineupByAssistant: null } });

    expect((await getManagedLineup(saveId)).byAssistant).toBe(false);
    await database().clubSave.updateMany({ where: { saveId, isManaged: true }, data: { lineup: { starters: [], benchOrder: [], instruction: "DEFEND" } } });
    const managed = await getManagedLineup(saveId);
    expect(managed.byAssistant).toBe(true);
    expect(managed.lineup.instruction).toBe("DEFEND");
    // A plan saved then keeps it so, the setting untouched.
    expect(await saveLineupPlan(saveId, { formation: "4-3-3", instruction: "BALANCED" })).toEqual({ formation: true, instruction: true });
    expect(await settingOf()).toBeNull();
    expect((await getManagedLineup(saveId)).byAssistant).toBe(true);
  });
});
