import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The Club screen's data, against DATABASE_URL: the demo save, read only, and a throwaway twin whose wage budget is cut
// below its payroll, then deleted. The demo save is created on the first run when missing (a whole season to play, hence
// the long hook timeout) and kept for later runs. Skipped without DATABASE_URL; modules are imported lazily because the
// client throws without it.
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
    expect(await club.getClubFinances(saveId)).toEqual({
      budget: managed.budget,
      wageBudget: managed.wageBudget,
      payroll,
      wageRoom: managed.wageBudget - payroll,
    });
  });

  it("gives the money of the transfer market's overview", async () => {
    const { club, market } = loaded();

    expect(await market.getMarketOverview(saveId)).toMatchObject(await club.getClubFinances(saveId));
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
