import { prisma } from "@/src/db/client";
import { cleanUpEvents, totalOf } from "@/src/db/event-cleanup";
import { bearerMatches, readMaintenanceSecret } from "@/src/lib/maintenance";

// The cleanup of the match events no screen reads any more (src/db/event-cleanup.ts), a task of the daily maintenance
// (.github/workflows/maintenance.yml), with the purge's « Authorization: Bearer <MAINTENANCE_SECRET> »: without the
// variable, or with a wrong header, it answers 404 as a route that does not exist. One pass a call, by batches, and
// remaining says how many rows are left: the workflow calls again until none. ?dryRun=1 counts without deleting. Every
// call is recorded (CleanupPass) and shown in /admin's health section.

export const dynamic = "force-dynamic";

/** Seconds a call may run: a pass stops starting batches after 20, then counts what remains. */
export const maxDuration = 60;

const notFound = () => new Response("Not Found", { status: 404 });

export async function POST(request: Request): Promise<Response> {
  const secret = readMaintenanceSecret(process.env.MAINTENANCE_SECRET);
  if (secret === null || !bearerMatches(request.headers.get("authorization"), secret)) {
    return notFound();
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const pass = await cleanUpEvents(prisma, { dryRun });
  const [deleted, remaining] = [totalOf(pass.deleted), totalOf(pass.remaining)];
  console.log(
    `Event cleanup${dryRun ? " (dry run)" : ""}: ${deleted} deleted, ${remaining} remaining ` +
      `(other goals ${pass.remaining.otherGoals}, managed events ${pass.remaining.managedEvents}, decisions ${pass.remaining.decisions}), ${pass.milliseconds} ms`,
  );
  return Response.json({ dryRun, deleted, remaining, byKind: { deleted: pass.deleted, remaining: pass.remaining }, milliseconds: pass.milliseconds });
}
