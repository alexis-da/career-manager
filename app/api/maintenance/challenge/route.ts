import { ensureCurrentChallenge } from "@/src/db/challenge";
import { bearerMatches, readMaintenanceSecret } from "@/src/lib/maintenance";

// The week's challenge (src/db/challenge.ts), created every Monday at 05:00 UTC by .github/workflows/challenge.yml
// with « Authorization: Bearer <MAINTENANCE_SECRET> », as the purge (app/api/maintenance/purge/route.ts); the first
// visit of /challenge creates it too when the workflow has not. Without the variable, or with a wrong header, it answers
// 404 as a route that does not exist. Idempotent: called again, it answers the same week with created: false. Neither
// the seed nor the club in the answer, which lands in the workflow's logs. Outside the password (proxy.ts).

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not Found", { status: 404 });

export async function POST(request: Request): Promise<Response> {
  const secret = readMaintenanceSecret(process.env.MAINTENANCE_SECRET);
  if (secret === null || !bearerMatches(request.headers.get("authorization"), secret)) {
    return notFound();
  }
  // Not simulation code: the challenge of the real week.
  const { weekKey, created, startsAt, endsAt, horizonMatchdays } = await ensureCurrentChallenge(new Date());
  console.log(`Challenge ${weekKey}: ${created ? "created" : "already there"}`);
  return Response.json({ weekKey, created, startsAt, endsAt, horizonMatchdays });
}
