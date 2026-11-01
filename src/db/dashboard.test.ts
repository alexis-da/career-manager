import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";
import type { Dashboard, getDashboard as getDashboardFunction, tableAround as tableAroundFunction } from "./dashboard";

const TOP_OF_THE_TABLE = [1, 2, 3, 4, 5, 6];
const BOTTOM_OF_THE_TABLE = [13, 14, 15, 16, 17, 18];

/** A table of `clubs` rows, the managed club at the rank `managed`. */
const tableOf = (clubs: number, managed: number | null) =>
  Array.from({ length: clubs }, (_, index) => ({ rank: index + 1, isManaged: index + 1 === managed }));

// Runs against DATABASE_URL and is skipped without it, tableAround too: modules are imported lazily because the client throws
// without it. The dashboard is read on a throwaway save with the demo seed, its matches written by hand, then deleted.
describe.skipIf(process.env.DATABASE_URL === undefined)("the dashboard", () => {
  let db: typeof prismaClient | undefined;
  let getDashboard: typeof getDashboardFunction | undefined;
  let tableAround: typeof tableAroundFunction | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const dashboard = (): Promise<Dashboard> => {
    if (getDashboard === undefined) {
      throw new Error("Module not loaded");
    }
    return getDashboard(saveId);
  };
  const ranksAround = (clubs: number, managed: number | null, size = 6): number[] => {
    if (tableAround === undefined) {
      throw new Error("Module not loaded");
    }
    return tableAround(tableOf(clubs, managed), size).map((row) => row.rank);
  };

  /** The managed club's fixtures in date order, each with a score to write for the club. */
  async function managedFixtures() {
    const managed = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const fixtures = await database().fixture.findMany({
      where: { saveId, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, homeClubSaveId: true },
    });
    return fixtures.map(({ id, homeClubSaveId }) => ({
      id,
      play: (scored: number, conceded: number) => {
        const [homeGoals, awayGoals] = homeClubSaveId === managed.id ? [scored, conceded] : [conceded, scored];
        return { played: true, homeGoals, awayGoals };
      },
    }));
  }

  beforeAll(async () => {
    const [{ prisma }, support, dashboardModule] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./dashboard"),
    ]);
    db = prisma;
    getDashboard = dashboardModule.getDashboard;
    tableAround = dashboardModule.tableAround;
    saveId = await support.createDemoTwin("Test tableau de bord");
  }, 120_000);

  // Deleting a save cascades to thousands of rows, slower while the other test files run: more than the default.
  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 60_000);

  describe("tableAround", () => {
    it("shows the top of the table around a club at its head", () => {
      expect(ranksAround(18, 1)).toEqual(TOP_OF_THE_TABLE);
      expect(ranksAround(18, 3)).toEqual(TOP_OF_THE_TABLE);
      expect(ranksAround(18, 4)).toEqual(TOP_OF_THE_TABLE);
    });

    it("centres the window on a club in mid-table, the extra row above it", () => {
      expect(ranksAround(18, 5)).toEqual([2, 3, 4, 5, 6, 7]);
      expect(ranksAround(18, 9)).toEqual([6, 7, 8, 9, 10, 11]);
      expect(ranksAround(18, 9, 5)).toEqual([7, 8, 9, 10, 11]);
    });

    it("stays inside the table around a club at its foot", () => {
      expect(ranksAround(18, 15)).toEqual([12, 13, 14, 15, 16, 17]);
      expect(ranksAround(18, 16)).toEqual(BOTTOM_OF_THE_TABLE);
      expect(ranksAround(18, 18)).toEqual(BOTTOM_OF_THE_TABLE);
    });

    it("gives the whole table when it has fewer rows than the window", () => {
      expect(ranksAround(4, 2)).toEqual([1, 2, 3, 4]);
      expect(ranksAround(6, 6)).toEqual(TOP_OF_THE_TABLE);
      expect(ranksAround(0, null)).toEqual([]);
    });

    it("gives the top of the table without a managed club", () => {
      expect(ranksAround(18, null)).toEqual(TOP_OF_THE_TABLE);
    });
  });

  it("gives no form and no live match to a new save, its six rows around the managed club", async () => {
    const { managedForm, liveMatch, table, nextMatch } = await dashboard();

    expect(nextMatch).not.toBeNull();
    expect(managedForm).toEqual([]);
    expect(liveMatch).toBe(false);
    expect(table).toHaveLength(6);
    expect(table.filter((row) => row.isManaged)).toHaveLength(1);
  }, 60_000);

  it("gives the managed club's form with a next match, as the match's preview has it", async () => {
    const fixtures = await managedFixtures();
    const scores = [
      [2, 0],
      [1, 1],
      [0, 3],
    ];
    for (const [index, [scored, conceded]] of scores.entries()) {
      const { id, play } = fixtures[index];
      await database().fixture.update({ where: { id, saveId }, data: play(scored, conceded) });
    }

    const { managedForm, nextMatch } = await dashboard();

    expect(managedForm).toEqual(["W", "D", "L"]);
    const preview = nextMatch?.fixture.home.isManaged ? nextMatch.home : nextMatch?.away;
    expect(preview?.form).toEqual(managedForm);
  }, 60_000);

  it("still gives the form once the managed club has no match left, its last four in date order", async () => {
    const fixtures = await managedFixtures();
    const last = fixtures.at(-1);
    if (last === undefined) {
      throw new Error("The managed club has no fixture");
    }
    await database().fixture.updateMany({
      where: { saveId, id: { in: fixtures.map(({ id }) => id) }, played: false },
      data: { played: true, homeGoals: 1, awayGoals: 1 },
    });
    await database().fixture.update({ where: { id: last.id, saveId }, data: last.play(3, 1) });

    const { managedForm, nextMatch } = await dashboard();

    expect(nextMatch).toBeNull();
    expect(managedForm).toEqual(["D", "D", "D", "W"]);
  }, 60_000);

  it("tells a match waiting at a break", async () => {
    const [{ id }] = await managedFixtures();
    await database().save.update({ where: { id: saveId }, data: { liveFixtureId: id } });

    expect((await dashboard()).liveMatch).toBe(true);
  }, 60_000);
});
