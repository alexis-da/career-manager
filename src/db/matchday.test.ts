import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WORLD_START_DATE } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type { getStandings as getStandingsFunction } from "./standings";

const DEMO_SEED = "demo-2024-25";
const DEMO_CLUB_SLUG = "olympique-lyonnais";

// Plays the demo save (created if missing) to the end of its season, against DATABASE_URL. Skipped when
// it is not set. Once the season is over, a new run plays nothing and checks the same finished season.
describe.skipIf(process.env.DATABASE_URL === undefined)("playNextMatchday on the demo save", () => {
  let db: typeof prismaClient | undefined;
  let getStandings: typeof getStandingsFunction | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, { createSave }, { playNextMatchday }, standings] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./matchday"),
      import("./standings"),
    ]);
    db = prisma;
    getStandings = standings.getStandings;

    const demo = await prisma.save.findFirst({ where: { seed: DEMO_SEED }, orderBy: { createdAt: "asc" } });
    if (demo === null) {
      const club = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
      saveId = (await createSave({ name: "Partie de démonstration", managerName: "Démo", clubId: club.id, seed: DEMO_SEED })).id;
    } else {
      saveId = demo.id;
    }

    let playing = true;
    while (playing) {
      playing = (await playNextMatchday(saveId)) !== null;
    }
  }, 900_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("plays every fixture of the season, each with a score", async () => {
    const db = database();
    const [unplayed, played, withoutScore] = await Promise.all([
      db.fixture.count({ where: { saveId, played: false } }),
      db.fixture.count({ where: { saveId, played: true } }),
      db.fixture.count({ where: { saveId, played: true, OR: [{ homeGoals: null }, { awayGoals: null }] } }),
    ]);

    expect(unplayed).toBe(0);
    expect(played).toBeGreaterThan(0);
    expect(withoutScore).toBe(0);
  });

  it("records one goal event per goal, for the scoring side, and counts them in the season stats", async () => {
    const db = database();
    const fixtures = await db.fixture.findMany({
      where: { saveId },
      select: {
        id: true,
        homeGoals: true,
        awayGoals: true,
        homeClubSaveId: true,
        awayClubSaveId: true,
        events: { where: { type: "GOAL" }, select: { playerSave: { select: { clubSaveId: true } } } },
      },
    });
    const goalsBy = (fixture: (typeof fixtures)[number], clubSaveId: string) =>
      fixture.events.filter((event) => event.playerSave?.clubSaveId === clubSaveId).length;
    const mismatches = fixtures
      .filter(
        (fixture) =>
          goalsBy(fixture, fixture.homeClubSaveId) !== fixture.homeGoals ||
          goalsBy(fixture, fixture.awayClubSaveId) !== fixture.awayGoals,
      )
      .map((fixture) => fixture.id);
    const totalGoals = fixtures.reduce((sum, fixture) => sum + (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0), 0);
    const stats = await db.playerSeasonStats.aggregate({ where: { saveId }, _sum: { goals: true } });

    expect(mismatches).toEqual([]);
    expect(stats._sum.goals).toBe(totalGoals);
  });

  it("builds complete standings of 20 or 18 clubs", async () => {
    const seasons = await database().season.findMany({
      where: { saveId },
      select: { id: true, competition: { select: { _count: { select: { clubs: true } } } } },
    });
    if (getStandings === undefined) {
      throw new Error("Standings module not loaded");
    }

    expect(seasons.length).toBeGreaterThan(0);
    for (const season of seasons) {
      const clubCount = season.competition._count.clubs;
      const table = await getStandings(saveId, season.id);

      expect([18, 20]).toContain(table.length);
      expect(table).toHaveLength(clubCount);
      expect(table.every((row) => row.played === 2 * (clubCount - 1))).toBe(true);
    }
  });

  it("moves currentDate forward to the last matchday", async () => {
    const db = database();
    const [save, lastFixture] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      db.fixture.findFirstOrThrow({ where: { saveId }, orderBy: { scheduledAt: "desc" }, select: { scheduledAt: true } }),
    ]);

    expect(save.currentDate.getTime()).toBeGreaterThan(WORLD_START_DATE.getTime());
    expect(save.currentDate).toEqual(lastFixture.scheduledAt);
  });
});
