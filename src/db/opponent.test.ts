import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { averageStarterRating, selectLineup } from "../engine/lineup";
import type { prisma as prismaClient } from "./client";
import type { getOpponentPreview as getOpponentPreviewFunction } from "./opponent";

const DAY_MS = 86_400_000;

// Previews the managed club's next opponent on a throwaway save with the demo seed, before and after its first
// matchday, then deletes it. Runs against DATABASE_URL and is skipped without it; modules are imported lazily
// because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("getOpponentPreview", () => {
  let db: typeof prismaClient | undefined;
  let getOpponentPreview: typeof getOpponentPreviewFunction | undefined;
  let playNextMatchday: ((saveId: string) => Promise<unknown>) | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const preview = () => {
    if (getOpponentPreview === undefined) {
      throw new Error("Module not loaded");
    }
    return getOpponentPreview(saveId);
  };

  /** The opponent of the managed club's next match, his squad as the matchday reads it, and the match date. */
  async function nextOpponent() {
    const managed = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const next = await database().fixture.findFirstOrThrow({
      where: { saveId, played: false, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, homeClubSaveId: true, awayClubSaveId: true },
    });
    const clubSaveId = next.homeClubSaveId === managed.id ? next.awayClubSaveId : next.homeClubSaveId;
    const rows = await database().playerSave.findMany({
      where: { saveId, clubSaveId },
      select: { playerKey: true, position: true, overall: true, injuredUntil: true },
    });
    const squad = rows.map((row) => ({
      id: row.playerKey,
      position: row.position,
      overall: row.overall,
      injured: row.injuredUntil !== null && row.injuredUntil > next.scheduledAt,
    }));
    return { clubSaveId, matchDate: next.scheduledAt, squad };
  }

  beforeAll(async () => {
    const [{ prisma }, support, opponent, matchday] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./opponent"),
      import("./matchday"),
    ]);
    db = prisma;
    getOpponentPreview = opponent.getOpponentPreview;
    playNextMatchday = matchday.playNextMatchday;
    saveId = await support.createDemoTwin("Test adversaire");
  }, 120_000);

  // Deleting a played save cascades to thousands of rows, slower while the other test files run: more than the default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("shows the eleven the matchday will play for an AI club: its automatic 4-3-3", async () => {
    const result = await preview();
    const { squad } = await nextOpponent();
    const expected = selectLineup(squad);

    expect(result?.formation).toBe("4-3-3");
    expect(result?.lineup.starters).toHaveLength(11);
    expect(result?.lineup.starters.map(({ player, slot }) => [player.id, slot])).toEqual(
      expected.starters.map(({ player, slot }) => [player.id, slot]),
    );
    expect(result?.averageRating).toBeCloseTo(averageStarterRating(expected), 10);
    expect(result?.managedAverageRating).toBeGreaterThan(0);
    // Nothing played yet in this save.
    expect(result?.recent).toEqual([]);
    expect(result?.topScorer).toBeNull();
  });

  it("leaves out a starter injured past the match day, and keeps one back on that day", async () => {
    const { clubSaveId, matchDate } = await nextOpponent();
    const before = await preview();
    const [first, second] = before?.lineup.starters.map(({ player }) => player.id) ?? [];
    const injure = (playerKey: string | undefined, until: Date) =>
      database().playerSave.updateMany({ where: { saveId, clubSaveId, playerKey }, data: { injuredUntil: until } });
    await injure(first, new Date(matchDate.getTime() + DAY_MS));
    await injure(second, matchDate);

    const keys = (await preview())?.lineup.starters.map(({ player }) => player.id);
    expect(keys).toHaveLength(11);
    expect(keys).not.toContain(first);
    expect(keys).toContain(second);

    await database().playerSave.updateMany({ where: { saveId, clubSaveId }, data: { injuredUntil: null } });
  });

  it("after a matchday, shows the next opponent's result and his top scorer of the season", async () => {
    await playNextMatchday?.(saveId);
    const result = await preview();
    const { clubSaveId } = await nextOpponent();
    const goals = await database().playerSeasonStats.aggregate({
      where: { saveId, playerSave: { saveId, clubSaveId } },
      _max: { goals: true },
    });

    expect(result?.recent).toHaveLength(1);
    const [match] = result?.recent ?? [];
    expect(match.scored).toBeGreaterThanOrEqual(0);
    const best = goals._max.goals ?? 0;
    if (best === 0) {
      expect(result?.topScorer).toBeNull();
    } else {
      expect(result?.topScorer?.goals).toBe(best);
    }
    // A whole matchday, about 4 s alone: more than the 5 s default while every database suite runs at once.
  }, 60_000);
});
