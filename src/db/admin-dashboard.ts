import type { ArchivePassMode, PrismaClient } from "../generated/prisma/client";
import { MAX_CHALLENGE_SAVES_PER_WEEK } from "../config/challenge";
import { isoWeekKey } from "../lib/iso-week";
import { RESUME_LINK_DAYS } from "../lib/resume-link";
import { databaseSize } from "./db-size";
import type { EventCleanupCounts } from "./event-cleanup";
import type { ArchiveMode } from "./season-archiving";
import { daysBetween } from "./stats";
import { utcDayOf } from "./user-days";

// /admin: where the players come from and how far they go, from the first visit to the end of a season; who comes back;
// what is played; the database's health; over the last 7 or 30 UTC days, today included. Read only, across every user:
// the administrator's view, never a player's. Each figure is one aggregate query over the period through an index
// (User.createdAt, UserDay.day, the days of VisitDay and DailyStat), never a whole large table; the queries run side by
// side, on the client's pool (never a transaction's).

const DAY_MS = 24 * 60 * 60 * 1000;

export const ADMIN_PERIODS = [7, 30] as const;
export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

/** Neon's storage price on its Launch plan, in dollars a GB and a month: the estimate of the storage's bill. */
export const STORAGE_PRICE_PER_GB_MONTH = 0.35;

/** Past this monthly storage cost, projected PROJECTION_DAYS days ahead, the health section warns. In dollars. */
export const STORAGE_COST_ALERT_DOLLARS = 5;

/** Days ahead of the storage cost's projection, at the pace of the last GROWTH_DAYS days. */
export const PROJECTION_DAYS = 30;

const GB = 1024 ** 3;

/** The source of a player whose arrival is not known: created before the tracking of arrivals, or without its cookie. */
export const UNKNOWN_SOURCE = "(unknown)";

/** Days of snapshots over which the database's growth is measured. */
export const GROWTH_DAYS = 7;

/** A part of a whole, shown as a rate when the whole is not 0. */
export type Share = { part: number; whole: number };

/** How far the players of a source went: those created over the period, from the first visits of the period. */
export type Journey = {
  source: string;
  visits: number; // first visits from the source over the period
  players: number; // users created over the period, anonymous or Google
  careers: number; // of them, those who created a career
  firstMatches: number; // who played a first match
  seasonEnds: number; // who played a season to its end
  medianMinutesToFirstMatch: number | null; // from the creation of the first career to the end of the first match
  live: Share; // of those created since live matches are tracked (liveTrackedSince), those who played one live to its end
  day1: Share; // of the cohorts whose next day is over, those who came back on it
  day7: Share; // of those whose seventh day after is over, those who came back on it
};

/** One UTC day of the period. */
export type AdminDay = {
  day: string; // YYYY-MM-DD
  visits: number | null; // first visits; null before the first one counted (the tracking of arrivals)
  players: number; // users created that day
  registered: number; // of them, Google accounts now
  day1: number | null; // of them, those back the next day; null while that day is not over
  day7: number | null; // back seven days later; null while that day is not over
  active: number; // users who came that day
  liveMatches: number; // matches of a managed club played live to their end
  simulatedMatches: number;
  appLaunches: number; // the installed app's launches, once a session of it
  databaseBytes: number | null; // at the day's maintenance; null without one
  growth: number | null; // since the day before's; null without both
  purgedUsers: number; // anonymous users the purge deleted
  purgedSaves: number; // their saves
  purgedOneDayUsers: number; // of them, seen only on the day they were created, purged after 14 days
  purgedOneDaySaves: number; // their saves: careers never resumed
  purgedChallengeSaves: number; // weekly challenge saves deleted 24 h after their week
};

export type AdminDashboard = {
  period: AdminPeriod;
  first: string; // the period's first day, UTC
  last: string; // today, UTC
  trackedSince: string | null; // the first day a visit was counted
  liveTrackedSince: string | null; // the first day a player's first live match was recorded (User.firstLiveMatchAt)
  days: AdminDay[]; // oldest first
  sources: Journey[]; // most visits first, then most players; the unknown source last
  total: Journey; // every source
  players: { anonymous: number; registered: number; fr: number; en: number; phone: number; computer: number };
  challenge: { weekKey: string; saves: number; entries: number; submitted: number; maxSaves: number } | null;
  // The resume links of the period (src/db/resume-links.ts): created, for how many players, and used; those of a purged
  // player gone with them.
  resumeLinks: { created: number; creators: number; used: number };
  health: StorageHealth & {
    cleanup: CleanupPassView[]; // the event cleanup's passes of the period, the latest first, CLEANUP_PASSES_SHOWN at most
    archive: ArchivePassView[]; // the « archive » task's passes of the period, the latest first, CLEANUP_PASSES_SHOWN at most
  };
};

/** The database's storage: its size, its growth, what it costs a month on Neon's Launch plan, now and ahead. */
export type StorageHealth = {
  databaseBytes: number; // now
  growth: number | null; // bytes gained from the first snapshot of the last GROWTH_DAYS days to the last; null with fewer than two
  growthSince: string | null; // the first of those snapshots' day
  dailyGrowth: number | null; // that growth a day
  storageCost: number; // dollars a month at today's size
  projectedBytes: number | null; // the size PROJECTION_DAYS days ahead at that pace; null without growth
  projectedCost: number | null; // dollars a month at that size
  costAlert: boolean; // the projected cost, or today's without a projection, past STORAGE_COST_ALERT_DOLLARS
  newPlayers: number; // players created over the days of that growth, from its first snapshot's day to its last's eve
  bytesPerNewPlayer: number | null; // the growth over them; null without growth or new players
};

/**
 * The storage's figures from the size now, the day's snapshots of the last GROWTH_DAYS days (oldest first) and the
 * players created each day. A snapshot is taken by the day's purge, at 04:17 UTC: the growth from one to the next comes
 * mostly from the players of the day before, hence the new players of a growth counted from its first snapshot's day to
 * its last's eve. Every byte the database gains is counted against them, the other players' matches included.
 */
export function storageHealth(
  databaseBytes: number,
  snapshots: readonly { day: string; bytes: number }[],
  playersOn: (day: string) => number,
): StorageHealth {
  const [oldest, newest] = [snapshots.at(0), snapshots.at(-1)];
  const span = oldest === undefined || newest === undefined ? 0 : (Date.parse(newest.day) - Date.parse(oldest.day)) / DAY_MS;
  const growth = oldest === undefined || newest === undefined || span <= 0 ? null : newest.bytes - oldest.bytes;
  const dailyGrowth = growth === null ? null : growth / span;
  const newPlayers =
    oldest === undefined || newest === undefined || span <= 0
      ? 0
      : daysBetween(oldest.day, addDays(newest.day, -1)).reduce((sum, day) => sum + playersOn(day), 0);
  const storageCost = (databaseBytes / GB) * STORAGE_PRICE_PER_GB_MONTH;
  const projectedBytes = dailyGrowth === null ? null : Math.max(0, databaseBytes + PROJECTION_DAYS * dailyGrowth);
  const projectedCost = projectedBytes === null ? null : (projectedBytes / GB) * STORAGE_PRICE_PER_GB_MONTH;
  return {
    databaseBytes,
    growth,
    growthSince: growth === null ? null : (oldest?.day ?? null),
    dailyGrowth,
    storageCost,
    projectedBytes,
    projectedCost,
    costAlert: (projectedCost ?? storageCost) > STORAGE_COST_ALERT_DOLLARS,
    newPlayers,
    bytesPerNewPlayer: growth === null || newPlayers === 0 ? null : growth / newPlayers,
  };
}

/** The event cleanup's passes /admin shows, the latest of the period first. */
export const CLEANUP_PASSES_SHOWN = 30;

/** A pass of the event cleanup (src/db/event-cleanup.ts): a count or a deletion, and what was left after it. */
export type CleanupPassView = {
  at: string; // ISO, UTC
  dryRun: boolean;
  deleted: EventCleanupCounts;
  remaining: EventCleanupCounts;
  milliseconds: number;
};

/**
 * A pass of the « archive » task (src/db/season-archiving.ts): a count, an archiving or a deletion, what it did, and what
 * was left after it.
 */
export type ArchivePassView = {
  at: string; // ISO, UTC
  mode: ArchiveMode;
  archived: number; // seasons archived
  deletedSeasons: number; // seasons whose rows it deleted
  deletedRows: number; // those rows, fixtures and statistics
  mismatches: number; // seasons left as rows: impossible to archive exactly, or unlike their archive
  pending: number; // completed seasons without an archive after it
  deletable: number; // archived seasons whose rows remain after it
  rowsRemaining: number; // the rows of completed seasons still in the tables, archived or not
  milliseconds: number;
};

const ARCHIVE_MODE_OF = { COUNT: "count", ARCHIVE: "archive", DELETE: "delete" } as const satisfies Record<ArchivePassMode, ArchiveMode>;

const addDays = (day: string, days: number): string => utcDayOf(new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS));
const dateOf = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const emptyShare = (): Share => ({ part: 0, whole: 0 });

/** The players created on one day from one source, of one kind, language and device: one row of the grouping query. */
type PlayerGroup = {
  day: Date;
  source: string;
  kind: "ANONYMOUS" | "REGISTERED";
  locale: string | null;
  device: "PHONE" | "COMPUTER" | null;
  players: bigint;
  careers: bigint;
  firstMatches: bigint;
  seasonEnds: bigint;
  liveTracked: bigint; // created since live matches are tracked
  livePlayers: bigint; // of them, those who played one live
  day1: bigint;
  day7: bigint;
};

/** Every figure of /admin over the last `period` UTC days at this time, today included. */
export async function getAdminDashboard(db: PrismaClient, now: Date, period: AdminPeriod): Promise<AdminDashboard> {
  const last = utcDayOf(now);
  const first = addDays(last, -(period - 1));
  const end = addDays(last, 1);
  // The day before the period too: its first day's growth, and a week of growth over 7 days.
  const statsFrom = addDays(first, -1);
  const weekKey = isoWeekKey(now);

  const growthFrom = addDays(last, -GROWTH_DAYS);

  const [
    groups,
    medians,
    visits,
    [{ trackedSince }],
    [{ daysTrackedSince }],
    [{ liveSince }],
    active,
    stats,
    challenge,
    resumeLinks,
    bytesNow,
    passes,
    archivePasses,
    newPlayers,
  ] = await Promise.all([
    // The players created since live matches are tracked: a player before it may have played live unrecorded.
    db.$queryRaw<PlayerGroup[]>`
      SELECT u."createdAt"::date AS day,
             coalesce(u."source", ${UNKNOWN_SOURCE}) AS source,
             u."kind"::text AS kind,
             u."locale",
             u."device"::text AS device,
             count(*)::bigint AS players,
             count(u."firstSaveAt")::bigint AS careers,
             count(u."firstMatchAt")::bigint AS "firstMatches",
             count(u."firstSeasonEndAt")::bigint AS "seasonEnds",
             count(*) FILTER (WHERE u."createdAt" >= tracking.since)::bigint AS "liveTracked",
             count(u."firstLiveMatchAt") FILTER (WHERE u."createdAt" >= tracking.since)::bigint AS "livePlayers",
             -- The return days bounded by the period's too: whichever way the planner joins, it reads the days of the
             -- period from UserDay's index on them, never the whole table as it grows.
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "UserDay" d
               WHERE d."userId" = u."id" AND d."day" = u."createdAt"::date + 1
                 AND d."day" > ${first}::date AND d."day" <= ${end}::date
             ))::bigint AS day1,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "UserDay" d
               WHERE d."userId" = u."id" AND d."day" = u."createdAt"::date + 7
                 AND d."day" >= ${first}::date + 7 AND d."day" < ${end}::date + 7
             ))::bigint AS day7
      FROM "User" u
      CROSS JOIN (SELECT min("firstLiveMatchAt")::date AS since FROM "User") tracking
      WHERE u."createdAt" >= ${first}::date AND u."createdAt" < ${end}::date
      GROUP BY 1, 2, 3, 4, 5`,
    // The total's median in the row without a source (ROLLUP): every source's is a source.
    db.$queryRaw<{ source: string | null; minutes: number | null }[]>`
      SELECT coalesce(u."source", ${UNKNOWN_SOURCE}) AS source,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY (extract(epoch FROM u."firstMatchAt" - u."firstSaveAt") / 60)::float8) AS minutes
      FROM "User" u
      WHERE u."createdAt" >= ${first}::date AND u."createdAt" < ${end}::date
        AND u."firstSaveAt" IS NOT NULL AND u."firstMatchAt" >= u."firstSaveAt"
      GROUP BY ROLLUP (1)`,
    db.$queryRaw<{ day: Date; source: string; visits: bigint }[]>`
      SELECT "day", "source", sum("visits")::bigint AS visits
      FROM "VisitDay"
      WHERE "day" >= ${first}::date AND "day" <= ${last}::date
      GROUP BY 1, 2`,
    db.$queryRaw<{ trackedSince: Date | null }[]>`SELECT min("day") AS "trackedSince" FROM "VisitDay"`,
    db.$queryRaw<{ daysTrackedSince: Date | null }[]>`SELECT min("day") AS "daysTrackedSince" FROM "UserDay"`,
    db.$queryRaw<{ liveSince: Date | null }[]>`SELECT min("firstLiveMatchAt")::date AS "liveSince" FROM "User"`,
    db.$queryRaw<{ day: Date; active: bigint }[]>`
      SELECT "day", count(*)::bigint AS active
      FROM "UserDay"
      WHERE "day" >= ${first}::date AND "day" <= ${last}::date
      GROUP BY 1`,
    db.dailyStat.findMany({ where: { day: { gte: dateOf(statsFrom), lte: dateOf(last) } }, orderBy: { day: "asc" } }),
    db.challenge.findUnique({
      where: { weekKey },
      select: { _count: { select: { saves: true, entries: true } }, entries: { where: { submittedAt: { not: null } }, select: { id: true } } },
    }),
    // A link is used within RESUME_LINK_DAYS of its creation: those used over the period were created at most that long
    // before it.
    db.$queryRaw<{ created: bigint; creators: bigint; used: bigint }[]>`
      SELECT count(*) FILTER (WHERE "createdAt" >= ${first}::date)::bigint AS created,
             count(DISTINCT "userId") FILTER (WHERE "createdAt" >= ${first}::date)::bigint AS creators,
             count(*) FILTER (WHERE "usedAt" >= ${first}::date AND "usedAt" < ${end}::date)::bigint AS used
      FROM "ResumeLink"
      WHERE "createdAt" >= ${first}::date - ${RESUME_LINK_DAYS}::int AND "createdAt" < ${end}::date`,
    databaseSize(db),
    db.cleanupPass.findMany({
      where: { at: { gte: dateOf(first), lt: dateOf(end) } },
      orderBy: { at: "desc" },
      take: CLEANUP_PASSES_SHOWN,
    }),
    db.archivePass.findMany({
      where: { at: { gte: dateOf(first), lt: dateOf(end) } },
      orderBy: { at: "desc" },
      take: CLEANUP_PASSES_SHOWN,
    }),
    // The players of the days of the storage's growth, which may start before the period.
    db.$queryRaw<{ day: Date; players: bigint }[]>`
      SELECT "createdAt"::date AS day, count(*)::bigint AS players
      FROM "User"
      WHERE "createdAt" >= ${growthFrom}::date AND "createdAt" < ${end}::date
      GROUP BY 1`,
  ]);

  // A cohort's return day counts once it is over (strictly before today), from the first day visits were recorded.
  const daysFrom = daysTrackedSince === null ? null : utcDayOf(daysTrackedSince);
  const known = (day: string, after: number) => daysFrom !== null && day >= daysFrom && addDays(day, after) < last;
  const tracked = trackedSince === null ? null : utcDayOf(trackedSince);

  const newJourney = (source: string): Journey => ({
    source,
    visits: 0,
    players: 0,
    careers: 0,
    firstMatches: 0,
    seasonEnds: 0,
    medianMinutesToFirstMatch: null,
    live: emptyShare(),
    day1: emptyShare(),
    day7: emptyShare(),
  });
  const total = newJourney("");
  const journeys = new Map<string, Journey>();
  const journeyOf = (source: string): Journey => {
    const journey = journeys.get(source) ?? newJourney(source);
    journeys.set(source, journey);
    return journey;
  };

  const visitsByDay = new Map<string, number>();
  for (const row of visits) {
    const count = Number(row.visits);
    const day = utcDayOf(row.day);
    visitsByDay.set(day, (visitsByDay.get(day) ?? 0) + count);
    journeyOf(row.source).visits += count;
    total.visits += count;
  }

  const players = { anonymous: 0, registered: 0, fr: 0, en: 0, phone: 0, computer: 0 };
  const byDay = new Map<string, { players: number; registered: number; day1: number; day7: number }>();
  for (const group of groups) {
    const day = utcDayOf(group.day);
    const count = Number(group.players);
    const [returned1, returned7] = [Number(group.day1), Number(group.day7)];
    for (const journey of [journeyOf(group.source), total]) {
      journey.players += count;
      journey.careers += Number(group.careers);
      journey.firstMatches += Number(group.firstMatches);
      journey.seasonEnds += Number(group.seasonEnds);
      journey.live.whole += Number(group.liveTracked);
      journey.live.part += Number(group.livePlayers);
      if (known(day, 1)) {
        journey.day1.whole += count;
        journey.day1.part += returned1;
      }
      if (known(day, 7)) {
        journey.day7.whole += count;
        journey.day7.part += returned7;
      }
    }
    const figures = byDay.get(day) ?? { players: 0, registered: 0, day1: 0, day7: 0 };
    figures.players += count;
    figures.registered += group.kind === "REGISTERED" ? count : 0;
    figures.day1 += returned1;
    figures.day7 += returned7;
    byDay.set(day, figures);
    players[group.kind === "REGISTERED" ? "registered" : "anonymous"] += count;
    if (group.locale === "fr" || group.locale === "en") {
      players[group.locale] += count;
    }
    if (group.device !== null) {
      players[group.device === "PHONE" ? "phone" : "computer"] += count;
    }
  }
  for (const { source, minutes } of medians) {
    (source === null ? total : journeyOf(source)).medianMinutesToFirstMatch = minutes;
  }

  const activeByDay = new Map(active.map((row) => [utcDayOf(row.day), Number(row.active)]));
  const statByDay = new Map(stats.map((row) => [utcDayOf(row.day), row]));
  const bytesOf = (day: string): number | null => {
    const bytes = statByDay.get(day)?.databaseBytes;
    return bytes === undefined || bytes === null ? null : Number(bytes);
  };
  const days = daysBetween(first, last).map((day): AdminDay => {
    const figures = byDay.get(day);
    const stat = statByDay.get(day);
    const [bytes, before] = [bytesOf(day), bytesOf(addDays(day, -1))];
    return {
      day,
      visits: tracked !== null && day >= tracked ? (visitsByDay.get(day) ?? 0) : null,
      players: figures?.players ?? 0,
      registered: figures?.registered ?? 0,
      day1: known(day, 1) ? (figures?.day1 ?? 0) : null,
      day7: known(day, 7) ? (figures?.day7 ?? 0) : null,
      active: activeByDay.get(day) ?? 0,
      liveMatches: stat?.liveMatches ?? 0,
      simulatedMatches: stat?.simulatedMatches ?? 0,
      appLaunches: stat?.appLaunches ?? 0,
      databaseBytes: bytes,
      growth: bytes === null || before === null ? null : bytes - before,
      purgedUsers: stat?.purgedUsers ?? 0,
      purgedSaves: stat?.purgedSaves ?? 0,
      purgedOneDayUsers: stat?.purgedOneDayUsers ?? 0,
      purgedOneDaySaves: stat?.purgedOneDaySaves ?? 0,
      purgedChallengeSaves: stat?.purgedChallengeSaves ?? 0,
    };
  });

  // The snapshots of the last GROWTH_DAYS days, from the first of them to the last.
  const snapshots = daysBetween(growthFrom, last)
    .map((day) => ({ day, bytes: bytesOf(day) }))
    .filter((snapshot): snapshot is { day: string; bytes: number } => snapshot.bytes !== null);
  const newPlayersByDay = new Map(newPlayers.map((row) => [utcDayOf(row.day), Number(row.players)]));

  const sources = [...journeys.values()].sort(
    (a, b) =>
      Number(a.source === UNKNOWN_SOURCE) - Number(b.source === UNKNOWN_SOURCE) ||
      b.visits - a.visits ||
      b.players - a.players ||
      a.source.localeCompare(b.source),
  );

  return {
    period,
    first,
    last,
    trackedSince: tracked,
    liveTrackedSince: liveSince === null ? null : utcDayOf(liveSince),
    days,
    sources,
    total,
    players,
    challenge:
      challenge === null
        ? null
        : {
            weekKey,
            saves: challenge._count.saves,
            entries: challenge._count.entries,
            submitted: challenge.entries.length,
            maxSaves: MAX_CHALLENGE_SAVES_PER_WEEK,
          },
    resumeLinks: {
      created: Number(resumeLinks[0]?.created ?? 0),
      creators: Number(resumeLinks[0]?.creators ?? 0),
      used: Number(resumeLinks[0]?.used ?? 0),
    },
    health: {
      ...storageHealth(bytesNow, snapshots, (day) => newPlayersByDay.get(day) ?? 0),
      cleanup: passes.map((pass) => ({
        at: pass.at.toISOString(),
        dryRun: pass.dryRun,
        deleted: { otherGoals: pass.otherGoalsDeleted, managedEvents: pass.managedEventsDeleted, decisions: pass.decisionsDeleted },
        remaining: { otherGoals: pass.otherGoalsRemaining, managedEvents: pass.managedEventsRemaining, decisions: pass.decisionsRemaining },
        milliseconds: pass.milliseconds,
      })),
      archive: archivePasses.map((pass) => ({
        at: pass.at.toISOString(),
        mode: ARCHIVE_MODE_OF[pass.mode],
        archived: pass.seasonsArchived,
        deletedSeasons: pass.seasonsDeleted,
        deletedRows: pass.fixturesDeleted + pass.statsDeleted,
        mismatches: pass.mismatches,
        pending: pass.seasonsPending,
        deletable: pass.seasonsDeletable,
        rowsRemaining: pass.rowsRemaining,
        milliseconds: pass.milliseconds,
      })),
    },
  };
}
