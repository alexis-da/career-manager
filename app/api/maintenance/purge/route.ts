import { prisma } from "@/src/db/client";
import { recordMaintenance } from "@/src/db/daily-stats";
import { purgeAnonymousUsers, purgeChallengeSaves } from "@/src/db/purge";
import { bearerMatches, readMaintenanceSecret } from "@/src/lib/maintenance";

// The daily purge (src/db/purge.ts), called by .github/workflows/maintenance.yml with
// « Authorization: Bearer <MAINTENANCE_SECRET> ». Without the variable, or with a wrong header, it answers 404 as a
// route that does not exist. One batch of anonymous users per call (PURGE_BATCH_SIZE, seen longest ago first), then one
// of challenge saves (CHALLENGE_SAVE_PURGE_BATCH_SIZE, 24 h after their challenge), and remaining says how many of both
// are left: the workflow calls again until none. ?dryRun=1 counts without deleting. Each call that deletes adds to the
// day's figures (DailyStat, src/db/daily-stats.ts) and records the database's size: one snapshot a day, for /admin.

export const dynamic = "force-dynamic";

/** Seconds a call may run: a batch's cascades fit well within. */
export const maxDuration = 60;

const notFound = () => new Response("Not Found", { status: 404 });

export async function POST(request: Request): Promise<Response> {
  const secret = readMaintenanceSecret(process.env.MAINTENANCE_SECRET);
  if (secret === null || !bearerMatches(request.headers.get("authorization"), secret)) {
    return notFound();
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  // Not simulation code: what goes depends on real time.
  const now = new Date();
  const users = await purgeAnonymousUsers(prisma, now, { dryRun });
  const challengeSaves = await purgeChallengeSaves(prisma, now, { dryRun });
  const remaining = users.remaining + challengeSaves.remaining;
  // The day's figures for /admin: what went, and the database's size once it went.
  if (!dryRun) {
    await recordMaintenance(prisma, { users: users.total, saves: users.saves, challengeSaves: challengeSaves.total });
  }
  console.log(
    `Purge${dryRun ? " (dry run)" : ""}: ${users.inactive} inactive, ${users.empty} empty anonymous users (${users.saves} saves), ${challengeSaves.total} challenge saves, ${remaining} remaining`,
  );
  return Response.json({ ...users, challengeSaves: challengeSaves.total, remaining });
}
