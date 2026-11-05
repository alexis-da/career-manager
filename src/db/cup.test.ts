import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CUP_RUNNER_UP_PRIZE, CUP_WINNER_PRIZE, EXTRA_TIME_END_MINUTE, REGULATION_MINUTES } from "../engine/balance";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

const TIE_DATE = new Date(Date.UTC(WORLD_START_YEAR, 7, 12)); // a Wednesday before the first matchday
const OPPONENT_SLUG = "aj-auxerre";

// A cup final of the managed club, stopped at half-time, then at the end of regulation time, then resumed, on a
// throwaway twin of the demo save (a worldVersion 1 save, half as heavy as one with the cups, given a cup season and a
// tie by hand). With the demo's seed, the engine with fatigue, Auxerre in the formation it chooses (gameplay v2) and the
// managed club in a 5-3-2, this final away at Auxerre is 1-1 after 90 minutes, 2-2 after extra time, and the managed
// club wins the shoot-out 6-5 (e2e/cup.spec.ts plays it live). Runs against DATABASE_URL and is skipped without it;
// modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a cup tie of the managed club", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let fixtureId = "";
  let clubs = { managed: "", opponent: "" };
  let budgetsBefore = new Map<string, number>();
  let halfTimeKnockout: boolean | undefined;
  // What the second half left: a level tie waiting for extra time.
  let atRegulationEnd:
    | { pause: unknown; status: string; liveFixtureId: string | null; phase: string | null; maxSubstitutions: number | null }
    | undefined;

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support, matchday, live, liveState] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./live-match"),
      import("./live-state"),
    ]);
    db = prisma;
    saveId = await support.createDemoTwin("Test coupe");

    const [cup, managed, opponent] = await Promise.all([
      prisma.competition.findUniqueOrThrow({ where: { code: "fr.cup" }, select: { id: true } }),
      prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, budget: true } }),
      prisma.clubSave.findFirstOrThrow({ where: { saveId, club: { slug: OPPONENT_SLUG } }, select: { id: true, budget: true } }),
    ]);
    clubs = { managed: managed.id, opponent: opponent.id };
    await prisma.clubSave.update({ where: { id: managed.id }, data: { formation: "5-3-2" } });
    budgetsBefore = new Map([
      [managed.id, managed.budget],
      [opponent.id, opponent.budget],
    ]);
    const season = await prisma.season.create({ data: { saveId, competitionId: cup.id, startYear: WORLD_START_YEAR }, select: { id: true } });
    ({ id: fixtureId } = await prisma.fixture.create({
      data: { saveId, seasonId: season.id, round: 6, scheduledAt: TIE_DATE, homeClubSaveId: opponent.id, awayClubSaveId: managed.id },
      select: { id: true },
    }));

    const day = await matchday.playNextMatchday(saveId, { pauseManagedMatch: true });
    expect(day).toMatchObject({ fixtures: 1, managed: { fixtureId, live: true } });
    await support.playLiveMatch(saveId, "break");
    const paused = await prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId }, select: { liveState: true } });
    halfTimeKnockout = liveState.parseLiveState(fixtureId, paused.liveState).state.knockout;
    const secondHalf = await support.playLiveMatch(saveId, "break");
    const [waiting, saveAtBreak, breakTeam] = await Promise.all([
      prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId }, select: { status: true } }),
      prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true } }),
      live.getHalfTimeTeam(saveId),
    ]);
    atRegulationEnd = {
      pause: secondHalf,
      status: waiting.status,
      liveFixtureId: saveAtBreak.liveFixtureId,
      phase: breakTeam?.phase ?? null,
      maxSubstitutions: breakTeam?.maxSubstitutions ?? null,
    };
    await support.playLiveMatch(saveId, "end");
  }, 300_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  it("keeps the tie a knockout match across half-time, waits at the end of regulation time, then plays extra time and the shoot-out", async () => {
    const fixture = await database().fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      select: {
        status: true,
        homeGoals: true,
        awayGoals: true,
        decidedBy: true,
        homePenalties: true,
        awayPenalties: true,
        winnerClubSaveId: true,
        events: { select: { minute: true, period: true, type: true, side: true, relatedPlayerSaveId: true } },
      },
    });
    const kicks = fixture.events.filter((event) => event.period === "SHOOTOUT");
    const extraTime = fixture.events.filter((event) => event.period === "EXTRA_TIME");

    expect(halfTimeKnockout).toBe(true);
    expect(atRegulationEnd).toEqual({
      pause: { phase: "REGULATION_END", minute: REGULATION_MINUTES },
      status: "REGULATION_END",
      liveFixtureId: fixtureId,
      phase: "REGULATION_END",
      maxSubstitutions: 6,
    });
    expect(fixture).toMatchObject({
      status: "PLAYED",
      homeGoals: 2,
      awayGoals: 2,
      decidedBy: "PENALTIES",
      homePenalties: 5,
      awayPenalties: 6,
      winnerClubSaveId: clubs.managed,
    });
    expect(kicks.every((kick) => kick.type === "SHOOTOUT_GOAL" || kick.type === "SHOOTOUT_MISS")).toBe(true);
    expect(kicks.filter((kick) => kick.type === "SHOOTOUT_GOAL" && kick.side === "HOME")).toHaveLength(5);
    expect(kicks.filter((kick) => kick.type === "SHOOTOUT_GOAL" && kick.side === "AWAY")).toHaveLength(6);
    expect(kicks.every((kick) => kick.relatedPlayerSaveId !== null)).toBe(true); // the goalkeeper facing the kick
    expect(extraTime.every((event) => event.minute > REGULATION_MINUTES && event.minute <= EXTRA_TIME_END_MINUTE)).toBe(true);
    // Level after 90 minutes (1-1), then a goal each in extra time.
    const goals = (period: string, side: string) =>
      fixture.events.filter((event) => event.type === "GOAL" && event.period === period && event.side === side).length;
    expect([goals("REGULAR", "HOME"), goals("REGULAR", "AWAY"), goals("EXTRA_TIME", "HOME"), goals("EXTRA_TIME", "AWAY")]).toEqual([1, 1, 1, 1]);
  });

  it("gives season stats in the cup to the managed club's players only, with their minutes of extra time", async () => {
    const stats = await database().playerSeasonStats.findMany({
      where: { saveId, season: { competition: { code: "fr.cup" } } },
      select: { minutes: true, playerSave: { select: { clubSaveId: true } } },
    });

    expect(stats.length).toBeGreaterThanOrEqual(11);
    expect(stats.every((row) => row.playerSave.clubSaveId === clubs.managed)).toBe(true);
    expect(Math.max(...stats.map((row) => row.minutes))).toBe(EXTRA_TIME_END_MINUTE);
  });

  it("shows the cup round by round, the managed club as its winner, and the cup in the navigation", async () => {
    const view = await import("./cup-view");
    const [bracket, withCup, winner] = await Promise.all([
      view.getCupBracket(saveId),
      view.hasCup(saveId),
      view.getCupWinnerName(saveId, WORLD_START_YEAR),
    ]);

    expect(withCup).toBe(true);
    expect(bracket?.competitionCode).toBe("fr.cup");
    expect(bracket?.rounds.map((round) => round.ties.length)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(bracket?.rounds[5].ties[0]).toMatchObject({ played: true, decidedBy: "PENALTIES", homePenalties: 5, awayPenalties: 6 });
    expect(bracket?.winner?.clubSaveId).toBe(clubs.managed);
    expect(bracket?.managedRun).toEqual({ firstRound: 6, lastRound: 6, status: "won" });
    expect(winner).toBe("Olympique Lyonnais");
  });

  it("pays both finalists, draws nothing after the final, and lets the save play on", async () => {
    const db = database();
    const [budgets, ties, save] = await Promise.all([
      db.clubSave.findMany({ where: { saveId, id: { in: [clubs.managed, clubs.opponent] } }, select: { id: true, budget: true } }),
      db.fixture.count({ where: { saveId, season: { competition: { code: "fr.cup" } } } }),
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, currentDate: true } }),
    ]);
    const gained = new Map(budgets.map((club) => [club.id, club.budget - (budgetsBefore.get(club.id) ?? 0)]));

    expect(gained.get(clubs.managed)).toBe(CUP_WINNER_PRIZE);
    expect(gained.get(clubs.opponent)).toBe(CUP_RUNNER_UP_PRIZE);
    expect(ties).toBe(1);
    expect(save).toEqual({ liveFixtureId: null, currentDate: TIE_DATE });
  });
});
