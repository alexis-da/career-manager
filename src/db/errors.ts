import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { cleanErrorKind, cleanErrorMessage, errorFingerprint, routeOfPath, type ErrorSource } from "../lib/error-report";
import { prisma } from "./client";

// The game's errors, server and browser alike, grouped by UTC day and fingerprint (ErrorDay): a count, the last time
// and the latest sample, nothing personal and no cookie. At the database's clock, as the day's figures (DailyStat).

type Db = PrismaClient | Prisma.TransactionClient;

/** The most groups a source records in a day; past them, its new errors count in its « (other) » group. */
export const MAX_ERROR_GROUPS_PER_DAY = 200;
/** The fingerprint of a source's errors past MAX_ERROR_GROUPS_PER_DAY in a day: « (other):CLIENT ». */
export const OTHER_ERRORS = "(other)";
/** Days of errors kept: the daily maintenance deletes the older ones (purgeOldErrors). */
export const ERROR_RETENTION_DAYS = 30;
/** The groups the administrator's dashboard lists: the most frequent of the last seven days. */
export const LISTED_ERROR_GROUPS = 10;

/** An error as it comes, before cleaning: its route may hold ids, its message anything. */
export type ErrorReport = { source: ErrorSource; kind: string; route: string; message: string; digest?: string | null };

/**
 * Records an occurrence of an error: its group of the day (day, fingerprint) counted once more, its last time and
 * latest sample written. Cleans what it is given first (routeOfPath, cleanErrorMessage, cleanErrorKind, a digest of
 * letters, digits and dashes only). A new group past MAX_ERROR_GROUPS_PER_DAY of its source that day counts in its
 * « (other) » group: the table stays small whatever comes.
 */
export async function recordError(db: Db, report: ErrorReport): Promise<void> {
  const route = routeOfPath(report.route);
  const message = cleanErrorMessage(report.message);
  const kind = cleanErrorKind(report.kind);
  const digest = report.digest === undefined || report.digest === null ? null : report.digest.replace(/[^\w-]/g, "").slice(0, 64) || null;
  const fingerprint = errorFingerprint({ source: report.source, kind, route, message });
  const [{ known, groups }] = await db.$queryRaw<{ known: boolean; groups: bigint }[]>`
    SELECT EXISTS (
             SELECT 1 FROM "ErrorDay" WHERE "day" = (now() AT TIME ZONE 'UTC')::date AND "fingerprint" = ${fingerprint}
           ) AS known,
           (SELECT count(*) FROM "ErrorDay"
             WHERE "day" = (now() AT TIME ZONE 'UTC')::date AND "source" = ${report.source}::"ErrorSource") AS groups`;
  const key = !known && Number(groups) >= MAX_ERROR_GROUPS_PER_DAY ? `${OTHER_ERRORS}:${report.source}` : fingerprint;
  await db.$executeRaw`
    INSERT INTO "ErrorDay" ("day", "fingerprint", "source", "kind", "route", "message", "digest", "count", "lastSeenAt")
    VALUES ((now() AT TIME ZONE 'UTC')::date, ${key}, ${report.source}::"ErrorSource", ${kind}, ${route}, ${message},
            ${digest}, 1, now() AT TIME ZONE 'UTC')
    ON CONFLICT ("day", "fingerprint") DO UPDATE
    SET "count" = "ErrorDay"."count" + 1, "lastSeenAt" = EXCLUDED."lastSeenAt", "kind" = EXCLUDED."kind",
        "route" = EXCLUDED."route", "message" = EXCLUDED."message", "digest" = EXCLUDED."digest"`;
}

/** What Next throws on purpose (redirect, notFound, dynamic rendering…): never an error to record. */
const CONTROL_FLOW_DIGESTS = ["NEXT_REDIRECT", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK", "DYNAMIC_SERVER_USAGE", "BAILOUT_TO_CLIENT_SIDE_RENDERING"];

/** Where Next says a server error happened (onRequestError's context): the route and the kind of request. */
export type ServerErrorContext = { routePath: string; routeType: string };

/** The digest Next gives a server error, which finds it in the host's logs; null without one. */
function digestOf(error: unknown): string | null {
  return typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string" ? error.digest : null;
}

/**
 * Records a server error Next reports (onRequestError, instrumentation.ts): its name and message, its digest, its route
 * (« /saves/[id]/live », never the address) and the kind of request (render, route, action, proxy). Never the request's
 * address, headers or cookies. Never throws: failing to record an error is only logged.
 */
export async function recordServerError(error: unknown, context: ServerErrorContext, db: Db = prisma): Promise<void> {
  try {
    const digest = digestOf(error);
    if (digest !== null && CONTROL_FLOW_DIGESTS.some((prefix) => digest.startsWith(prefix))) {
      return;
    }
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    await recordError(db, { source: "SERVER", kind: context.routeType, route: context.routePath, message, digest });
  } catch (failure) {
    console.error("Could not record a server error", failure);
  }
}

/** Deletes the errors of the days older than ERROR_RETENTION_DAYS, at the daily maintenance: how many groups went. */
export async function purgeOldErrors(db: Db): Promise<number> {
  return db.$executeRaw`
    DELETE FROM "ErrorDay" WHERE "day" < (now() AT TIME ZONE 'UTC')::date - ${ERROR_RETENTION_DAYS}::int`;
}

/** A group of errors as the dashboard lists it. */
export type ErrorGroupView = {
  fingerprint: string;
  source: ErrorSource;
  kind: string;
  route: string;
  message: string; // its latest occurrence's
  digest: string | null;
  lastDay: number; // occurrences over the last 24 hours (the UTC days of today and yesterday)
  lastWeek: number; // over the last seven UTC days, today included
  lastSeenAt: string; // ISO, UTC
  other: boolean; // the « (other) » group of a day past MAX_ERROR_GROUPS_PER_DAY
};

/** The « Erreurs » section of /admin: the last 24 hours, the last seven days, their most frequent groups, the latest. */
export type ErrorsSection = {
  lastDay: { total: number; server: number; client: number };
  lastWeek: { total: number; server: number; client: number };
  groups: ErrorGroupView[]; // the LISTED_ERROR_GROUPS most frequent over seven days, most frequent first
  latest: ErrorGroupView | null;
};

type GroupRow = {
  fingerprint: string;
  source: ErrorSource;
  kind: string;
  route: string;
  message: string;
  digest: string | null;
  lastSeenAt: Date;
  lastWeek: bigint;
  lastDay: bigint;
};

/**
 * The errors of the last seven UTC days at this time, today included, by group: each group's occurrences over seven
 * days and over the last 24 hours (a group seen since this time yesterday, counted on the UTC days of yesterday and
 * today: the table keeps days), and its latest sample. A small table, read in full over the period.
 */
export async function getErrorsSection(db: Db, now: Date): Promise<ErrorsSection> {
  const rows = await db.$queryRaw<GroupRow[]>`
    WITH period AS (
      SELECT * FROM "ErrorDay" WHERE "day" >= (${now}::timestamptz AT TIME ZONE 'UTC')::date - 6
    ), latest AS (
      SELECT DISTINCT ON ("fingerprint") "fingerprint", "source", "kind", "route", "message", "digest", "lastSeenAt"
      FROM period ORDER BY "fingerprint", "lastSeenAt" DESC
    )
    SELECT l.*,
           (SELECT sum(p."count") FROM period p WHERE p."fingerprint" = l."fingerprint")::bigint AS "lastWeek",
           CASE WHEN l."lastSeenAt" >= (${now}::timestamptz AT TIME ZONE 'UTC') - interval '24 hours'
                THEN (SELECT sum(p."count") FROM period p
                       WHERE p."fingerprint" = l."fingerprint"
                         AND p."day" >= (${now}::timestamptz AT TIME ZONE 'UTC')::date - 1)
                ELSE 0 END::bigint AS "lastDay"
    FROM latest l`;
  const groups = rows.map(
    (row): ErrorGroupView => ({
      fingerprint: row.fingerprint,
      source: row.source,
      kind: row.kind,
      route: row.route,
      message: row.message,
      digest: row.digest,
      lastDay: Number(row.lastDay),
      lastWeek: Number(row.lastWeek),
      lastSeenAt: row.lastSeenAt.toISOString(),
      other: row.fingerprint.startsWith(OTHER_ERRORS),
    }),
  );
  const totals = (count: (group: ErrorGroupView) => number) => ({
    total: groups.reduce((sum, group) => sum + count(group), 0),
    server: groups.filter((group) => group.source === "SERVER").reduce((sum, group) => sum + count(group), 0),
    client: groups.filter((group) => group.source === "CLIENT").reduce((sum, group) => sum + count(group), 0),
  });
  return {
    lastDay: totals((group) => group.lastDay),
    lastWeek: totals((group) => group.lastWeek),
    groups: [...groups]
      .sort((a, b) => b.lastWeek - a.lastWeek || b.lastSeenAt.localeCompare(a.lastSeenAt) || a.fingerprint.localeCompare(b.fingerprint))
      .slice(0, LISTED_ERROR_GROUPS),
    latest: groups.reduce<ErrorGroupView | null>((latest, group) => (latest === null || group.lastSeenAt > latest.lastSeenAt ? group : latest), null),
  };
}
