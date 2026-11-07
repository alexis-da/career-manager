import type { PrismaClient } from "../generated/prisma/client";
import { MAX_CHALLENGE_SAVES_PER_WEEK } from "../config/challenge";
import { isoWeekKey } from "../lib/iso-week";
import { databaseSize } from "./db-size";
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

/** The storage of Neon's free plan, which the database must stay under (CLAUDE.md, « Budget base de données »). */
export const DATABASE_LIMIT_BYTES = 1024 ** 3;

/** The source of a player whose arrival is not known: created before the tracking of arrivals, or without its cookie. */
export const UNKNOWN_SOURCE = "(unknown)";

/** Days over which the database's growth is averaged, for its projection. */
const GROWTH_DAYS = 7;

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
  databaseBytes: number | null; // at the day's maintenance; null without one
  growth: number | null; // since the day before's; null without both
  purgedUsers: number; // anonymous users the purge deleted
  purgedSaves: number; // their saves
  purgedChallengeSaves: number; // weekly challenge saves deleted 24 h after their week
};

export type AdminDashboard = {
  period: AdminPeriod;
  first: string; // the period's first day, UTC
  last: string; // today, UTC
  trackedSince: string | null; // the first day a visit was counted
  days: AdminDay[]; // oldest first
  sources: Journey[]; // most visits first, then most players; the unknown source last
  total: Journey; // every source
  players: { anonymous: number; registered: number; fr: number; en: number; phone: number; computer: number };
  challenge: { weekKey: string; saves: number; entries: number; submitted: number; maxSaves: number } | null;
  health: {
    databaseBytes: number; // now
    limitBytes: number;
    dailyGrowth: number | null; // bytes a day over the last GROWTH_DAYS days of snapshots; null with fewer than two
    fullOn: string | null; // the day the limit would be reached at that pace; null without growth
  };
};

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

  const [groups, medians, visits, [{ trackedSince }], [{ daysTrackedSince }], active, stats, challenge, bytesNow] = await Promise.all([
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
    databaseSize(db),
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
      databaseBytes: bytes,
      growth: bytes === null || before === null ? null : bytes - before,
      purgedUsers: stat?.purgedUsers ?? 0,
      purgedSaves: stat?.purgedSaves ?? 0,
      purgedChallengeSaves: stat?.purgedChallengeSaves ?? 0,
    };
  });

  // The pace of the last GROWTH_DAYS days of snapshots, from the first of them to the last.
  const snapshots = daysBetween(addDays(last, -GROWTH_DAYS), last)
    .map((day) => ({ day, bytes: bytesOf(day) }))
    .filter((snapshot): snapshot is { day: string; bytes: number } => snapshot.bytes !== null);
  const [oldest, newest] = [snapshots.at(0), snapshots.at(-1)];
  const span = oldest === undefined || newest === undefined ? 0 : (Date.parse(newest.day) - Date.parse(oldest.day)) / DAY_MS;
  const dailyGrowth = oldest === undefined || newest === undefined || span === 0 ? null : (newest.bytes - oldest.bytes) / span;
  const fullOn =
    dailyGrowth === null || dailyGrowth <= 0
      ? null
      : addDays(last, Math.max(0, Math.ceil((DATABASE_LIMIT_BYTES - bytesNow) / dailyGrowth)));

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
    health: { databaseBytes: bytesNow, limitBytes: DATABASE_LIMIT_BYTES, dailyGrowth, fullOn },
  };
}
