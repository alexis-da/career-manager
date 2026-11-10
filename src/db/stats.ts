import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { databaseSize, relationSizes, serverStartedAt, type RelationSize } from "./db-size";
import { utcDayOf } from "./user-days";

// The figures of /admin/stats: users, saves, sign-ups, retention, first steps of new saves, size of the database. Read
// only, across every user and save: the administrator's view, never a player's.

type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Users created on one UTC day, and how many of them came back one day and seven days later (UserDay). */
export type Cohort = {
  day: string; // YYYY-MM-DD, UTC
  users: number;
  day1: number | null; // null while the day after is not over yet, or for a cohort from before the first UserDay
  day7: number | null;
};

/** Saves created on one UTC day, a challenge's left out, and how far they have gone since (the game's own tables). */
export type FirstStepsCohort = {
  day: string; // YYYY-MM-DD, UTC
  saves: number;
  lineups: number; // with a lineup saved by the manager
  firstMatches: number; // whose managed club has played a match, in any competition
  tenMatches: number; // whose managed club has played ten
};

export type AdminStats = {
  usersByKind: { anonymous: number; registered: number };
  saves: number;
  newUsersPerDay: { day: string; users: number }[]; // the last 14 days, today included, oldest first
  cohorts: Cohort[]; // the same 14 days
  firstSteps: FirstStepsCohort[]; // the 14 complete days before today, oldest first
  databaseBytes: number;
  largestTables: RelationSize[]; // sizes, rows and upkeep of the largest tables
  serverStartedAt: string; // ISO: the server's last start (on Neon, the compute's), which keeps the counters
};

export const STATS_DAYS = 14;
const LARGEST_TABLES = 8;
/** Matches of its club after which a new save counts as well started: the figure after the first match. */
const FIRST_STEPS_MATCHES = 10;

/** The UTC days from first to last, both included, as YYYY-MM-DD. */
export function daysBetween(first: string, last: string): string[] {
  const days: string[] = [];
  for (let time = Date.parse(`${first}T00:00:00.000Z`); time <= Date.parse(`${last}T00:00:00.000Z`); time += DAY_MS) {
    days.push(utcDayOf(new Date(time)));
  }
  return days;
}

const addDays = (day: string, days: number): string => utcDayOf(new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS));

/**
 * Retention by cohort of creation day, from first to last (UTC days, both included): for each day, the users created
 * then, and those with a UserDay one day and seven days later. Unknown (null), not zero: a return day that is not
 * over yet at this time, and every cohort from before the first UserDay of the table, when visits were not recorded.
 * Every day of the range has its row, empty ones included.
 */
export async function retentionByCohort(db: Db, { first, last, now }: { first: string; last: string; now: Date }): Promise<Cohort[]> {
  const rows = await db.$queryRaw<{ day: Date; users: bigint; day1: bigint; day7: bigint }[]>`
    SELECT u."createdAt"::date AS day,
           count(*)::bigint AS users,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "UserDay" d WHERE d."userId" = u."id" AND d."day" = u."createdAt"::date + 1
           ))::bigint AS day1,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "UserDay" d WHERE d."userId" = u."id" AND d."day" = u."createdAt"::date + 7
           ))::bigint AS day7
    FROM "User" u
    WHERE u."createdAt" >= ${first}::date AND u."createdAt" < ${last}::date + 1
    GROUP BY 1`;
  const [{ firstDay }] = await db.$queryRaw<{ firstDay: Date | null }[]>`SELECT min("day") AS "firstDay" FROM "UserDay"`;
  const byDay = new Map(rows.map((row) => [utcDayOf(row.day), row]));
  const today = utcDayOf(now);
  const trackedFrom = firstDay === null ? null : utcDayOf(firstDay);
  // A return day counts once it is over (strictly before today), for a cohort from the first recorded day on: that
  // day's returns, the day after and later, were all recorded.
  const known = (day: string, after: number) => trackedFrom !== null && day >= trackedFrom && addDays(day, after) < today;
  return daysBetween(first, last).map((day) => {
    const row = byDay.get(day);
    return {
      day,
      users: Number(row?.users ?? 0),
      day1: known(day, 1) ? Number(row?.day1 ?? 0) : null,
      day7: known(day, 7) ? Number(row?.day7 ?? 0) : null,
    };
  });
}

/**
 * How far the saves of each creation day went, from first to last (UTC days, both included): their managed club's own
 * matches, never those of the other clubs a « Prochain match » plays around them. Challenge saves are left out: their
 * club is imposed and they are purged every week. Every day of the range has its row, empty ones included.
 */
export async function firstStepsByCohort(db: Db, { first, last }: { first: string; last: string }): Promise<FirstStepsCohort[]> {
  const rows = await db.$queryRaw<{ day: Date; saves: bigint; lineups: bigint; firstMatches: bigint; tenMatches: bigint }[]>`
    SELECT s."createdAt"::date AS day,
           count(*)::bigint AS saves,
           count(*) FILTER (WHERE c."lineup" IS NOT NULL)::bigint AS "lineups",
           count(*) FILTER (WHERE m."played" >= 1)::bigint AS "firstMatches",
           count(*) FILTER (WHERE m."played" >= ${FIRST_STEPS_MATCHES})::bigint AS "tenMatches"
    FROM "Save" s
    JOIN "ClubSave" c ON c."saveId" = s."id" AND c."isManaged"
    CROSS JOIN LATERAL (
      SELECT count(*) AS "played"
      FROM "Fixture" f
      WHERE f."saveId" = s."id" AND f."played" AND (f."homeClubSaveId" = c."id" OR f."awayClubSaveId" = c."id")
    ) m
    WHERE s."challengeId" IS NULL AND s."createdAt" >= ${first}::date AND s."createdAt" < ${last}::date + 1
    GROUP BY 1`;
  const byDay = new Map(rows.map((row) => [utcDayOf(row.day), row]));
  return daysBetween(first, last).map((day) => {
    const row = byDay.get(day);
    return {
      day,
      saves: Number(row?.saves ?? 0),
      lineups: Number(row?.lineups ?? 0),
      firstMatches: Number(row?.firstMatches ?? 0),
      tenMatches: Number(row?.tenMatches ?? 0),
    };
  });
}

/** Everything /admin/stats shows, at this time. */
export async function getAdminStats(db: Db, now: Date): Promise<AdminStats> {
  const last = utcDayOf(now);
  const first = addDays(last, -(STATS_DAYS - 1));
  const [kinds, saves, cohorts, firstSteps, databaseBytes, tables, startedAt] = await Promise.all([
    db.user.groupBy({ by: ["kind"], _count: { _all: true } }),
    db.save.count(),
    retentionByCohort(db, { first, last, now }),
    // Complete days only: a save of today still has time to play its first match.
    firstStepsByCohort(db, { first: addDays(first, -1), last: addDays(last, -1) }),
    databaseSize(db),
    relationSizes(db),
    serverStartedAt(db),
  ]);
  const countOf = (kind: "ANONYMOUS" | "REGISTERED") => kinds.find((row) => row.kind === kind)?._count._all ?? 0;
  return {
    usersByKind: { anonymous: countOf("ANONYMOUS"), registered: countOf("REGISTERED") },
    saves,
    newUsersPerDay: cohorts.map(({ day, users }) => ({ day, users })),
    cohorts,
    firstSteps,
    databaseBytes,
    largestTables: tables.slice(0, LARGEST_TABLES),
    serverStartedAt: startedAt,
  };
}
