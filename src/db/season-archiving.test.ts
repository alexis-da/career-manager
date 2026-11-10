import "dotenv/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The « archive » task (src/db/season-archiving.ts) on a throwaway twin of the worldVersion 1 demo save, its first
// season played and advanced: five completed league seasons, a sixth in progress. Every pass is scoped to the twin
// (saveIds): the task is global, and the database's other saves, the demo saves first, must stay as they are; the
// endpoint is only called in a count or with a wrong secret. The proof that no screen changes, over a worldVersion 2 save
// with its cups, is season-archive.slow.test.ts. Skipped without DATABASE_URL; modules are imported lazily because the
// client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the archive task of the completed seasons", () => {
  let db: typeof prismaClient | undefined;
  let modules: Awaited<ReturnType<typeof load>> | undefined;
  let saveId = "";
  let startedAt = new Date(0); // the database's clock before the file's first pass: its passes are deleted at the end
  // Not simulation code: a unique week key keeps parallel runs apart.
  const weekKey = `test-archive-${Date.now()}`;
  const SECRET = "test-maintenance-secret-0123456789";
  const secretBefore = process.env.MAINTENANCE_SECRET;
  let tablesBefore: unknown[] = [];
  let honoursBefore: unknown;

  async function load() {
    const [client, support, matchday, season, archiving, seasonArchive, standings, seasonResults, codec, route] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
      import("./season"),
      import("./season-archiving"),
      import("./season-archive"),
      import("./standings"),
      import("./season-results"),
      import("../lib/season-archive"),
      import("@/app/api/maintenance/archive/route"),
    ]);
    return { prisma: client.prisma, support, matchday, season, archiving, seasonArchive, standings, seasonResults, codec, route };
  }

  const loaded = () => {
    if (db === undefined || modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, ...modules };
  };

  /** A pass on the twin only, as the maintenance runs it on every save. */
  const pass = (options: Omit<import("./season-archiving").ArchiveOptions, "saveIds">) =>
    loaded().archiving.runArchivePass(loaded().db, { ...options, saveIds: [saveId] });

  const completedSeasons = () =>
    loaded().db.season.findMany({ where: { saveId, completed: true }, orderBy: { id: "asc" }, select: { id: true, startYear: true } });

  /** What the twin holds, read through Prisma, apart from the task's own SQL. */
  const counts = async () => {
    const { db } = loaded();
    const completed = { saveId, season: { completed: true } };
    return {
      archives: await db.seasonArchive.count({ where: { saveId } }),
      completedFixtures: await db.fixture.count({ where: completed }),
      completedStats: await db.playerSeasonStats.count({ where: completed }),
      completedEvents: await db.matchEvent.count({ where: { fixture: completed } }),
      inProgressFixtures: await db.fixture.count({ where: { saveId, season: { completed: false } } }),
      inProgressStats: await db.playerSeasonStats.count({ where: { saveId, season: { completed: false } } }),
      inProgressEvents: await db.matchEvent.count({ where: { fixture: { saveId, season: { completed: false } } } }),
      results: await db.seasonResult.count({ where: { saveId } }),
    };
  };

  /** The tables of the completed seasons and the honours, as the screens read them. */
  const screens = async () => {
    const { standings, seasonResults } = loaded();
    const tables = [];
    for (const season of await completedSeasons()) {
      tables.push(await standings.getStandings(saveId, season.id));
    }
    return { tables, honours: await seasonResults.getSeasonResults(saveId) };
  };

  const call = (query: string, authorization: string | null) => {
    const headers = authorization === null ? undefined : { authorization };
    return loaded().route.POST(new Request(`http://localhost/api/maintenance/archive${query}`, { method: "POST", headers }));
  };

  beforeAll(async () => {
    modules = await load();
    const { prisma, support, matchday, season } = modules;
    db = prisma;
    [{ now: startedAt }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    saveId = await support.createDemoTwin("Test archives des saisons");
    await support.playRemainingMatchdays(saveId);
    await season.advanceToNextSeason(saveId);
    for (let date = 0; date < 3; date++) {
      await matchday.playNextMatchday(saveId);
    }
    ({ tables: tablesBefore, honours: honoursBefore } = await screens());
  }, 600_000);

  afterEach(() => {
    if (secretBefore === undefined) {
      delete process.env.MAINTENANCE_SECRET;
    } else {
      process.env.MAINTENANCE_SECRET = secretBefore;
    }
  });

  afterAll(async () => {
    await db?.archivePass.deleteMany({ where: { at: { gte: startedAt } } });
    if (saveId !== "") {
      await db?.save.update({ where: { id: saveId }, data: { challengeId: null } });
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.challenge.deleteMany({ where: { weekKey } });
    await db?.$disconnect();
  }, 120_000);

  it("counts the completed seasons and their rows, and writes nothing but its pass", async () => {
    const { db } = loaded();
    const before = await counts();

    const counted = await pass({ mode: "count" });

    expect(before.completedFixtures).toBeGreaterThan(1_000);
    expect(before.completedStats).toBeGreaterThan(1_000);
    expect(counted).toMatchObject({ mode: "count", archived: 0, deletedSeasons: 0, mismatches: 0, pending: 5, deletable: 0, deletableNow: 0 });
    expect(counted.rowsRemaining).toBe(before.completedFixtures + before.completedStats);
    expect(await counts()).toEqual(before);
    expect(await db.archivePass.findUniqueOrThrow({ where: { id: counted.id } })).toMatchObject({
      mode: "COUNT",
      seasonsArchived: 0,
      seasonsPending: 5,
      rowsRemaining: counted.rowsRemaining,
    });
  });

  it("leaves out a challenge save, purged a day after its week", async () => {
    const { db } = loaded();
    const club = await db.club.findFirstOrThrow({ select: { id: true } });
    const challenge = await db.challenge.create({
      data: { weekKey, seed: weekKey, clubId: club.id, horizonMatchdays: 10, startsAt: new Date("2001-05-07T00:00:00.000Z"), endsAt: new Date("2001-05-14T00:00:00.000Z") },
      select: { id: true },
    });
    await db.save.update({ where: { id: saveId }, data: { challengeId: challenge.id } });
    try {
      const archived = await pass({ mode: "archive" });

      expect(archived).toMatchObject({ archived: 0, pending: 0, rowsRemaining: 0 });
      expect((await counts()).archives).toBe(0);
    } finally {
      await db.save.update({ where: { id: saveId }, data: { challengeId: null } });
    }
  });

  it("leaves a season it cannot keep exactly as rows, its save's later seasons with it, and deletes nothing unarchived", async () => {
    const { db } = loaded();
    const [first] = await completedSeasons();
    const fixture = await db.fixture.findFirstOrThrow({ where: { saveId, seasonId: first.id }, select: { id: true, scheduledAt: true } });
    const before = await counts();
    // A date with seconds: the archive keeps whole minutes only.
    await db.fixture.update({ where: { id: fixture.id }, data: { scheduledAt: new Date(fixture.scheduledAt.getTime() + 30_000) } });
    try {
      // A deletion archives first, and deletes archived seasons only: nothing here.
      const done = await pass({ mode: "delete", deleteAfterMs: 0 });

      expect(done).toMatchObject({ archived: 0, deletedSeasons: 0, mismatches: 1, pending: 5, deletable: 0 });
      expect(await counts()).toEqual(before);
    } finally {
      await db.fixture.update({ where: { id: fixture.id }, data: { scheduledAt: fixture.scheduledAt } });
    }
  });

  it("archives the completed seasons, the honours rebuilt first, decodes each to its rows and deletes nothing", async () => {
    const { db, codec, seasonArchive } = loaded();
    // A save from before SeasonResult: its honours are rebuilt from its rows before they are archived.
    await db.seasonResult.deleteMany({ where: { saveId } });
    const before = await counts();

    const archived = await pass({ mode: "archive" });
    const again = await pass({ mode: "archive" });

    expect(archived).toMatchObject({ archived: 5, mismatches: 0, pending: 0, deletable: 5, deletedSeasons: 0 });
    expect(again).toMatchObject({ archived: 0, pending: 0, deletable: 5 });
    expect(await counts()).toEqual({ ...before, archives: 5, results: 1 });
    for (const season of await completedSeasons()) {
      const fixtures = await db.fixture.findMany({ where: { saveId, seasonId: season.id } });
      const stats = await db.playerSeasonStats.findMany({ where: { saveId, seasonId: season.id } });
      const decoded = await seasonArchive.readArchivedSeason(db, saveId, season.id, { stats: true });
      const rows = {
        fixtures: fixtures.map((fixture) => ({
          round: fixture.round,
          scheduledAt: fixture.scheduledAt,
          homeClubSaveId: fixture.homeClubSaveId,
          awayClubSaveId: fixture.awayClubSaveId,
          status: fixture.status,
          played: fixture.played,
          homeGoals: fixture.homeGoals,
          awayGoals: fixture.awayGoals,
          homeHalfTimeGoals: fixture.homeHalfTimeGoals,
          awayHalfTimeGoals: fixture.awayHalfTimeGoals,
          decidedBy: fixture.decidedBy,
          homePenalties: fixture.homePenalties,
          awayPenalties: fixture.awayPenalties,
          winnerClubSaveId: fixture.winnerClubSaveId,
          goalTimes: fixture.goalTimes,
          instructions: seasonArchive.archiveJson(fixture.instructions),
        })),
        stats: stats.map((line) => ({
          playerSaveId: line.playerSaveId,
          appearances: line.appearances,
          starts: line.starts,
          minutes: line.minutes,
          goals: line.goals,
          assists: line.assists,
          yellowCards: line.yellowCards,
          redCards: line.redCards,
        })),
      };
      expect(decoded !== null && codec.sameSeason(decoded, rows), season.id).toBe(true);
    }
    expect(await screens()).toEqual({ tables: tablesBefore, honours: honoursBefore });
  });

  it("deletes no season's rows before ARCHIVE_DELETE_AFTER_MS", async () => {
    const before = await counts();

    const waiting = await pass({ mode: "delete" });

    expect(waiting).toMatchObject({ deletedSeasons: 0, deletable: 5, deletableNow: 0 });
    expect(await counts()).toEqual(before);
  });

  it("deletes the archived seasons' rows by batches, never those unlike their archive", async () => {
    const { db, archiving } = loaded();
    const [tampered, ...others] = await completedSeasons();
    const fixture = await db.fixture.findFirstOrThrow({
      where: { saveId, seasonId: tampered.id, played: true },
      select: { id: true, homeGoals: true },
    });
    const tamperedRows = async () => ({
      fixtures: await db.fixture.count({ where: { saveId, seasonId: tampered.id } }),
      stats: await db.playerSeasonStats.count({ where: { saveId, seasonId: tampered.id } }),
    });
    const kept = await tamperedRows();
    const keptEvents = await db.matchEvent.count({ where: { fixture: { saveId, seasonId: tampered.id } } });
    const before = await counts();
    // A goal more after the archive: its rows are no longer what it keeps.
    await db.fixture.update({ where: { id: fixture.id }, data: { homeGoals: (fixture.homeGoals ?? 0) + 1 } });

    const passes = [];
    do {
      passes.push(await pass({ mode: "delete", deleteAfterMs: 0, maxRows: 1 }));
    } while ((passes.at(-1)?.deletedSeasons ?? 0) > 0);

    // One season a pass (its rows go together, past the limit), the tampered one kept every time.
    expect(passes.slice(0, -1).every((done) => done.deletedSeasons === 1)).toBe(true);
    expect(passes.reduce((sum, done) => sum + done.deletedSeasons, 0)).toBe(others.length);
    expect(passes.every((done) => done.mismatches === 1)).toBe(true);
    expect(await tamperedRows()).toEqual(kept);
    expect(passes.at(-1)).toMatchObject({ deletable: 1, deletableNow: 1, pending: 0, rowsRemaining: kept.fixtures + kept.stats });
    // The other seasons' rows gone, their events with them; the tampered season's and the season in progress' kept.
    expect(before.completedEvents).toBeGreaterThan(0);
    expect(await counts()).toEqual({
      ...before,
      completedFixtures: kept.fixtures,
      completedStats: kept.stats,
      completedEvents: keptEvents,
    });

    // Put back, the season matches its archive again, and goes too: no row of a completed season is left.
    await db.fixture.update({ where: { id: fixture.id }, data: { homeGoals: fixture.homeGoals } });
    const last = await pass({ mode: "delete", deleteAfterMs: 0 });

    expect(last).toMatchObject({ deletedSeasons: 1, mismatches: 0, deletable: 0, deletableNow: 0, rowsRemaining: 0 });
    expect(archiving.remainingWork(last)).toBe(0);
    expect(await counts()).toMatchObject({ archives: 5, completedFixtures: 0, completedStats: 0, completedEvents: 0 });
    expect(await screens()).toEqual({ tables: tablesBefore, honours: honoursBefore });
  });

  it("answers 404 without MAINTENANCE_SECRET or with a wrong header, and counts in JSON in a dry run", async () => {
    const before = await counts();
    delete process.env.MAINTENANCE_SECRET;
    expect((await call("?dryRun=1", `Bearer ${SECRET}`)).status).toBe(404);

    process.env.MAINTENANCE_SECRET = SECRET;
    expect((await call("?dryRun=1", null)).status).toBe(404);
    expect((await call("?dryRun=1", "Bearer wrong-secret")).status).toBe(404);

    const response = await call("?dryRun=1", `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: "count",
      archived: 0,
      deletedSeasons: 0,
      deleted: { fixtures: 0, stats: 0 },
      pending: expect.any(Number),
      deletable: expect.any(Number),
      rowsRemaining: expect.any(Number),
      remaining: 0,
      milliseconds: expect.any(Number),
    });
    expect(await counts()).toEqual(before);
  });
});
