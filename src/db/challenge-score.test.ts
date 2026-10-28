import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHALLENGE_HORIZON_MATCHDAYS } from "../config/challenge";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// A challenge save's score, against DATABASE_URL: bare challenge saves of a week of a far year, with two clubs and
// fixtures written by hand (no world: only their scores matter here), deleted at the end with the challenge
// (deleteTestChallenges); a throwaway owner, deleted once saveless. The whole path, real matchdays and the live match,
// is in challenge.slow.test.ts. Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a challenge save's score, in the database", () => {
  let db: typeof prismaClient | undefined;
  let challenges: typeof import("./challenge") | undefined;
  let support: typeof import("./test-support") | undefined;
  // Real time, not simulation code: a year of its own keeps parallel runs, and the real weeks, apart.
  const weekKey = `${2100 + (Date.now() % 800)}-W30`;
  const SECRET = "test-challenge-secret-0123456789abcdef";
  let challengeId = "";
  let saveId = "";
  /** Fixture ids: the league's first season by matchday, a cup tie, the next season's first matchday. */
  const league = new Map<number, string>();
  let cupTie = "";
  let nextSeason = "";
  /** The challenge club's goals then the opponent's, matchday after matchday: 13 points, 12 scored, 10 conceded. */
  const RESULTS = [
    [2, 0],
    [1, 1],
    [0, 2],
    [3, 1],
    [1, 1],
    [0, 0],
    [2, 3],
    [2, 0],
    [1, 1],
    [0, 1],
  ] as const;

  const loaded = () => {
    if (db === undefined || challenges === undefined || support === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, challenges, support };
  };

  const record = (id: string, challenge: string | null) =>
    loaded().db.$transaction((tx) => loaded().challenges.recordChallengeScore(tx, id, challenge));

  const entry = () =>
    loaded().db.challengeEntry.findUniqueOrThrow({
      where: { saveId },
      select: { matchdaysPlayed: true, points: true, goalDiff: true, goalsFor: true, submittedAt: true },
    });

  /** Plays a fixture: the challenge club is at home on odd matchdays. */
  const play = (fixtureId: string, round: number, [scored, conceded]: readonly [number, number]) =>
    loaded().db.fixture.update({
      where: { id: fixtureId },
      data: { played: true, status: "PLAYED", ...(round % 2 === 1 ? { homeGoals: scored, awayGoals: conceded } : { homeGoals: conceded, awayGoals: scored }) },
    });

  beforeAll(async () => {
    const [{ prisma }, challengeModule, supportModule] = await Promise.all([import("./client"), import("./challenge"), import("./test-support")]);
    db = prisma;
    challenges = challengeModule;
    support = supportModule;
    ({ id: challengeId } = await challengeModule.ensureChallenge(weekKey, SECRET));
    const ownerId = await supportModule.createTestOwner();
    const [clubs, cup] = await Promise.all([
      prisma.club.findMany({ where: { competition: { code: "fr.2" } }, orderBy: { slug: "asc" }, take: 2, select: { id: true, competitionId: true } }),
      prisma.competition.findUniqueOrThrow({ where: { code: "fr.cup" }, select: { id: true } }),
    ]);
    const [own, other] = clubs;
    if (own === undefined || other === undefined || own.competitionId === null) {
      throw new Error("Two clubs of fr.2 expected");
    }
    const save = await prisma.save.create({
      data: { name: "Test score", managerName: "Test", seed: `test-${weekKey}`, worldVersion: 2, currentDate: new Date("2026-07-01T00:00:00.000Z"), ownerId, challengeId },
      select: { id: true },
    });
    saveId = save.id;
    await prisma.challengeEntry.create({ data: { challengeId, userId: ownerId, saveId } });
    const ownSave = await prisma.clubSave.create({ data: { saveId, clubId: own.id, competitionId: own.competitionId, isManaged: true }, select: { id: true } });
    const otherSave = await prisma.clubSave.create({ data: { saveId, clubId: other.id, competitionId: own.competitionId }, select: { id: true } });
    const season = (competitionId: string, startYear: number) =>
      prisma.season.create({ data: { saveId, competitionId, startYear }, select: { id: true } });
    const [first, cupSeason, second] = await Promise.all([
      season(own.competitionId, WORLD_START_YEAR),
      season(cup.id, WORLD_START_YEAR),
      season(own.competitionId, WORLD_START_YEAR + 1),
    ]);
    const fixture = (seasonId: string, round: number, day: string) =>
      prisma.fixture.create({
        data: {
          saveId,
          seasonId,
          round,
          scheduledAt: new Date(day),
          homeClubSaveId: round % 2 === 1 ? ownSave.id : otherSave.id,
          awayClubSaveId: round % 2 === 1 ? otherSave.id : ownSave.id,
        },
        select: { id: true },
      });
    for (let round = 1; round <= CHALLENGE_HORIZON_MATCHDAYS + 1; round++) {
      league.set(round, (await fixture(first.id, round, `2026-08-${String(round + 10).padStart(2, "0")}T00:00:00.000Z`)).id);
    }
    cupTie = (await fixture(cupSeason.id, 1, "2026-09-23T00:00:00.000Z")).id;
    nextSeason = (await fixture(second.id, 1, "2027-08-21T00:00:00.000Z")).id;
  }, 60_000);

  afterAll(async () => {
    await support?.deleteTestChallenges([weekKey]);
    await db?.$disconnect();
  }, 60_000);

  const fixtureOf = (round: number): string => {
    const id = league.get(round);
    if (id === undefined) {
      throw new Error(`No fixture for matchday ${round}`);
    }
    return id;
  };

  it("counts its club's league matchdays, then writes the score once the horizon is played, and never again", async () => {
    await record(saveId, challengeId);
    expect(await entry()).toEqual({ matchdaysPlayed: 0, points: null, goalDiff: null, goalsFor: null, submittedAt: null });

    for (let round = 1; round < CHALLENGE_HORIZON_MATCHDAYS; round++) {
      await play(fixtureOf(round), round, RESULTS[round - 1] ?? [0, 0]);
    }
    await record(saveId, challengeId);
    expect(await entry()).toEqual({ matchdaysPlayed: 9, points: null, goalDiff: null, goalsFor: null, submittedAt: null });

    await play(fixtureOf(CHALLENGE_HORIZON_MATCHDAYS), CHALLENGE_HORIZON_MATCHDAYS, RESULTS[CHALLENGE_HORIZON_MATCHDAYS - 1] ?? [0, 0]);
    await record(saveId, challengeId);
    const submitted = await entry();
    expect(submitted).toMatchObject({ matchdaysPlayed: 10, points: 13, goalDiff: 2, goalsFor: 12 });
    // The database's clock, read back in UTC: the real time of the submission. Not simulation code.
    expect(Math.abs((submitted.submittedAt?.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);

    // Matchday 11, a cup tie, the next season: nothing counts any more.
    await play(fixtureOf(CHALLENGE_HORIZON_MATCHDAYS + 1), CHALLENGE_HORIZON_MATCHDAYS + 1, [5, 0]);
    await play(cupTie, 1, [6, 0]);
    await play(nextSeason, 1, [7, 0]);
    await record(saveId, challengeId);
    expect(await entry()).toEqual(submitted);
  });

  it("does nothing for an ordinary save, nor for a challenge save without an entry", async () => {
    const { db } = loaded();
    const ownerId = await loaded().support.createTestOwner();
    const { id: withoutEntry } = await db.save.create({
      data: { name: "Test score sans entrée", managerName: "Test", seed: `test-${weekKey}`, worldVersion: 2, currentDate: new Date("2026-07-01T00:00:00.000Z"), ownerId, challengeId },
      select: { id: true },
    });

    await record(withoutEntry, challengeId);
    await record(withoutEntry, null);

    expect(await db.challengeEntry.count({ where: { userId: ownerId } })).toBe(0);
  });
});
