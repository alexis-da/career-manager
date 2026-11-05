import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// The Club screen's data, against DATABASE_URL: the demo save, read only, and a throwaway twin, then deleted: fresh from
// createSave, in its first season, for its dotation, whose rows the next tests change (an earlier season, a bonus, a malus,
// none), then its wage budget cut below its payroll; in this order. The demo save is created on the first run when missing
// (a whole season to play, hence the long hook timeout) and kept for later runs. Skipped without DATABASE_URL; modules are
// imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the Club screen's data", () => {
  let db: typeof prismaClient | undefined;
  let club: typeof import("./club") | undefined;
  let market: typeof import("./market") | undefined;
  let saveId = "";
  let twinId = "";

  const loaded = () => {
    if (db === undefined || club === undefined || market === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, club, market };
  };

  beforeAll(async () => {
    const [{ prisma }, support, clubModule, marketModule] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./club"),
      import("./market"),
    ]);
    db = prisma;
    club = clubModule;
    market = marketModule;
    saveId = await support.ensureDemoSave();
    twinId = await support.createDemoTwin("Test finances du club");
  }, 900_000);

  // Deleting a save cascades to thousands of rows, slower while the other test files run: more than the default.
  afterAll(async () => {
    if (twinId !== "") {
      await db?.save.delete({ where: { id: twinId } });
    }
    await db?.$disconnect();
  }, 60_000);

  it("adds up the wages of the managed club's players, and what they leave under its wage budget", async () => {
    const { db, club } = loaded();
    const managed = await db.clubSave.findFirstOrThrow({
      where: { saveId, isManaged: true },
      select: { id: true, budget: true, wageBudget: true },
    });
    const players = await db.playerSave.findMany({ where: { saveId, clubSaveId: managed.id }, select: { wage: true } });
    const payroll = players.reduce((sum, { wage }) => sum + wage, 0);

    expect(payroll).toBeGreaterThan(0);
    expect(await club.getClubFinances(saveId)).toMatchObject({
      budget: managed.budget,
      wageBudget: managed.wageBudget,
      payroll,
      wageRoom: managed.wageBudget - payroll,
    });
  });

  it("gives the money of the transfer market's overview", async () => {
    const { club, market } = loaded();
    const { budget, wageBudget, payroll, wageRoom } = await club.getClubFinances(saveId);

    expect(await market.getMarketOverview(saveId)).toMatchObject({ budget, wageBudget, payroll, wageRoom });
  });

  it("gives a save's first season its starting budget, at the club's reputation rank among its division's clubs", async () => {
    const { db, club } = loaded();
    const managed = await db.clubSave.findFirstOrThrow({
      where: { saveId: twinId, isManaged: true },
      select: { budget: true, wageBudget: true, reputation: true, competitionId: true },
    });
    const division = await db.clubSave.findMany({
      where: { saveId: twinId, competitionId: managed.competitionId },
      select: { reputation: true },
    });

    // Nothing bought or sold yet: the budget it started with is the one it has.
    expect((await club.getClubFinances(twinId)).dotation).toEqual({
      startYear: WORLD_START_YEAR,
      reputation: managed.reputation,
      reputationRank: 1 + division.filter(({ reputation }) => reputation > managed.reputation).length,
      clubCount: division.length,
      dotation: managed.budget,
      coefficient: 100,
      objectivesAmount: 0,
      carryOver: 0,
      budget: managed.budget,
      wageBudget: managed.wageBudget,
      first: true,
    });
  });

  it("takes the latest season's dotation, which a completed season before it makes no longer the first", async () => {
    const { db, club } = loaded();
    const { competitionId } = await db.clubSave.findFirstOrThrow({
      where: { saveId: twinId, isManaged: true },
      select: { competitionId: true },
    });
    // A season before the save's, completed, its dotation written after the current season's.
    const earlier = await db.season.create({
      data: { saveId: twinId, competitionId, startYear: WORLD_START_YEAR - 1, completed: true },
      select: { id: true },
    });
    try {
      await db.seasonBudget.create({
        data: {
          saveId: twinId,
          seasonId: earlier.id,
          reputation: 60,
          reputationRank: 8,
          dotation: 20_000_000,
          coefficient: 85,
          carryOver: 1_000_000,
          budget: 18_000_000,
          wageBudget: 40_000_000,
        },
        select: { id: true },
      });

      expect((await club.getClubFinances(twinId)).dotation).toMatchObject({
        startYear: WORLD_START_YEAR,
        coefficient: 100,
        objectivesAmount: 0,
        carryOver: 0,
        first: false,
      });
    } finally {
      // Its dotation with it.
      await db.season.deleteMany({ where: { saveId: twinId, id: earlier.id } });
    }
  });

  it("adds the objectives' bonus or malus and half of the unspent budget to the board's funding", async () => {
    const { db, club } = loaded();
    const { seasonId, ...original } = await db.seasonBudget.findFirstOrThrow({
      where: { saveId: twinId },
      select: { seasonId: true, dotation: true, coefficient: true, carryOver: true, budget: true },
    });
    const write = (data: { dotation: number; coefficient: number; carryOver: number; budget: number }) =>
      db.seasonBudget.updateMany({ where: { saveId: twinId, seasonId }, data });
    try {
      await write({ dotation: 40_000_000, coefficient: 110, carryOver: 2_500_000, budget: 46_500_000 });
      expect((await club.getClubFinances(twinId)).dotation).toMatchObject({
        dotation: 40_000_000,
        coefficient: 110,
        objectivesAmount: 4_000_000,
        carryOver: 2_500_000,
        budget: 46_500_000,
        first: false,
      });

      await write({ dotation: 40_000_000, coefficient: 85, carryOver: 2_500_000, budget: 36_500_000 });
      expect((await club.getClubFinances(twinId)).dotation).toMatchObject({ coefficient: 85, objectivesAmount: -6_000_000, first: false });
    } finally {
      await write(original);
    }
  });

  it("has no dotation for a save made before the season budgets, its money the same", async () => {
    const { db, club } = loaded();
    const before = await club.getClubFinances(twinId);
    await db.seasonBudget.deleteMany({ where: { saveId: twinId } });

    expect(await club.getClubFinances(twinId)).toEqual({ ...before, dotation: null });
  });

  it("leaves the room negative when the payroll is above the wage budget", async () => {
    const { db, club } = loaded();
    const wageBudget = 1_000_000;
    await db.clubSave.updateMany({ where: { saveId: twinId, isManaged: true }, data: { wageBudget } });

    const { payroll, wageRoom } = await club.getClubFinances(twinId);

    expect(payroll).toBeGreaterThan(wageBudget);
    expect(wageRoom).toBe(wageBudget - payroll);
  });

  it("names the save's manager", async () => {
    const { club } = loaded();

    expect(await club.getManagerName(saveId)).toBe("Test");
  });
});
