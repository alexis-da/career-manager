import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The proof that the event cleanup (src/db/event-cleanup.ts) changes nothing a player or the administrator sees, on a
// throwaway twin of the worldVersion 2 demo save with its cups: two seasons played and advanced, then a third played on
// to a match paused live at half-time. Its other matches' goals are put back as the game kept them before
// Fixture.goalTimes (keepOtherGoalsAsEvents) up to a day of the third season, the change, and on the current date, whose
// live match a player could have paused since: seasons played before and after the change. Every screen's data is read
// before the cleanup, after its count and after its deletion, pass after pass, and must not move: the match sheets and
// the calendar, the live page and its other matches, the honours and each season's review, the tables, the cup, the
// squad, the dashboard and the players' sheets with their statistics, the simulation's summary, the moves, /admin and
// its statistics, but for the database's size, which is what the cleanup frees, and its own passes. Every pass is scoped
// to the twin (saveIds): the database's other saves are never touched. Skipped without DATABASE_URL; modules are
// imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the event cleanup, screen by screen, over seasons played before and after the change", () => {
  let db: typeof prismaClient | undefined;
  let modules: Awaited<ReturnType<typeof load>> | undefined;
  let saveId = "";
  let managedId = "";
  let today = new Date(0);
  let change = new Date(0); // the day of the third season up to which the other matches' goals were kept as events
  let seasonStart = new Date(0);
  let startedAt = new Date(0); // the database's clock before the first pass: the file's passes are deleted at the end
  // Not simulation code: /admin is read at one time, the same for every read.
  const now = new Date();
  let before: Awaited<ReturnType<typeof screens>> | undefined;
  let counted: import("./event-cleanup").EventCleanupPass | undefined;

  async function load() {
    const [client, support, matchday, season, liveMatch, cleanup, calendar, standings, cupView, seasonResults, objectives, promotion, squad, dashboard, market, simulation, adminDashboard, stats, errors] =
      await Promise.all([
        import("./client"),
        import("./test-support"),
        import("./matchday"),
        import("./season"),
        import("./live-match"),
        import("./event-cleanup"),
        import("./calendar"),
        import("./standings"),
        import("./cup-view"),
        import("./season-results"),
        import("./objectives"),
        import("./promotion"),
        import("./squad"),
        import("./dashboard"),
        import("./market"),
        import("./simulation"),
        import("./admin-dashboard"),
        import("./stats"),
        import("./errors"),
      ]);
    return { prisma: client.prisma, support, matchday, season, liveMatch, cleanup, calendar, standings, cupView, seasonResults, objectives, promotion, squad, dashboard, market, simulation, adminDashboard, stats, errors };
  }

  const loaded = () => {
    if (db === undefined || modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, ...modules };
  };

  /** Every screen's data as the pages read it, in one object to compare. */
  async function screens() {
    const m = loaded();
    const completed = await m.db.seasonResult.findMany({
      where: { saveId },
      orderBy: { season: { startYear: "asc" } },
      select: { seasonId: true, season: { select: { startYear: true } } },
    });
    const seasons = await m.db.season.findMany({ where: { saveId }, orderBy: [{ startYear: "asc" }, { competitionId: "asc" }], select: { id: true } });
    // The managed squad's sheets, and the twenty best scorers of the save's every season, wherever they are now.
    const squadIds = await m.db.playerSave.findMany({ where: { saveId, clubSaveId: managedId }, orderBy: { playerKey: "asc" }, select: { id: true } });
    const scorers = await m.db.playerSeasonStats.findMany({
      where: { saveId },
      orderBy: [{ goals: "desc" }, { playerSaveId: "asc" }],
      take: 20,
      select: { playerSaveId: true },
    });
    const sheetIds = [...new Set([...squadIds.map((player) => player.id), ...scorers.map((row) => row.playerSaveId)])];
    const moves = [];
    for (let page = 1, pages = 1; page <= pages; page++) {
      const list = await m.market.listTransfers(saveId, { mine: false, page });
      pages = list.pageCount;
      moves.push(list);
    }
    const reviews = [];
    for (const { seasonId, season } of completed) {
      reviews.push({
        result: await m.seasonResults.getSeasonResult(saveId, seasonId),
        objectives: await m.objectives.getClosedObjectives(saveId, seasonId),
        moves: await m.promotion.getCountryMoves(saveId, seasonId),
        cupWinner: await m.cupView.getCupWinnerName(saveId, season.startYear),
      });
    }
    const tables = [];
    for (const { id } of seasons) {
      tables.push(await m.standings.getStandings(saveId, id));
    }
    const sheets = [];
    for (const id of sheetIds) {
      sheets.push(await m.market.getPlayerSheet(saveId, id));
    }
    const week = await m.adminDashboard.getAdminDashboard(m.db, now, 7);
    const month = await m.adminDashboard.getAdminDashboard(m.db, now, 30);
    const adminStats = await m.stats.getAdminStats(m.db, now);
    // The database's size is what the cleanup frees, and its passes are its own: the rest of /admin must not move.
    const withoutSizes = (figures: typeof week) => ({
      ...figures,
      health: { ...figures.health, databaseBytes: 0, storageCost: 0, projectedBytes: null, projectedCost: null, costAlert: false, cleanup: [] },
    });
    const statsFigures = { ...adminStats, databaseBytes: 0, largestTables: [] };
    return {
      matchSheetsAndCalendar: await m.calendar.getManagedClubCalendar(saveId),
      live: await m.calendar.getLiveMatchday(saveId),
      liveWaiting: await m.liveMatch.getLiveWaiting(saveId),
      halfTime: await m.liveMatch.getHalfTimeTeam(saveId),
      honours: await m.seasonResults.getSeasonResults(saveId),
      reviews,
      latestTables: await m.standings.getLatestSeasonTables(saveId),
      tables,
      cup: await m.cupView.getCupBracket(saveId),
      squad: await m.squad.getSquadView(saveId),
      dashboard: await m.dashboard.getDashboard(saveId),
      sheets,
      simulation: await m.simulation.getSimulationSummary(saveId, seasonStart),
      moves,
      myMoves: await m.market.listTransfers(saveId, { mine: true, page: 1 }),
      admin: { week: withoutSizes(week), month: withoutSizes(month), stats: statsFigures, errors: await m.errors.getErrorsSection(m.db, now) },
    };
  }

  /** What the twin holds of each kind, read through Prisma, apart from the cleanup's own SQL. */
  async function counts() {
    const { db } = loaded();
    const other = { homeClubSaveId: { not: managedId }, awayClubSaveId: { not: managedId } };
    const managed = { OR: [{ homeClubSaveId: managedId }, { awayClubSaveId: managedId }] };
    return {
      otherGoalsPast: await db.matchEvent.count({ where: { type: "GOAL", fixture: { saveId, ...other, scheduledAt: { lt: today } } } }),
      otherGoalsToday: await db.matchEvent.count({ where: { type: "GOAL", fixture: { saveId, ...other, scheduledAt: today } } }),
      managedEventsCompleted: await db.matchEvent.count({ where: { fixture: { saveId, ...managed, season: { completed: true } } } }),
      managedEventsInProgress: await db.matchEvent.count({ where: { fixture: { saveId, ...managed, season: { completed: false } } } }),
      decisionsCompleted: await db.matchDecision.count({ where: { fixture: { saveId, ...managed, season: { completed: true } } } }),
      decisionsInProgress: await db.matchDecision.count({ where: { fixture: { saveId, ...managed, season: { completed: false } } } }),
      goalTimes: await db.fixture.count({ where: { saveId, goalTimes: { isEmpty: false } } }),
      stats: await db.playerSeasonStats.count({ where: { saveId } }),
      transfers: await db.transfer.count({ where: { saveId } }),
    };
  }

  beforeAll(async () => {
    modules = await load();
    const { prisma, support, matchday, season, liveMatch } = modules;
    db = prisma;
    [{ now: startedAt }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    saveId = await support.createDemoTwin("Test nettoyage, écran par écran", 2, true);
    ({ id: managedId } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }));
    const currentDate = async () => (await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } })).currentDate;

    // Two seasons played to their end and advanced.
    for (let year = 0; year < 2; year++) {
      await support.playRemainingMatchdays(saveId);
      await season.advanceToNextSeason(saveId);
    }
    seasonStart = await currentDate();
    // The third season: twelve dates, the change, then six more, then on to the managed club's match, paused at half-time.
    for (let date = 0; date < 12; date++) {
      await matchday.playNextMatchday(saveId);
    }
    change = await currentDate();
    for (let date = 0; date < 6; date++) {
      await matchday.playNextMatchday(saveId);
    }
    for (let date = 0; (await liveMatch.getLivePause(saveId)) === null; date++) {
      if (date === 10) {
        throw new Error("No match of the managed club in ten dates");
      }
      await matchday.playNextMatchday(saveId, { pauseManagedMatch: true });
    }
    await support.playLiveMatch(saveId, "break");
    today = await currentDate();

    // Played before the change: the two seasons and the third up to its twelfth date, and today's matches.
    await support.keepOtherGoalsAsEvents(saveId, { lte: change });
    await support.keepOtherGoalsAsEvents(saveId, { equals: today });
    before = await screens();
  }, 1_200_000);

  afterAll(async () => {
    await db?.cleanupPass.deleteMany({ where: { at: { gte: startedAt } } });
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 300_000);

  it("plays two seasons before the change and a third across it, a match paused live today", async () => {
    const { db, liveMatch } = loaded();
    const kept = await counts();
    const seasons = await db.season.findMany({
      where: { saveId, competition: { kind: "LEAGUE" }, fixtures: { some: { OR: [{ homeClubSaveId: managedId }, { awayClubSaveId: managedId }] } } },
      select: { completed: true },
    });

    expect(seasons.filter((season) => season.completed)).toHaveLength(2);
    expect(await liveMatch.getLivePause(saveId)).toMatchObject({ phase: "HALF_TIME" });
    expect(change.getTime()).toBeLessThan(today.getTime());
    // Goals kept the old way before the change and today, in goal times between them.
    expect(kept.otherGoalsPast).toBeGreaterThan(10_000);
    expect(kept.otherGoalsToday).toBeGreaterThan(0);
    expect(kept.goalTimes).toBeGreaterThan(0);
    expect(kept.managedEventsCompleted).toBeGreaterThan(0);
    expect(kept.decisionsCompleted).toBeGreaterThan(0);
    expect(kept.managedEventsInProgress).toBeGreaterThan(0);
    expect(kept.decisionsInProgress).toBeGreaterThan(0);
  });

  it("counts in a dry run the goals of the past dates and the completed seasons' events and decisions, and no screen moves", async () => {
    const { db, cleanup } = loaded();
    const kept = await counts();

    counted = await cleanup.cleanUpEvents(db, { dryRun: true, saveIds: [saveId] });

    expect(counted.deleted).toEqual({ otherGoals: 0, managedEvents: 0, decisions: 0 });
    expect(counted.remaining).toEqual({
      otherGoals: kept.otherGoalsPast,
      managedEvents: kept.managedEventsCompleted,
      decisions: kept.decisionsCompleted,
    });
    expect(await counts()).toEqual(kept);
    expect(await screens()).toEqual(before);
  });

  it("deletes them pass after pass within its batches, keeps everything else, and every screen reads the same", async () => {
    const { db, cleanup } = loaded();
    const kept = await counts();

    const passes = [];
    do {
      passes.push(await cleanup.cleanUpEvents(db, { dryRun: false, saveIds: [saveId], maxRows: 6_000, batchRows: 2_000 }));
    } while (cleanup.totalOf(passes.at(-1)?.remaining ?? { otherGoals: 0, managedEvents: 0, decisions: 0 }) > 0);

    expect(passes.length).toBeGreaterThan(1);
    expect(passes.every((pass) => cleanup.totalOf(pass.deleted) <= 6_000)).toBe(true);
    // What the count announced, deleted to the row.
    const deleted = passes.reduce(
      (sum, pass) => ({
        otherGoals: sum.otherGoals + pass.deleted.otherGoals,
        managedEvents: sum.managedEvents + pass.deleted.managedEvents,
        decisions: sum.decisions + pass.deleted.decisions,
      }),
      { otherGoals: 0, managedEvents: 0, decisions: 0 },
    );
    expect(deleted).toEqual(counted?.remaining);
    expect(await counts()).toEqual({ ...kept, otherGoalsPast: 0, managedEventsCompleted: 0, decisionsCompleted: 0 });
    expect(await screens()).toEqual(before);
  });
});
