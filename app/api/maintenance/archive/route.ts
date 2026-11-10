import { prisma } from "@/src/db/client";
import { remainingWork, runArchivePass, type ArchiveMode } from "@/src/db/season-archiving";
import { bearerMatches, readMaintenanceSecret } from "@/src/lib/maintenance";

// The « archive » task of the daily maintenance (src/db/season-archiving.ts, .github/workflows/maintenance.yml), with the
// purge's « Authorization: Bearer <MAINTENANCE_SECRET> »: without the variable, or with a wrong header, it answers 404 as
// a route that does not exist. ?dryRun=1 counts; without a parameter, it archives the completed seasons and deletes
// nothing; ?delete=1 archives, then deletes the rows of the seasons archived long enough ago, checked against their
// archive, by batches. One pass a call, and remaining says what a next call could still do now: the workflow calls
// again until none. Every call is recorded (ArchivePass) and shown in /admin's health section.

export const dynamic = "force-dynamic";

/** Seconds a call may run: a pass stops starting seasons after 20, then counts what remains. */
export const maxDuration = 60;

const notFound = () => new Response("Not Found", { status: 404 });

export async function POST(request: Request): Promise<Response> {
  const secret = readMaintenanceSecret(process.env.MAINTENANCE_SECRET);
  if (secret === null || !bearerMatches(request.headers.get("authorization"), secret)) {
    return notFound();
  }
  const params = new URL(request.url).searchParams;
  const mode: ArchiveMode = params.get("dryRun") === "1" ? "count" : params.get("delete") === "1" ? "delete" : "archive";
  const pass = await runArchivePass(prisma, { mode });
  const remaining = remainingWork(pass);
  console.log(
    `Season archive (${mode}): ${pass.archived} archived, ${pass.deletedSeasons} seasons deleted ` +
      `(${pass.deleted.fixtures} fixtures, ${pass.deleted.stats} stats), ${pass.mismatches} mismatches; ` +
      `${pass.pending} to archive, ${pass.deletable} archived with rows (${pass.deletableNow} deletable now), ` +
      `${pass.rowsRemaining} rows of completed seasons left, ${pass.milliseconds} ms`,
  );
  return Response.json({
    mode,
    archived: pass.archived,
    deletedSeasons: pass.deletedSeasons,
    deleted: pass.deleted,
    mismatches: pass.mismatches,
    pending: pass.pending,
    deletable: pass.deletable,
    deletableNow: pass.deletableNow,
    rowsRemaining: pass.rowsRemaining,
    remaining,
    milliseconds: pass.milliseconds,
  });
}
