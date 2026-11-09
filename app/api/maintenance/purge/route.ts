import { prisma } from "@/src/db/client";
import { recordMaintenance } from "@/src/db/daily-stats";
import { purgeOldErrors } from "@/src/db/errors";
import { purgeAnonymousUsers, purgeChallengeSaves } from "@/src/db/purge";
import { bearerMatches, readMaintenanceSecret } from "@/src/lib/maintenance";

// The daily purge (src/db/purge.ts), called by .github/workflows/maintenance.yml with
// « Authorization: Bearer <MAINTENANCE_SECRET> ». Without the variable, or with a wrong header, it answers 404 as a
// route that does not exist. One batch of anonymous users per call (PURGE_BATCH_SIZE, seen longest ago first), then one
// of challenge saves (CHALLENGE_SAVE_PURGE_BATCH_SIZE, 24 h after their challenge), and remaining says how many of both
// are left: the workflow calls again until none. ?oneDay=1 purges the anonymous users seen only on the day they were
// created after 14 days rather than 30; without it they are only counted, in byRule, with what every rule removes.
// ?dryRun=1 counts without deleting. Each call that deletes adds to the day's figures (DailyStat,
// src/db/daily-stats.ts), the one-day users' apart, and records the database's size: one snapshot a day, for /admin. It
// also deletes the errors of the days older than 30 (purgeOldErrors, src/db/errors.ts), a small table, in one statement.

export const dynamic = "force-dynamic";

/** Seconds a call may run: a batch's cascades fit well within. */
export const maxDuration = 60;

const notFound = () => new Response("Not Found", { status: 404 });

export async function POST(request: Request): Promise<Response> {
  const secret = readMaintenanceSecret(process.env.MAINTENANCE_SECRET);
  if (secret === null || !bearerMatches(request.headers.get("authorization"), secret)) {
    return notFound();
  }
  const query = new URL(request.url).searchParams;
  const dryRun = query.get("dryRun") === "1";
  const oneDayRule = query.get("oneDay") === "1";
  // Not simulation code: what goes depends on real time.
  const now = new Date();
  const users = await purgeAnonymousUsers(prisma, now, { dryRun, oneDayRule });
  const challengeSaves = await purgeChallengeSaves(prisma, now, { dryRun });
  const remaining = users.remaining + challengeSaves.remaining;
  const errors = dryRun ? 0 : await purgeOldErrors(prisma);
  // The day's figures for /admin: what went, and the database's size once it went.
  if (!dryRun) {
    await recordMaintenance(prisma, {
      users: users.total,
      saves: users.saves,
      oneDayUsers: users.oneDay,
      oneDaySaves: users.oneDaySaves,
      challengeSaves: challengeSaves.total,
    });
  }
  console.log(
    `Purge${dryRun ? " (dry run)" : ""}${oneDayRule ? " with the 14-day rule" : ""}: ${users.inactive} inactive, ${users.oneDay} one-day, ${users.empty} empty anonymous users (${users.saves} saves), ${challengeSaves.total} challenge saves, ${errors} error groups, ${remaining} remaining`,
  );
  return Response.json({ ...users, challengeSaves: challengeSaves.total, errors, remaining });
}
