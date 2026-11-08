import { z } from "zod";
import { prisma } from "@/src/db/client";
import { recordError } from "@/src/db/errors";
import { rateLimit } from "@/src/lib/rate-limit";

// Where a player's browser reports the game's errors (reportClientError, app/_lib/report-client-error.ts). A route, not a
// Server Action: a beacon must reach the server from a page about to close, and from a page of an earlier deployment,
// whose actions' ids are gone, exactly when errors are likeliest. Small and limited: a body of MAX_BODY_BYTES at most, a
// few reports a minute an address (kept in memory only, never stored) and a cap an instance; recorded like a server
// error, cleaned of anything personal (recordError, src/db/errors.ts). Always 204: a page has nothing to do with it.

export const dynamic = "force-dynamic";

/** The largest report taken, in bytes: a message and a route, never a stack. */
const MAX_BODY_BYTES = 2 * 1024;

const reportSchema = z.object({
  kind: z.enum(["error", "rejection", "react"]),
  message: z.string().min(1).max(1000),
  route: z.string().max(1000),
});

/** Ten reports a minute an address; three hundred a minute an instance, whoever sends them. */
const perAddress = rateLimit({ limit: 10, windowMs: 60_000, maxKeys: 5_000 });
const perInstance = rateLimit({ limit: 300, windowMs: 60_000, maxKeys: 1 });

const noContent = () => new Response(null, { status: 204 });

/** Whether the request comes from the game's own pages: another site's posts are not ours to record. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request) || Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return noContent();
  }
  // Not simulation code: a rate is real time. The address stays in this instance's memory, a minute at most.
  const now = Date.now();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!perAddress.allow(address, now) || !perInstance.allow("all", now)) {
    return noContent();
  }
  const body = await request.text().catch(() => "");
  if (body.length === 0 || body.length > MAX_BODY_BYTES) {
    return noContent();
  }
  let report: z.infer<typeof reportSchema>;
  try {
    const parsed = reportSchema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      return noContent();
    }
    report = parsed.data;
  } catch {
    return noContent();
  }
  try {
    await recordError(prisma, { source: "CLIENT", ...report });
  } catch (failure) {
    console.error("Could not record a browser error", failure);
  }
  return noContent();
}
