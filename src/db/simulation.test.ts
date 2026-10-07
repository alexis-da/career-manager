import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { firstMatchdayDate, seasonEndDate, WORLD_START_DATE, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type * as simulationModule from "./simulation";

const DAY_MS = 86_400_000;
const FIRST = firstMatchdayDate(WORLD_START_YEAR); // 15 August 2026
const third = new Date(FIRST.getTime() + 14 * DAY_MS); // 29 August, the third matchday
const fourth = new Date(FIRST.getTime() + 21 * DAY_MS);

// Quick simulation on a throwaway save with the demo seed, deleted at the end: the first matchdays only. Running a
// whole season into its end lives in simulation.slow.test.ts. Runs against DATABASE_URL and is skipped without
// it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("simulateMatchdays, first matchdays", () => {
  let db: typeof prismaClient | undefined;
  let simulation: typeof simulationModule | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const sim = (): typeof simulationModule => {
    if (simulation === undefined) {
      throw new Error("Simulation module not loaded");
    }
    return simulation;
  };

  const state = async () => {
    const [save, played] = await Promise.all([
      database().save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      database().fixture.count({ where: { saveId, played: true } }),
    ]);
    return { currentDate: save.currentDate.toISOString(), played };
  };

  beforeAll(async () => {
    const [{ prisma }, support, module] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./simulation"),
    ]);
    db = prisma;
    simulation = module;
    saveId = await support.createDemoTwin("Test simulation rapide");
  }, 120_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 60_000);

  it("plans every target within the season, and none past its end", async () => {
    const { planSimulation } = sim();
    const seasonEnd = seasonEndDate(WORLD_START_YEAR);

    const monthEnd = await planSimulation(saveId, { kind: "month-end" });
    expect(monthEnd.fromDate).toEqual(WORLD_START_DATE);
    expect(monthEnd.untilDate.toISOString()).toBe("2026-07-31T00:00:00.000Z");
    expect(monthEnd.matchdays).toBe(0);

    const nextMatch = await planSimulation(saveId, { kind: "next-match" });
    expect(nextMatch.untilDate).toEqual(FIRST);
    expect(nextMatch.matchdays).toBe(1);

    const windowClose = await planSimulation(saveId, { kind: "window-close" });
    expect(windowClose.untilDate.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(windowClose.matchdays).toBe(3);

    const seasonPlan = await planSimulation(saveId, { kind: "season-end" });
    const farAway = await planSimulation(saveId, { kind: "date", date: new Date(seasonEnd.getTime() + 400 * DAY_MS) });
    expect(seasonPlan.untilDate).toEqual(seasonEnd);
    expect(farAway).toEqual(seasonPlan);
    expect(seasonPlan.matchdays).toBeGreaterThanOrEqual(34);
  });

  it("plays nothing and writes nothing when no matchday falls before untilDate, however often it is called", async () => {
    const before = await state();
    const untilJulyEnd = new Date(FIRST.getTime() - DAY_MS);

    for (let call = 0; call < 2; call++) {
      const batch = await sim().simulateMatchdays(saveId, untilJulyEnd);
      expect(batch).toEqual({ played: 0, nextDate: FIRST, done: true, matches: [] });
    }
    expect(await state()).toEqual(before);
  });

  it("plays at most maxMatchdays per call, and never a matchday after untilDate", async () => {
    const { simulateMatchdays } = sim();

    const first = await simulateMatchdays(saveId, third, 2);
    expect(first.played).toBe(2);
    expect(first.done).toBe(false);
    expect(first.nextDate).toEqual(third);

    const second = await simulateMatchdays(saveId, third, 2);
    expect(second.played).toBe(1);
    expect(second.done).toBe(true);
    expect(second.nextDate).toEqual(fourth);

    const after = await state();
    expect(after.currentDate).toBe(third.toISOString());
    const [playedAfter, unplayedBefore] = await Promise.all([
      database().fixture.count({ where: { saveId, played: true, scheduledAt: { gt: third } } }),
      database().fixture.count({ where: { saveId, played: false, scheduledAt: { lte: third } } }),
    ]);
    expect(playedAfter).toBe(0);
    expect(unplayedBefore).toBe(0);

    // The managed club plays every Saturday: one match per matchday, in date order, with its score.
    const matches = [...first.matches, ...second.matches];
    expect(matches.map((match) => match.scheduledAt)).toEqual([0, 7, 14].map((days) => new Date(FIRST.getTime() + days * DAY_MS)));
    for (const match of matches) {
      expect(match.home.isManaged || match.away.isManaged).toBe(true);
      expect(match.played).toBe(true);
      expect(match.homeGoals).not.toBeNull();
      expect(match.autoFilledSlots).toBeGreaterThanOrEqual(0);
    }

    // Called again up to the same day: nothing left, nothing written.
    expect(await simulateMatchdays(saveId, third)).toEqual({ played: 0, nextDate: fourth, done: true, matches: [] });
    expect(await state()).toEqual(after);
  }, 60_000);

  it("sums up the period: the managed club's rank before and after, its injuries and ended contracts", async () => {
    const fromStart = await sim().getSimulationSummary(saveId, WORLD_START_DATE);
    expect(fromStart.rankBefore).toBeNull();
    expect(fromStart.rankAfter).toBeGreaterThanOrEqual(1);
    expect(fromStart.clubCount).toBe(18);
    expect(fromStart.expiredContracts).toEqual([]);
    for (const injury of fromStart.injuries) {
      expect(injury.date > WORLD_START_DATE && injury.date <= third).toBe(true);
    }

    const fromFirst = await sim().getSimulationSummary(saveId, FIRST);
    expect(fromFirst.rankBefore).toBeGreaterThanOrEqual(1);
    expect(fromFirst.rankAfter).toBe(fromStart.rankAfter);
    expect(fromFirst.injuries.every((injury) => injury.date > FIRST)).toBe(true);
  });
});
