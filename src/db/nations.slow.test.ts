import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { breakWindows, matchdayDates } from "../engine/schedule";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

const DAY = (date: Date): string => date.toISOString().slice(0, 10);

// A worldVersion 2 save from before the national teams (docs/design/selections.md § 3.5): its season as it was, then its
// breaks and nations from its next season only; and the same break, played the same way, in two saves of one seed.
// Runs against DATABASE_URL and is skipped without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("national teams in a save from before them", () => {
  let db: typeof prismaClient | undefined;
  const saveIds: string[] = [];
  let modules:
    | { saves: typeof import("./saves"); season: typeof import("./season"); support: typeof import("./test-support"); matchday: typeof import("./matchday") }
    | undefined;

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const loaded = () => {
    if (modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return modules;
  };

  /** A worldVersion 2 twin of the demo save without national teams: a save as production holds them before the release. */
  const createBefore = async (): Promise<string> => {
    const { saves, support } = loaded();
    const club = await database().club.findUniqueOrThrow({ where: { slug: support.DEMO_CLUB_SLUG }, select: { id: true } });
    const ownerId = await support.createTestOwner();
    const { id } = await saves.createSave({ name: "Test avant sélections", managerName: "Test", clubId: club.id, seed: support.DEMO_SEED, ownerId, worldVersion: 2, nations: false });
    saveIds.push(id);
    return id;
  };

  beforeAll(async () => {
    const [{ prisma }, saves, season, support, matchday] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./season"),
      import("./test-support"),
      import("./matchday"),
    ]);
    db = prisma;
    modules = { saves, season, support, matchday };
  }, 60_000);

  afterAll(async () => {
    for (const id of saveIds) {
      await db?.save.delete({ where: { id } });
    }
    await db?.$disconnect();
  }, 240_000);

  it("keeps its season as it was, then has its breaks and nations from the next one, the same in two saves of one seed", async () => {
    const { season, support } = loaded();
    const first = await createBefore();
    const twin = await createBefore();

    for (const id of [first, twin]) {
      const save = await database().save.findUniqueOrThrow({ where: { id }, select: { breaksFrom: true } });
      expect(save.breaksFrom).toBeNull();
      expect(await database().internationalMatch.count({ where: { saveId: id } })).toBe(0);
      // Its league season on the calendar without breaks: its first Saturdays every week.
      const english = await database().fixture.groupBy({
        by: ["scheduledAt"],
        where: { saveId: id, season: { competition: { code: "en.2" } } },
        orderBy: { scheduledAt: "asc" },
      });
      expect(english.map(({ scheduledAt }) => DAY(scheduledAt))).toEqual(matchdayDates(46, WORLD_START_YEAR).map(DAY));

      await support.playRemainingMatchdays(id);
      // No break was played: the season as it always was.
      expect(await database().internationalMatch.count({ where: { saveId: id } })).toBe(0);
      expect(await database().playerSave.count({ where: { saveId: id, caps: { gt: 0 } } })).toBe(0);
      await season.advanceToNextSeason(id);

      const after = await database().save.findUniqueOrThrow({ where: { id }, select: { breaksFrom: true, cyclesFrom: true } });
      expect(after.breaksFrom).toBe(WORLD_START_YEAR + 1);
      // Its first cycle of qualifiers with its first season with breaks: its first tournament two summers on.
      expect(after.cyclesFrom).toBe(WORLD_START_YEAR + 1);
      expect(await database().internationalMatch.count({ where: { saveId: id, competition: "int.qual.eu" } })).toBe(16);
      expect(await database().nationSave.count({ where: { saveId: id } })).toBe(14);
      expect(await database().internationalMatch.count({ where: { saveId: id, startYear: WORLD_START_YEAR + 1 } })).toBe(56);
      const nextEnglish = await database().fixture.groupBy({
        by: ["scheduledAt"],
        where: { saveId: id, season: { startYear: WORLD_START_YEAR + 1, competition: { code: "en.2" } } },
        orderBy: { scheduledAt: "asc" },
      });
      expect(nextEnglish.map(({ scheduledAt }) => DAY(scheduledAt))).toEqual(matchdayDates(46, WORLD_START_YEAR + 1, true).map(DAY));
    }

    // Both saves through the first break of their new season: the same matches, the same scores, the same scorers.
    const [friday] = breakWindows(WORLD_START_YEAR + 1)[0].dates;
    const results: string[][] = [];
    for (const id of [first, twin]) {
      for (;;) {
        const summary = await loaded().matchday.playNextMatchday(id);
        if (summary === null || summary.internationalBreak !== undefined) {
          break;
        }
      }
      const played = await database().internationalMatch.findMany({
        where: { saveId: id, played: true },
        orderBy: [{ scheduledAt: "asc" }, { home: "asc" }],
        select: { scheduledAt: true, home: true, away: true, homeGoals: true, awayGoals: true, scorers: true },
      });
      expect(played).toHaveLength(14);
      expect(DAY(played[0].scheduledAt)).toBe(DAY(friday));
      results.push(played.map((match) => `${DAY(match.scheduledAt)} ${match.home} ${match.homeGoals}-${match.awayGoals} ${match.away} ${match.scorers.join(",")}`));
    }
    expect(results[1]).toEqual(results[0]);
  }, 600_000);
});
