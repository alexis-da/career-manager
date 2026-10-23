import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type { SeasonTransition } from "./season";

const FIRST_YEAR = WORLD_START_YEAR;

type SeasonDates = { code: string; tier: number; startYear: number; first: string; last: string; fixtures: number; unplayed: number };

// A whole season of a worldVersion 2 save (first and second divisions) on a twin of the demo save, then the move to
// the next one, then the twin is deleted; and the worldVersion 2 demo save itself, created once and kept. Runs against
// DATABASE_URL and is skipped without it. Modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a worldVersion 2 season", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let matchdays = 0;
  let transition: SeasonTransition | undefined;
  let demoId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  /** First and last matchday, matches and unplayed matches of every season of a save. */
  const seasonDates = async (id: string): Promise<SeasonDates[]> => {
    const seasons = await database().season.findMany({
      where: { saveId: id },
      select: { id: true, startYear: true, competition: { select: { code: true, tier: true } } },
    });
    const dates = await database().fixture.groupBy({
      by: ["seasonId"],
      where: { saveId: id },
      _min: { scheduledAt: true },
      _max: { scheduledAt: true },
      _count: { _all: true },
    });
    const unplayed = await database().fixture.groupBy({ by: ["seasonId"], where: { saveId: id, played: false }, _count: { _all: true } });
    return seasons
      .map((season) => {
        const row = dates.find((candidate) => candidate.seasonId === season.id);
        return {
          code: season.competition.code,
          tier: season.competition.tier,
          startYear: season.startYear,
          first: row?._min.scheduledAt?.toISOString() ?? "",
          last: row?._max.scheduledAt?.toISOString() ?? "",
          fixtures: row?._count._all ?? 0,
          unplayed: unplayed.find((candidate) => candidate.seasonId === season.id)?._count._all ?? 0,
        };
      })
      .sort((a, b) => a.startYear - b.startYear || a.code.localeCompare(b.code));
  };

  beforeAll(async () => {
    const [{ prisma }, support, season] = await Promise.all([import("./client"), import("./test-support"), import("./season")]);
    db = prisma;
    saveId = await support.createDemoTwin("Test saison deux divisions", 2);
    matchdays = await support.playRemainingMatchdays(saveId);
    transition = await season.advanceToNextSeason(saveId);
    demoId = await support.ensureDemoSave(2);
  }, 1_800_000);

  // Deleting a played save cascades to tens of thousands of rows: allow more than the 10 s hook default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.deleteMany({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 300_000);

  it("plays the ten competitions of the first season, all from the same first Saturday to the same last one", async () => {
    const completed = (await seasonDates(saveId)).filter((season) => season.startYear === FIRST_YEAR);

    expect(completed.map((season) => [season.code, season.fixtures])).toEqual([
      ["de.1", 306],
      ["de.2", 306],
      ["en.1", 380],
      ["en.2", 552],
      ["es.1", 380],
      ["es.2", 462],
      ["fr.1", 306],
      ["fr.2", 306],
      ["it.1", 380],
      ["it.2", 380],
    ]);
    expect(completed.every((season) => season.unplayed === 0)).toBe(true);
    expect(new Set(completed.map((season) => season.first))).toEqual(new Set(["2026-08-15T00:00:00.000Z"]));
    expect(new Set(completed.map((season) => season.last))).toEqual(new Set(["2027-05-15T00:00:00.000Z"]));
    // 40 Saturdays and the Tuesdays of the 46 and 42 matchday seasons, some shared: one playNextMatchday each.
    expect(matchdays).toBe(46);
  });

  it("moves to the next season: ten competitions again, the managed club's result written, every club where it was", async () => {
    const db = database();
    const next = (await seasonDates(saveId)).filter((season) => season.startYear === FIRST_YEAR + 1);
    const [save, managedSeason, result] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      db.season.findFirstOrThrow({
        where: { saveId, startYear: FIRST_YEAR, competition: { code: "fr.1" } },
        select: { id: true },
      }),
      db.seasonResult.findMany({ where: { saveId }, select: { seasonId: true, played: true } }),
    ]);

    expect(transition?.startYear).toBe(FIRST_YEAR + 1);
    expect(transition?.completedSeasonId).toBe(managedSeason.id);
    expect(result).toEqual([{ seasonId: managedSeason.id, played: 34 }]);
    expect(save.currentDate.toISOString()).toBe("2027-07-01T00:00:00.000Z");
    expect(next).toHaveLength(10);
    expect(next.reduce((sum, season) => sum + season.fixtures, 0)).toBe(3758);
    expect(next.every((season) => season.unplayed === season.fixtures)).toBe(true);
    expect(new Set(next.map((season) => season.last)).size).toBe(1);
  });

  it("keeps the worldVersion 2 demo save at the kickoff of its second season, apart from the worldVersion 1 one", async () => {
    const db = database();
    const [demo, v1Demo, seasons] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: demoId }, select: { worldVersion: true, currentDate: true, ownerId: true } }),
      db.save.findFirst({ where: { name: { startsWith: "Partie de démo" }, worldVersion: 1 }, select: { id: true } }),
      seasonDates(demoId),
    ]);

    expect(demo).toMatchObject({ worldVersion: 2, ownerId: "demo-user-v2" });
    expect(demo.currentDate.toISOString()).toBe("2027-07-01T00:00:00.000Z");
    expect(v1Demo?.id).not.toBe(demoId);
    expect(seasons.filter((season) => season.startYear === FIRST_YEAR).every((season) => season.unplayed === 0)).toBe(true);
    expect(seasons.filter((season) => season.startYear === FIRST_YEAR + 1)).toHaveLength(10);
  });
});
