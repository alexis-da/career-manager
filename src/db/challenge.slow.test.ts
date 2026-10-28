import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHALLENGE_HORIZON_MATCHDAYS } from "../config/challenge";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

/** Dates played at most to reach the horizon: a club's tenth league matchday comes before the season's 20th date. */
const MAX_DATES = 40;

// Two players of one week's challenge, against DATABASE_URL: two real challenge saves of a week of a far year, played
// until their club's tenth league matchday, one straight through, the other in the live mode, its club's matches paused
// at half-time and resumed without a change. Neither touches anything: they must end with the same score, written once.
// The challenge and what it holds are deleted at the end (deleteTestChallenges); throwaway owners, deleted once saveless.
// Skipped without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the weekly challenge, played by two players", () => {
  let db: typeof prismaClient | undefined;
  let saves: typeof import("./saves") | undefined;
  let matchday: typeof import("./matchday") | undefined;
  let live: typeof import("./live-match") | undefined;
  let standings: typeof import("./standings") | undefined;
  let support: typeof import("./test-support") | undefined;
  let limits: typeof import("../lib/limits") | undefined;
  // Real time, not simulation code: a year of its own keeps parallel runs, and the real weeks, apart.
  const weekKey = `${2100 + (Date.now() % 800)}-W45`;
  const SECRET = "test-challenge-secret-0123456789abcdef";
  let challengeId = "";
  const players = { straight: "", live: "" };
  const saveIds = { straight: "", live: "" };

  const loaded = () => {
    if (
      db === undefined ||
      saves === undefined ||
      matchday === undefined ||
      live === undefined ||
      standings === undefined ||
      support === undefined ||
      limits === undefined
    ) {
      throw new Error("Modules not loaded");
    }
    return { db, saves, matchday, live, standings, support, limits };
  };

  const entryOf = (saveId: string) =>
    loaded().db.challengeEntry.findUniqueOrThrow({
      where: { saveId },
      select: { userId: true, matchdaysPlayed: true, points: true, goalDiff: true, goalsFor: true, submittedAt: true },
    });

  /** One date of the save, its club's match paused at half-time then resumed without a change in the live mode. */
  const playDate = async (saveId: string, liveMode: boolean): Promise<void> => {
    const { matchday, live } = loaded();
    const day = await matchday.playNextMatchday(saveId, { pauseManagedMatch: liveMode });
    if (day === null) {
      throw new Error(`Save ${saveId} has nothing left to play`);
    }
    if (day.managed?.halfTime === true) {
      // A cup tie level after 90 minutes stops once more, at the end of regulation time.
      for (let breaks = 0; (await live.resumeLiveMatch(saveId, null)).result === null; breaks++) {
        expect(breaks).toBeLessThan(2);
      }
    }
  };

  /** Plays dates until the save's entry is submitted; how many. */
  const playUntilSubmitted = async (saveId: string, liveMode: boolean): Promise<number> => {
    for (let dates = 1; dates <= MAX_DATES; dates++) {
      await playDate(saveId, liveMode);
      if ((await entryOf(saveId)).submittedAt !== null) {
        return dates;
      }
    }
    throw new Error(`No score after ${MAX_DATES} dates`);
  };

  beforeAll(async () => {
    const [{ prisma }, savesModule, matchdayModule, liveModule, standingsModule, supportModule, limitsModule, { ensureChallenge }] =
      await Promise.all([
        import("./client"),
        import("./saves"),
        import("./matchday"),
        import("./live-match"),
        import("./standings"),
        import("./test-support"),
        import("../lib/limits"),
        import("./challenge"),
      ]);
    db = prisma;
    saves = savesModule;
    matchday = matchdayModule;
    live = liveModule;
    standings = standingsModule;
    support = supportModule;
    limits = limitsModule;
    ({ id: challengeId } = await ensureChallenge(weekKey, SECRET));
    [players.straight, players.live] = await Promise.all([supportModule.createTestOwner(), supportModule.createTestOwner()]);
    for (const way of ["straight", "live"] as const) {
      ({ id: saveIds[way] } = await savesModule.createChallengeSave({ challengeId, managerName: "Test", ownerId: players[way] }));
    }
  }, 180_000);

  afterAll(async () => {
    await support?.deleteTestChallenges([weekKey]);
    await db?.$disconnect();
  }, 120_000);

  it("gives both players exactly the same score at the tenth matchday, that of their club in the standings", async () => {
    const { db, standings } = loaded();

    const dates = {
      straight: await playUntilSubmitted(saveIds.straight, false),
      live: await playUntilSubmitted(saveIds.live, true),
    };

    expect(dates.live).toBe(dates.straight);
    const [straight, liveEntry] = await Promise.all([entryOf(saveIds.straight), entryOf(saveIds.live)]);
    const score = ({ matchdaysPlayed, points, goalDiff, goalsFor }: typeof straight) => ({ matchdaysPlayed, points, goalDiff, goalsFor });
    expect(score(liveEntry)).toEqual(score(straight));
    expect(straight.matchdaysPlayed).toBe(CHALLENGE_HORIZON_MATCHDAYS);

    // The club's row in its league's table, played exactly up to the horizon.
    for (const saveId of [saveIds.straight, saveIds.live]) {
      const managed = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { competitionId: true } });
      const season = await db.season.findUniqueOrThrow({
        where: { saveId_competitionId_startYear: { saveId, competitionId: managed.competitionId, startYear: WORLD_START_YEAR } },
        select: { id: true },
      });
      const row = (await standings.getStandings(saveId, season.id)).find((club) => club.isManaged);
      expect(row).toMatchObject({
        played: CHALLENGE_HORIZON_MATCHDAYS,
        points: straight.points,
        goalDifference: straight.goalDiff,
        goalsFor: straight.goalsFor,
      });
    }
  }, 600_000);

  it("writes the entry once: the following matchdays change nothing", async () => {
    const before = await Promise.all([entryOf(saveIds.straight), entryOf(saveIds.live)]);

    for (let date = 0; date < 4; date++) {
      await playDate(saveIds.straight, false);
      await playDate(saveIds.live, true);
    }

    expect(await Promise.all([entryOf(saveIds.straight), entryOf(saveIds.live)])).toEqual(before);
  }, 300_000);

  it("refuses a player's second save of the week, even once the first is deleted, and the entry goes with its player", async () => {
    const { db, saves, limits } = loaded();
    const again = () => saves.createChallengeSave({ challengeId, managerName: "Test", ownerId: players.straight });

    await expect(again()).rejects.toBeInstanceOf(limits.ChallengeEntryExistsError);

    // Deleting a played challenge save: the cascade crosses the new relation, the entry stays without its save.
    await saves.deleteSave(saveIds.straight);
    expect(await db.challengeEntry.findUniqueOrThrow({ where: { challengeId_userId: { challengeId, userId: players.straight } } })).toMatchObject({
      saveId: null,
      matchdaysPlayed: CHALLENGE_HORIZON_MATCHDAYS,
    });
    await expect(again()).rejects.toBeInstanceOf(limits.ChallengeEntryExistsError);

    // Deleting the player, as an account's deletion: the entry goes with them.
    await db.user.delete({ where: { id: players.straight } });
    expect(await db.challengeEntry.count({ where: { userId: players.straight } })).toBe(0);
  }, 120_000);
});
