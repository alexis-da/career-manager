import { Prisma, type PrismaClient } from "../generated/prisma/client";

// The cleanup of the match events no screen reads any more, a task of the daily maintenance
// (.github/workflows/maintenance.yml, through app/api/maintenance/cleanup/route.ts), never a migration. Two kinds of rows
// only, both read by nothing:
// - the goals of the matches without the managed club, kept as MatchEvent rows before Fixture.goalTimes, on a date
//   before the save's: the live page reads the other matches of the save's current date only (getLiveMatchday), which
//   a match paused live since then still shows; no screen reads an earlier one;
// - the events and decisions of the managed club's matches in a completed season (Season.completed, set by
//   advanceToNextSeason): the calendar and its match sheets read the latest season (getManagedClubCalendar), the
//   dashboard's last match the seasons in progress, the live page the current date, the simulation's summary the dates
//   just simulated.
// Nothing else is deleted: the scores, the goal times, the statistics and the transfers stay. By batches: at most
// EVENT_CLEANUP_MAX_ROWS rows a pass, EVENT_CLEANUP_BATCH_ROWS a statement, and no statement starts once
// EVENT_CLEANUP_MAX_MS have gone; then what remains is counted and the pass recorded (CleanupPass), for /admin.

/** The kinds of rows the cleanup deletes, in the order a pass goes through them. */
export const EVENT_CLEANUP_KINDS = ["otherGoals", "managedEvents", "decisions"] as const;
export type EventCleanupKind = (typeof EVENT_CLEANUP_KINDS)[number];
export type EventCleanupCounts = Record<EventCleanupKind, number>;

/** The most rows one pass deletes, every kind together: the workflow calls again while some remain. */
export const EVENT_CLEANUP_MAX_ROWS = 20_000;
/** The most rows one statement deletes. */
export const EVENT_CLEANUP_BATCH_ROWS = 2_000;
/** Past this time in a pass, no statement starts: the count and the record follow, well within a call's 60 s. */
export const EVENT_CLEANUP_MAX_MS = 20_000;

export type EventCleanupPass = {
  id: string; // its CleanupPass row
  dryRun: boolean;
  deleted: EventCleanupCounts; // by this pass; none in a dry run
  remaining: EventCleanupCounts; // after it: in a dry run, what a deletion would remove
  milliseconds: number; // the whole pass, its count included
};

export type EventCleanupOptions = {
  dryRun: boolean;
  maxRows?: number;
  batchRows?: number;
  maxMs?: number;
  // The tests' saves only, whose own rows they clean: the maintenance never sets it, every save is cleaned.
  saveIds?: readonly string[];
};

const noRows = (): EventCleanupCounts => ({ otherGoals: 0, managedEvents: 0, decisions: 0 });

/** Every kind's rows together. */
export const totalOf = (counts: EventCleanupCounts): number => counts.otherGoals + counts.managedEvents + counts.decisions;

/**
 * The ids of a kind's rows, on the saves given or on all. A fixture is the managed club's when one of its two clubs is
 * the save's managed one, whatever the number of rows marked so: never a match of it taken for another's.
 */
function doomedIds(kind: EventCleanupKind, saveIds: readonly string[] | undefined): Prisma.Sql {
  const scope = saveIds === undefined ? Prisma.empty : Prisma.sql`AND f."saveId" = ANY(${[...saveIds]}::text[])`;
  const managedFixture = Prisma.sql`EXISTS (
    SELECT 1 FROM "ClubSave" m
    WHERE m."saveId" = f."saveId" AND m."isManaged" AND m."id" IN (f."homeClubSaveId", f."awayClubSaveId"))`;
  switch (kind) {
    case "otherGoals":
      return Prisma.sql`
        SELECT e."id" FROM "MatchEvent" e
        JOIN "Fixture" f ON f."id" = e."fixtureId"
        JOIN "Save" s ON s."id" = f."saveId"
        WHERE e."type" = 'GOAL' AND f."scheduledAt" < s."currentDate" AND NOT ${managedFixture} ${scope}`;
    case "managedEvents":
      return Prisma.sql`
        SELECT e."id" FROM "MatchEvent" e
        JOIN "Fixture" f ON f."id" = e."fixtureId"
        JOIN "Season" se ON se."id" = f."seasonId"
        WHERE se."completed" AND ${managedFixture} ${scope}`;
    case "decisions":
      return Prisma.sql`
        SELECT d."id" FROM "MatchDecision" d
        JOIN "Fixture" f ON f."id" = d."fixtureId"
        JOIN "Season" se ON se."id" = f."seasonId"
        WHERE se."completed" AND ${managedFixture} ${scope}`;
  }
}

const tableOf = (kind: EventCleanupKind): Prisma.Sql => Prisma.raw(kind === "decisions" ? `"MatchDecision"` : `"MatchEvent"`);

/** Deletes at most `limit` rows of a kind; returns how many went. */
async function deleteBatch(db: PrismaClient, kind: EventCleanupKind, limit: number, saveIds?: readonly string[]): Promise<number> {
  return db.$executeRaw`DELETE FROM ${tableOf(kind)} WHERE "id" IN (${doomedIds(kind, saveIds)} LIMIT ${limit})`;
}

/** How many rows of a kind the cleanup would still delete. */
async function countDoomed(db: PrismaClient, kind: EventCleanupKind, saveIds?: readonly string[]): Promise<number> {
  const [{ count }] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM (${doomedIds(kind, saveIds)}) AS doomed`;
  return count;
}

/**
 * One pass of the cleanup: deletes by batches (none in a dry run), counts what remains, records the pass. One statement
 * at a time, each atomic on its own: a pass stopped midway has deleted whole batches, the next one goes on.
 */
export async function cleanUpEvents(db: PrismaClient, options: EventCleanupOptions): Promise<EventCleanupPass> {
  const { dryRun, maxRows = EVENT_CLEANUP_MAX_ROWS, batchRows = EVENT_CLEANUP_BATCH_ROWS, maxMs = EVENT_CLEANUP_MAX_MS, saveIds } = options;
  // Not simulation code: a pass is bounded in real time.
  const started = performance.now();
  const deleted = noRows();
  if (!dryRun) {
    let budget = maxRows;
    for (const kind of EVENT_CLEANUP_KINDS) {
      while (budget > 0 && performance.now() - started < maxMs) {
        const limit = Math.min(batchRows, budget);
        const count = await deleteBatch(db, kind, limit, saveIds);
        deleted[kind] += count;
        budget -= count;
        // Fewer than asked: none of this kind is left.
        if (count < limit) {
          break;
        }
      }
    }
  }
  const remaining = noRows();
  for (const kind of EVENT_CLEANUP_KINDS) {
    remaining[kind] = await countDoomed(db, kind, saveIds);
  }
  const milliseconds = Math.round(performance.now() - started);
  const [{ id }] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "CleanupPass" ("id", "at", "dryRun", "otherGoalsDeleted", "otherGoalsRemaining", "managedEventsDeleted",
      "managedEventsRemaining", "decisionsDeleted", "decisionsRemaining", "milliseconds")
    VALUES (gen_random_uuid()::text, now(), ${dryRun}, ${deleted.otherGoals}, ${remaining.otherGoals}, ${deleted.managedEvents},
      ${remaining.managedEvents}, ${deleted.decisions}, ${remaining.decisions}, ${milliseconds})
    RETURNING "id"`;
  return { id, dryRun, deleted, remaining, milliseconds };
}
