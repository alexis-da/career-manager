import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasWinterBreak, matchdayDates, winterBreakDates } from "../engine/schedule";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

const DAY = (date: Date): string => date.toISOString().slice(0, 10);

/** A league's season in a save: its code, its number of matchdays and their dates, in order. */
type LeagueCalendar = { code: string; rounds: number; days: string[] };

// The winter break in a worldVersion 2 save from before it (Save.winterBreakFrom null), its international breaks already
// there: its season in progress keeps its dates, the leagues of Spain, Italy, Germany and France playing over the holidays
// as England's do; from its next season on, they stop from 21 December to 3 January, England's playing on. Runs against
// DATABASE_URL and is skipped without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the winter break in a save from before it", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let modules: { season: typeof import("./season"); support: typeof import("./test-support") } | undefined;

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

  /** The save's league seasons starting in startYear, by code: a date a matchday, or the dates would outnumber them. */
  const leagueCalendars = async (startYear: number): Promise<LeagueCalendar[]> => {
    const seasons = await database().season.findMany({
      where: { saveId, startYear, competition: { kind: "LEAGUE" } },
      orderBy: { competition: { code: "asc" } },
      select: { id: true, competition: { select: { code: true } } },
    });
    const calendars: LeagueCalendar[] = [];
    for (const { id: seasonId, competition } of seasons) {
      const matchdays = await database().fixture.groupBy({ by: ["round", "scheduledAt"], where: { saveId, seasonId }, orderBy: { scheduledAt: "asc" } });
      calendars.push({
        code: competition.code,
        rounds: new Set(matchdays.map(({ round }) => round)).size,
        days: matchdays.map(({ scheduledAt }) => DAY(scheduledAt)),
      });
    }
    return calendars;
  };

  beforeAll(async () => {
    const [{ prisma }, saves, season, support] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./season"),
      import("./test-support"),
    ]);
    db = prisma;
    modules = { season, support };
    // A twin of the demo save as production holds those created before the winter break: its breaks, nations, cups and
    // European competitions, and no winter break.
    const club = await prisma.club.findUniqueOrThrow({ where: { slug: support.DEMO_CLUB_SLUG }, select: { id: true } });
    const ownerId = await support.createTestOwner();
    const { id } = await saves.createSave({
      name: "Test avant la trêve hivernale",
      managerName: "Test",
      clubId: club.id,
      seed: support.DEMO_SEED,
      ownerId,
      worldVersion: 2,
      winterBreak: false,
    });
    saveId = id;
  }, 120_000);

  // Deleting a played save cascades to tens of thousands of rows: allow more than the hook default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 300_000);

  it("keeps the dates of its season in progress, then stops the leagues of Spain, Italy, Germany and France over the holidays from its next one", async () => {
    const { season, support } = loaded();
    expect(await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { breaksFrom: true, winterBreakFrom: true } })).toEqual({
      breaksFrom: WORLD_START_YEAR,
      winterBreakFrom: null,
    });
    // Its season in progress: every league on the calendar with breaks, the holidays included.
    const first = await leagueCalendars(WORLD_START_YEAR);
    expect(first).toHaveLength(10);
    const holidays = winterBreakDates(WORLD_START_YEAR);
    for (const { code, rounds, days } of first) {
      expect(days, code).toEqual(matchdayDates(rounds, WORLD_START_YEAR, true).map(DAY));
      expect(days.some((day) => day >= DAY(holidays.from) && day <= DAY(holidays.to)), code).toBe(true);
    }

    await support.playRemainingMatchdays(saveId);
    await season.advanceToNextSeason(saveId);

    const after = await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { breaksFrom: true, winterBreakFrom: true } });
    expect(after).toEqual({ breaksFrom: WORLD_START_YEAR, winterBreakFrom: WORLD_START_YEAR + 1 });
    // The season it closed as it was played.
    expect(await leagueCalendars(WORLD_START_YEAR)).toEqual(first);
    // The next one: the leagues of Spain, Italy, Germany and France without the holidays, England's with them, every one
    // with all its matchdays, from the same first Saturday to the same last one.
    const next = await leagueCalendars(WORLD_START_YEAR + 1);
    expect(next).toHaveLength(10);
    expect(next.filter(({ code }) => hasWinterBreak(code)).map(({ code }) => code)).toEqual(["de.1", "de.2", "es.1", "es.2", "fr.1", "fr.2", "it.1", "it.2"]);
    const winter = winterBreakDates(WORLD_START_YEAR + 1);
    for (const { code, rounds, days } of next) {
      expect(rounds, code).toBe(first.find((calendar) => calendar.code === code)?.rounds);
      expect(days, code).toEqual(matchdayDates(rounds, WORLD_START_YEAR + 1, true, hasWinterBreak(code)).map(DAY));
      expect(days.some((day) => day >= DAY(winter.from) && day <= DAY(winter.to)), code).toBe(!hasWinterBreak(code));
    }
    expect(new Set(next.map(({ days }) => days[0])).size).toBe(1);
    expect(new Set(next.map(({ days }) => days.at(-1))).size).toBe(1);
  }, 900_000);
});
