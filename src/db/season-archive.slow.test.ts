import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The proof that the archive of the completed seasons (src/db/season-archiving.ts) changes nothing a player or the
// administrator sees, on a throwaway twin of the worldVersion 2 demo save with its cups and its European competitions: two
// seasons played and advanced (thirty-four completed seasons, leagues, cups and European competitions), then two dates of
// the third, so that the next opponent's recent form
// reaches back into the season before. Every screen's data is read before the task, after its count, after its archiving
// (the rows still there, the screens reading the archives), and after its deletion of the rows, pass after pass, and
// must not move: the honours and each season's review (result, objectives, moves, the cup's and the European winners),
// every season's
// table, the latest tables, the cup, the players' sheets with their statistics, the moves, the opponent's preview and
// recent form, the first steps, the sign-in banner, the dashboard, the club and its dotation, the calendar, the squad,
// the simulation's summary, /admin and its statistics (the twin made yesterday, so that /admin/stats counts its first
// steps), but for the database's size, which is what the task frees, and the maintenance's own passes. Then the archives
// are taken away, the rows gone: the same screens differ, so a deletion without its archive would not pass. Every pass is
// scoped to the twin (saveIds). Skipped without DATABASE_URL; modules are imported lazily because the client throws
// without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the archive of the completed seasons, screen by screen", () => {
  let db: typeof prismaClient | undefined;
  let modules: Awaited<ReturnType<typeof load>> | undefined;
  let saveId = "";
  let managedId = "";
  let seasonStart = new Date(0); // the third season's first day
  let startedAt = new Date(0); // the database's clock before the first pass: the file's passes are deleted at the end
  let sheetIds: string[] = [];
  // Not simulation code: /admin is read at one time, the same for every read.
  const now = new Date();
  let before: Awaited<ReturnType<typeof screens>> | undefined;
  let counted: import("./season-archiving").ArchivePassResult | undefined;

  async function load() {
    const [
      client,
      support,
      matchday,
      season,
      archiving,
      calendar,
      standings,
      cupView,
      seasonResults,
      objectives,
      promotion,
      squad,
      dashboard,
      market,
      simulation,
      opponent,
      firstSteps,
      saves,
      club,
      adminDashboard,
      stats,
      errors,
      europeResults,
      careerHistory,
    ] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./season"),
      import("./season-archiving"),
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
      import("./opponent"),
      import("./first-steps"),
      import("./saves"),
      import("./club"),
      import("./admin-dashboard"),
      import("./stats"),
      import("./errors"),
      import("./europe-results"),
      import("./career-history"),
    ]);
    return {
      prisma: client.prisma,
      support,
      matchday,
      season,
      archiving,
      calendar,
      standings,
      cupView,
      seasonResults,
      objectives,
      promotion,
      squad,
      dashboard,
      market,
      simulation,
      opponent,
      firstSteps,
      saves,
      club,
      adminDashboard,
      stats,
      errors,
      europeResults,
      careerHistory,
    };
  }

  const loaded = () => {
    if (db === undefined || modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, ...modules };
  };

  /** A screen's data, or the error its reading met: a reading that throws is a difference too. */
  async function settled<T>(read: () => Promise<T>): Promise<T | { error: string }> {
    try {
      return await read();
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Every screen's data as the pages read it, in one object to compare. */
  async function screens() {
    const m = loaded();
    const completed = await m.db.seasonResult.findMany({
      where: { saveId },
      orderBy: { season: { startYear: "asc" } },
      select: { seasonId: true, season: { select: { startYear: true } } },
    });
    const seasons = await m.db.season.findMany({
      where: { saveId },
      orderBy: [{ startYear: "asc" }, { competitionId: "asc" }],
      select: { id: true, competition: { select: { kind: true } } },
    });
    const moves = [];
    for (let page = 1, pages = 1; page <= pages; page++) {
      const list = await m.market.listTransfers(saveId, { mine: false, page });
      pages = list.pageCount;
      moves.push(list);
    }
    const reviews = [];
    for (const { seasonId, season } of completed) {
      reviews.push({
        result: await settled(() => m.seasonResults.getSeasonResult(saveId, seasonId)),
        objectives: await settled(() => m.objectives.getClosedObjectives(saveId, seasonId)),
        moves: await settled(() => m.promotion.getCountryMoves(saveId, seasonId)),
        cupWinner: await settled(() => m.cupView.getCupWinnerName(saveId, season.startYear)),
        europeWinners: await settled(() => m.europeResults.getEuropeWinners(saveId, season.startYear)),
      });
    }
    // Every league season's table, those of the completed seasons from their archives once archived.
    const tables = [];
    for (const { id, competition } of seasons) {
      if (competition.kind === "LEAGUE") {
        tables.push(await settled(() => m.standings.getStandings(saveId, id)));
      }
    }
    const sheets = [];
    for (const id of sheetIds) {
      sheets.push(await settled(() => m.market.getPlayerSheet(saveId, id)));
    }
    const week = await m.adminDashboard.getAdminDashboard(m.db, now, 7);
    const month = await m.adminDashboard.getAdminDashboard(m.db, now, 30);
    const adminStats = await m.stats.getAdminStats(m.db, now);
    // The database's size is what the task frees, and the maintenance's passes are its own: the rest must not move.
    const withoutSizes = (figures: typeof week) => ({
      ...figures,
      health: { ...figures.health, databaseBytes: 0, storageCost: 0, projectedBytes: null, projectedCost: null, costAlert: false, cleanup: [], archive: [] },
    });
    return {
      honours: await settled(() => m.seasonResults.getSeasonResults(saveId)),
      reviews,
      tables,
      latestTables: await settled(() => m.standings.getLatestSeasonTables(saveId)),
      cup: await settled(() => m.cupView.getCupBracket(saveId)),
      sheets,
      moves,
      myMoves: await m.market.listTransfers(saveId, { mine: true, page: 1 }),
      opponent: await settled(() => m.opponent.getOpponentPreview(saveId)),
      firstSteps: await settled(() => m.firstSteps.managedMatchesPlayed(saveId, 5)),
      firstStepsLong: await settled(() => m.firstSteps.managedMatchesPlayed(saveId, 200)),
      playedBanner: await settled(() => m.saves.hasPlayedMatch(saveId)),
      dashboard: await settled(() => m.dashboard.getDashboard(saveId)),
      club: await settled(() => m.club.getClubFinances(saveId)),
      prizes: await settled(() => m.club.getSeasonPrizes(saveId)),
      // The History tab: its completed part reads the archives, as its cache would keep it.
      history: await settled(() => m.careerHistory.getCareerHistory(m.db, saveId)),
      objectivesNow: await settled(() => m.objectives.getSeasonObjectives(saveId)),
      calendar: await settled(() => m.calendar.getManagedClubCalendar(saveId)),
      squad: await settled(() => m.squad.getSquadView(saveId)),
      simulation: await settled(() => m.simulation.getSimulationSummary(saveId, seasonStart)),
      admin: {
        week: withoutSizes(week),
        month: withoutSizes(month),
        stats: { ...adminStats, databaseBytes: 0, largestTables: [] },
        errors: await m.errors.getErrorsSection(m.db, now),
      },
    };
  }

  /** What the twin holds, read through Prisma, apart from the task's own SQL. */
  async function counts() {
    const { db } = loaded();
    const completed = { saveId, season: { completed: true } };
    const inProgress = { saveId, season: { completed: false } };
    return {
      archives: await db.seasonArchive.count({ where: { saveId } }),
      completedFixtures: await db.fixture.count({ where: completed }),
      completedStats: await db.playerSeasonStats.count({ where: completed }),
      completedEvents: await db.matchEvent.count({ where: { fixture: completed } }),
      completedDecisions: await db.matchDecision.count({ where: { fixture: completed } }),
      inProgressFixtures: await db.fixture.count({ where: inProgress }),
      inProgressStats: await db.playerSeasonStats.count({ where: inProgress }),
      inProgressEvents: await db.matchEvent.count({ where: { fixture: inProgress } }),
      transfers: await db.transfer.count({ where: { saveId } }),
      results: await db.seasonResult.count({ where: { saveId } }),
      players: await db.playerSave.count({ where: { saveId } }),
    };
  }

  beforeAll(async () => {
    modules = await load();
    const { prisma, support, matchday, season } = modules;
    db = prisma;
    [{ now: startedAt }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    saveId = await support.createDemoTwin("Test archives, écran par écran", 2, true);
    ({ id: managedId } = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }));
    // Made yesterday: /admin/stats counts the first steps of the complete days before today.
    await prisma.save.update({ where: { id: saveId }, data: { createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } });

    // Two seasons played to their end and advanced, then two dates of the third.
    for (let year = 0; year < 2; year++) {
      await support.playRemainingMatchdays(saveId);
      await season.advanceToNextSeason(saveId);
    }
    ({ currentDate: seasonStart } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }));
    for (let date = 0; date < 2; date++) {
      await matchday.playNextMatchday(saveId);
    }

    // The managed squad's sheets, and the twenty best scorers of the completed seasons, wherever they are now.
    const squadIds = await prisma.playerSave.findMany({ where: { saveId, clubSaveId: managedId }, orderBy: { playerKey: "asc" }, select: { id: true } });
    const scorers = await prisma.playerSeasonStats.findMany({
      where: { saveId, season: { completed: true } },
      orderBy: [{ goals: "desc" }, { playerSaveId: "asc" }],
      take: 20,
      select: { playerSaveId: true },
    });
    sheetIds = [...new Set([...squadIds.map((player) => player.id), ...scorers.map((row) => row.playerSaveId)])];
    before = await screens();
  }, 1_200_000);

  afterAll(async () => {
    await db?.archivePass.deleteMany({ where: { at: { gte: startedAt } } });
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 300_000);

  it("plays two seasons and two dates of a third, the opponent's recent form reaching into the season before", async () => {
    const { db } = loaded();
    const kept = await counts();
    const completed = await db.season.findMany({ where: { saveId, completed: true }, select: { competition: { select: { kind: true } } } });
    const opponent = before?.opponent;
    const recent = opponent !== undefined && opponent !== null && !("error" in opponent) ? opponent.recent : [];

    // Ten leagues and five cups a year.
    expect(completed.filter((season) => season.competition.kind === "LEAGUE")).toHaveLength(20);
    expect(completed.filter((season) => season.competition.kind === "CUP")).toHaveLength(10);
    expect(kept.completedFixtures).toBeGreaterThan(7_000);
    expect(kept.completedStats).toBeGreaterThan(7_000);
    expect(kept.completedEvents).toBeGreaterThan(0);
    expect(kept.completedDecisions).toBeGreaterThan(0);
    expect(kept.inProgressFixtures).toBeGreaterThan(0);
    expect(kept.inProgressStats).toBeGreaterThan(0);
    // His last five matches: some of this season, the others of the last.
    expect(recent).toHaveLength(5);
    expect(recent.some((result) => result.date >= seasonStart)).toBe(true);
    expect(recent.some((result) => result.date < seasonStart)).toBe(true);
    expect(before?.firstSteps).toBe(5);
    expect(before?.honours).toMatchObject({ seasons: [{}, {}] });
    expect(before?.reviews.every((review) => typeof review.cupWinner === "string")).toBe(true);
    // The twin counts in /admin/stats: made yesterday, ten matches played and more.
    expect(before?.admin.stats.firstSteps.at(-1)).toMatchObject({ tenMatches: expect.any(Number) });
  });

  it("counts the thirty-four completed seasons and their rows, and no screen moves", async () => {
    const { db, archiving } = loaded();
    const kept = await counts();

    counted = await archiving.runArchivePass(db, { mode: "count", saveIds: [saveId] });

    expect(counted).toMatchObject({ archived: 0, deletedSeasons: 0, mismatches: 0, pending: 34, deletable: 0, deletableNow: 0 });
    expect(counted.rowsRemaining).toBe(kept.completedFixtures + kept.completedStats);
    expect(await counts()).toEqual(kept);
    expect(await screens()).toEqual(before);
  });

  it("archives them without deleting a row, and every screen reads the same from the archives", async () => {
    const { db, archiving } = loaded();
    const kept = await counts();

    const passes = [];
    do {
      passes.push(await archiving.runArchivePass(db, { mode: "archive", saveIds: [saveId] }));
    } while ((passes.at(-1)?.pending ?? 0) > 0 && (passes.at(-1)?.archived ?? 0) > 0);

    expect(passes.reduce((sum, pass) => sum + pass.archived, 0)).toBe(34);
    expect(passes.every((pass) => pass.mismatches === 0 && pass.deletedSeasons === 0)).toBe(true);
    expect(passes.at(-1)).toMatchObject({ pending: 0, deletable: 34, rowsRemaining: counted?.rowsRemaining });
    expect(await counts()).toEqual({ ...kept, archives: 34 });
    expect(await screens()).toEqual(before);
  });

  it("deletes the archived rows pass after pass within its batches, keeps everything else, and every screen reads the same", async () => {
    const { db, archiving } = loaded();
    const kept = await counts();
    const maxRows = 3_000;

    const passes = [];
    do {
      passes.push(await archiving.runArchivePass(db, { mode: "delete", saveIds: [saveId], deleteAfterMs: 0, maxRows }));
    } while ((passes.at(-1)?.deletableNow ?? 0) > 0);

    expect(passes.length).toBeGreaterThan(2);
    expect(passes.every((pass) => pass.mismatches === 0 && pass.archived === 0)).toBe(true);
    // A pass starts no season past its limit: at most one season's rows over it.
    expect(passes.every((pass) => pass.deleted.fixtures + pass.deleted.stats < maxRows + 1_500)).toBe(true);
    const deleted = passes.reduce((sum, pass) => sum + pass.deleted.fixtures + pass.deleted.stats, 0);
    expect(deleted).toBe(counted?.rowsRemaining);
    expect(passes.reduce((sum, pass) => sum + pass.deletedSeasons, 0)).toBe(34);
    expect(passes.at(-1)).toMatchObject({ pending: 0, deletable: 0, deletableNow: 0, rowsRemaining: 0 });
    expect(archiving.remainingWork(passes.at(-1) ?? passes[0])).toBe(0);
    expect(await counts()).toEqual({ ...kept, completedFixtures: 0, completedStats: 0, completedEvents: 0, completedDecisions: 0 });
    expect(await screens()).toEqual(before);
  });

  it("differs once the archives are taken away, the rows gone: a deletion without its archive would not pass", async () => {
    const { db } = loaded();

    await db.seasonArchive.deleteMany({ where: { saveId } });
    const without = await screens();

    expect(without).not.toEqual(before);
    // The completed seasons' tables, the cup's winners on the reviews, the opponent's form and the first steps all move.
    expect(without.tables).not.toEqual(before?.tables);
    expect(without.reviews.map((review) => review.cupWinner)).not.toEqual(before?.reviews.map((review) => review.cupWinner));
    expect(without.opponent).not.toEqual(before?.opponent);
    expect(without.firstSteps).not.toEqual(before?.firstSteps);
    expect(without.admin.stats).not.toEqual(before?.admin.stats);
    // The career's matches and players' lines of the completed seasons are gone with them.
    expect(without.history).not.toEqual(before?.history);
  });
});
