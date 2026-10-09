import { prisma } from "@/src/db/client";
import { purgeAnonymousUsers } from "@/src/db/purge";
import { bearerMatches, readMaintenanceSecret } from "@/src/lib/maintenance";

// The daily purge of anonymous users (src/db/purge.ts), called by .github/workflows/maintenance.yml with
// « Authorization: Bearer <MAINTENANCE_SECRET> ». Without the variable, or with a wrong header, it answers 404 as a
// route that does not exist. One batch per call (PURGE_BATCH_SIZE users, seen longest ago first), and remaining
// says how many are left: the workflow calls again until none. ?dryRun=1 counts without deleting. Outside the
// password (proxy.ts).

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
  // Not simulation code: who goes depends on real time.
  const result = await purgeAnonymousUsers(prisma, new Date(), { dryRun });
  console.log(
    `Purge${dryRun ? " (dry run)" : ""}: ${result.inactive} inactive, ${result.empty} empty anonymous users, ${result.remaining} remaining`,
  );
  return Response.json(result);
}
