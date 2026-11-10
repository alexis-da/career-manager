import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { decodeSeason, encodeSeason, sameSeason, SeasonArchiveError, type DecodedSeason } from "../lib/season-archive";
import { lockSave } from "./matchday";
import { archiveJson, encodedOf } from "./season-archive";
import { ensureSeasonResults } from "./season-results";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

// The « archive » task of the daily maintenance (.github/workflows/maintenance.yml, through
// app/api/maintenance/archive/route.ts), never a migration: the completed seasons' fixtures and statistics kept in a
// compact form (SeasonArchive, src/lib/season-archive.ts), which the screens read instead of their rows as soon as it
// exists (src/db/season-archive.ts), then those rows deleted. Three modes:
// - count: counts, writes nothing but its pass;
// - archive: archives the completed seasons without an archive, deletes nothing. Each season in a transaction of its
//   own, the save locked (lockSave): the honours rebuilt first (ensureSeasonResults), the rows read, coded, decoded back
//   and compared to them (sameSeason) before the archive is written; a season that cannot be kept exactly stays as rows
//   (a mismatch), and the later seasons of its save wait, so that archived seasons are always a save's oldest;
// - delete: archives as above, then deletes the rows of the seasons archived ARCHIVE_DELETE_AFTER_MS ago at least (a
//   request that read a season as not archived has ended by then), each season in a transaction of its own, the save
//   locked, its rows read again and compared to its archive: deleted only when equal, kept as a mismatch otherwise. The
//   fixtures' events and decisions go with them (cascade): the event cleanup's targets, read by no screen.
// Challenge saves are left out: they are purged a day after their week. By batches: no season starts once ARCHIVE_MAX_MS
// have gone, at most ARCHIVE_MAX_SEASONS archived and ARCHIVE_MAX_ROWS rows deleted a pass; then what remains is
// counted and the pass recorded (ArchivePass), for /admin.

/** The most seasons one pass archives. */
export const ARCHIVE_MAX_SEASONS = 400;
/** The most rows (fixtures and statistics) one pass deletes; a season's rows go together, in one transaction. */
export const ARCHIVE_MAX_ROWS = 100_000;
/** Past this time in a pass, no season starts: the count and the record follow, well within a call's 60 s. */
export const ARCHIVE_MAX_MS = 20_000;
/** A season's rows are deleted this long after its archive at least: longer than any request (maxDuration 60 s). */
export const ARCHIVE_DELETE_AFTER_MS = 120_000;
/** One season's transaction: its reads, its coding, its writes. */
const ARCHIVE_TRANSACTION_TIMEOUT_MS = 60_000;

export type ArchiveMode = "count" | "archive" | "delete";

const MODE_COLUMN = { count: "COUNT", archive: "ARCHIVE", delete: "DELETE" } as const satisfies Record<ArchiveMode, string>;

export type ArchiveOptions = {
  mode: ArchiveMode;
  maxSeasons?: number;
  maxRows?: number;
  maxMs?: number;
  deleteAfterMs?: number;
  // The tests' saves only, whose own seasons they archive: the maintenance never sets it, every save is archived.
  saveIds?: readonly string[];
};

export type ArchivePassResult = {
  id: string; // its ArchivePass row
  mode: ArchiveMode;
  archived: number; // seasons archived by this pass
  deletedSeasons: number; // seasons whose rows it deleted
  deleted: { fixtures: number; stats: number };
  mismatches: number; // seasons it left as rows: impossible to code, or rows unlike their archive
  pending: number; // completed seasons without an archive, after it
  deletable: number; // archived seasons whose rows remain, after it
  deletableNow: number; // of them, archived ARCHIVE_DELETE_AFTER_MS ago at least: what a deletion could take now
  rowsRemaining: number; // the fixtures and statistics of completed seasons still in the tables, archived or not
  milliseconds: number; // the whole pass, its count included
};

type SeasonRef = { id: string; saveId: string };

/** A season of the scope: every save but the challenges', or the tests' saves. */
const inScope = (column: Prisma.Sql, saveIds: readonly string[] | undefined): Prisma.Sql =>
  saveIds === undefined ? Prisma.empty : Prisma.sql`AND ${column} = ANY(${[...saveIds]}::text[])`;

/** The completed seasons of non-challenge saves without an archive, a save's oldest first. */
function pendingSeasons(saveIds: readonly string[] | undefined): Prisma.Sql {
  return Prisma.sql`
    SELECT se."id", se."saveId" FROM "Season" se
    JOIN "Save" s ON s."id" = se."saveId"
    WHERE se."completed" AND s."challengeId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "SeasonArchive" a WHERE a."seasonId" = se."id")
      ${inScope(Prisma.sql`se."saveId"`, saveIds)}`;
}

/** The archived seasons whose rows remain, archived before `before` (the database's clock, UTC) when given. */
function deletableSeasons(saveIds: readonly string[] | undefined, olderThanMs?: number): Prisma.Sql {
  const age =
    olderThanMs === undefined
      ? Prisma.empty
      : Prisma.sql`AND a."createdAt" <= (now() AT TIME ZONE 'UTC') - make_interval(secs => ${olderThanMs / 1000})`;
  return Prisma.sql`
    SELECT a."seasonId" AS "id", a."saveId" FROM "SeasonArchive" a
    WHERE (EXISTS (SELECT 1 FROM "Fixture" f WHERE f."seasonId" = a."seasonId")
        OR EXISTS (SELECT 1 FROM "PlayerSeasonStats" t WHERE t."seasonId" = a."seasonId"))
      ${age} ${inScope(Prisma.sql`a."saveId"`, saveIds)}`;
}

/**
 * A season's fixtures and statistics as its rows hold them, in the archive's terms, and whether a fixture of it keeps a
 * live state (a match waiting at a pause: never in a completed season, refused if found).
 */
async function seasonRowsOf(db: Prisma.TransactionClient, saveId: string, seasonId: string): Promise<DecodedSeason & { live: boolean }> {
  const fixtures = await db.fixture.findMany({
    where: { saveId, seasonId },
    select: {
      round: true,
      scheduledAt: true,
      homeClubSaveId: true,
      awayClubSaveId: true,
      status: true,
      played: true,
      homeGoals: true,
      awayGoals: true,
      homeHalfTimeGoals: true,
      awayHalfTimeGoals: true,
      decidedBy: true,
      homePenalties: true,
      awayPenalties: true,
      winnerClubSaveId: true,
      goalTimes: true,
      instructions: true,
      liveState: true,
    },
  });
  const stats = await db.playerSeasonStats.findMany({
    where: { saveId, seasonId },
    select: { playerSaveId: true, appearances: true, starts: true, minutes: true, goals: true, assists: true, yellowCards: true, redCards: true },
  });
  return {
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
      instructions: archiveJson(fixture.instructions),
    })),
    stats,
    live: fixtures.some((fixture) => fixture.liveState !== null),
  };
}

const TRANSACTION = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: ARCHIVE_TRANSACTION_TIMEOUT_MS };

/**
 * Archives a completed season, in a transaction of its own, its save locked: the save's honours rebuilt first when
 * asked, its rows coded, decoded back and compared to them, then the archive written. Nothing when another pass has
 * archived it meanwhile. Throws SeasonArchiveError when the season cannot be kept exactly.
 */
async function archiveSeason(db: PrismaClient, season: SeasonRef, rebuildResults: boolean): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await lockSave(tx, season.saveId);
    if ((await tx.seasonArchive.findFirst({ where: { saveId: season.saveId, seasonId: season.id }, select: { seasonId: true } })) !== null) {
      return false;
    }
    if (rebuildResults) {
      await ensureSeasonResults(tx, season.saveId);
    }
    const rows = await seasonRowsOf(tx, season.saveId, season.id);
    if (rows.live) {
      throw new SeasonArchiveError(`Season ${season.id} keeps a match's live state`);
    }
    const encoded = encodeSeason(rows.fixtures, rows.stats);
    if (!sameSeason(decodeSeason(encoded), rows)) {
      throw new SeasonArchiveError(`Season ${season.id} does not decode to its rows`);
    }
    const managed = await tx.clubSave.findFirstOrThrow({ where: { saveId: season.saveId, isManaged: true }, select: { id: true } });
    const managedPlayed = rows.fixtures.filter(
      (fixture) => fixture.played && (fixture.homeClubSaveId === managed.id || fixture.awayClubSaveId === managed.id),
    ).length;
    // createdAt at the database's clock, in UTC as every DateTime column: the deletion's delay is counted from it.
    await tx.$executeRaw`
      INSERT INTO "SeasonArchive" ("seasonId", "saveId", "version", "clubSaveIds", "fixtures", "goalTimes", "instructions",
        "playerSaveIds", "stats", "fixtureCount", "statCount", "managedPlayed", "createdAt")
      VALUES (${season.id}, ${season.saveId}, ${encoded.version}, ${encoded.clubSaveIds}::text[], ${encoded.fixtures}::int[],
        ${encoded.goalTimes}::int[], ${encoded.instructions === null ? null : JSON.stringify(encoded.instructions)}::jsonb,
        ${encoded.playerSaveIds}::text[], ${encoded.stats}::int[], ${encoded.fixtureCount}, ${encoded.statCount}, ${managedPlayed},
        now() AT TIME ZONE 'UTC')`;
    return true;
  }, TRANSACTION);
}

/**
 * Deletes an archived season's rows, in a transaction of its own, its save locked, once they are read again and found
 * equal to its archive: null when they are not (a mismatch, nothing deleted), the rows deleted otherwise (none when
 * another pass has deleted them meanwhile).
 */
async function deleteArchivedRows(db: PrismaClient, season: SeasonRef): Promise<{ fixtures: number; stats: number } | null> {
  return db.$transaction(async (tx) => {
    await lockSave(tx, season.saveId);
    const archive = await tx.seasonArchive.findFirstOrThrow({
      where: { saveId: season.saveId, seasonId: season.id },
      select: {
        version: true,
        clubSaveIds: true,
        fixtures: true,
        goalTimes: true,
        instructions: true,
        playerSaveIds: true,
        stats: true,
        fixtureCount: true,
        statCount: true,
      },
    });
    const rows = await seasonRowsOf(tx, season.saveId, season.id);
    if (rows.fixtures.length === 0 && rows.stats.length === 0) {
      return { fixtures: 0, stats: 0 };
    }
    if (rows.live || !sameSeason(decodeSeason(encodedOf(archive)), rows)) {
      return null;
    }
    const stats = await tx.$executeRaw`DELETE FROM "PlayerSeasonStats" WHERE "saveId" = ${season.saveId} AND "seasonId" = ${season.id}`;
    // Their events and decisions go with them (onDelete: Cascade).
    const fixtures = await tx.$executeRaw`DELETE FROM "Fixture" WHERE "saveId" = ${season.saveId} AND "seasonId" = ${season.id}`;
    return { fixtures, stats };
  }, TRANSACTION);
}

/**
 * One pass of the « archive » task: archives (not in a count), then deletes (in a deletion only), by batches, counts
 * what remains and records the pass. Each season on its own: a pass stopped midway has archived or deleted whole
 * seasons, the next one goes on.
 */
export async function runArchivePass(db: PrismaClient, options: ArchiveOptions): Promise<ArchivePassResult> {
  const {
    mode,
    maxSeasons = ARCHIVE_MAX_SEASONS,
    maxRows = ARCHIVE_MAX_ROWS,
    maxMs = ARCHIVE_MAX_MS,
    deleteAfterMs = ARCHIVE_DELETE_AFTER_MS,
    saveIds,
  } = options;
  // Not simulation code: a pass is bounded in real time.
  const started = performance.now();
  const inTime = () => performance.now() - started < maxMs;
  let archived = 0;
  let mismatches = 0;
  let deletedSeasons = 0;
  const deleted = { fixtures: 0, stats: 0 };

  if (mode !== "count") {
    const seasons = await db.$queryRaw<SeasonRef[]>`
      SELECT p."id", p."saveId" FROM (${pendingSeasons(saveIds)}) p
      JOIN "Season" se ON se."id" = p."id"
      ORDER BY p."saveId", se."startYear", p."id"
      LIMIT ${maxSeasons}`;
    const rebuilt = new Set<string>();
    const blocked = new Set<string>();
    for (const season of seasons) {
      if (!inTime()) {
        break;
      }
      if (blocked.has(season.saveId)) {
        continue;
      }
      try {
        if (await archiveSeason(db, season, !rebuilt.has(season.saveId))) {
          archived++;
        }
        rebuilt.add(season.saveId);
      } catch (error) {
        if (!(error instanceof SeasonArchiveError)) {
          throw error;
        }
        // Left as rows, and the save's later seasons with it: archived seasons stay a save's oldest.
        console.error(`Season archive: ${error.message}`);
        mismatches++;
        blocked.add(season.saveId);
      }
    }
  }

  if (mode === "delete") {
    const seasons = await db.$queryRaw<SeasonRef[]>`
      SELECT d."id", d."saveId" FROM (${deletableSeasons(saveIds, deleteAfterMs)}) d
      JOIN "SeasonArchive" a ON a."seasonId" = d."id"
      ORDER BY a."createdAt", d."id"`;
    for (const season of seasons) {
      if (!inTime() || deleted.fixtures + deleted.stats >= maxRows) {
        break;
      }
      const rows = await deleteArchivedRows(db, season);
      if (rows === null) {
        console.error(`Season archive: the rows of season ${season.id} are not its archive's, kept`);
        mismatches++;
      } else if (rows.fixtures + rows.stats > 0) {
        deletedSeasons++;
        deleted.fixtures += rows.fixtures;
        deleted.stats += rows.stats;
      }
    }
  }

  const scope = inScope(Prisma.sql`se."saveId"`, saveIds);
  const [counts] = await db.$queryRaw<{ pending: number; deletable: number; deletableNow: number; rowsRemaining: number }[]>`
    SELECT
      (SELECT count(*)::int FROM (${pendingSeasons(saveIds)}) p) AS "pending",
      (SELECT count(*)::int FROM (${deletableSeasons(saveIds)}) d) AS "deletable",
      (SELECT count(*)::int FROM (${deletableSeasons(saveIds, deleteAfterMs)}) d) AS "deletableNow",
      (SELECT count(*)::int FROM "Fixture" f JOIN "Season" se ON se."id" = f."seasonId" JOIN "Save" s ON s."id" = se."saveId"
        WHERE se."completed" AND s."challengeId" IS NULL ${scope})
      + (SELECT count(*)::int FROM "PlayerSeasonStats" t JOIN "Season" se ON se."id" = t."seasonId" JOIN "Save" s ON s."id" = se."saveId"
        WHERE se."completed" AND s."challengeId" IS NULL ${scope}) AS "rowsRemaining"`;
  const milliseconds = Math.round(performance.now() - started);
  const [{ id }] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "ArchivePass" ("id", "at", "mode", "seasonsArchived", "seasonsPending", "seasonsDeleted", "fixturesDeleted",
      "statsDeleted", "seasonsDeletable", "rowsRemaining", "mismatches", "milliseconds")
    VALUES (gen_random_uuid()::text, now() AT TIME ZONE 'UTC', ${MODE_COLUMN[mode]}::"ArchivePassMode", ${archived}, ${counts.pending},
      ${deletedSeasons}, ${deleted.fixtures}, ${deleted.stats}, ${counts.deletable}, ${counts.rowsRemaining}, ${mismatches},
      ${milliseconds})
    RETURNING "id"`;
  return { id, mode, archived, deletedSeasons, deleted, mismatches, ...counts, milliseconds };
}

/**
 * What a call of the task could still do now, for the workflow's loop: in an archiving, the seasons to archive; in a
 * deletion, those and the archived seasons whose rows may go now; nothing in a count, a single call.
 */
export function remainingWork(pass: ArchivePassResult): number {
  switch (pass.mode) {
    case "count":
      return 0;
    case "archive":
      return pass.pending;
    case "delete":
      return pass.pending + pass.deletableNow;
  }
}
