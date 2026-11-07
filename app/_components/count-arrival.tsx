import { headers } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/src/db/client";
import { utcDayOf } from "@/src/db/user-days";
import { recordVisit } from "@/src/db/visits";
import { ARRIVAL_HEADER, readArrival, VISIT_ID_HEADER } from "@/src/lib/arrival";
import { describeError } from "@/src/lib/diagnostics";

/** The visits this server has counted in the last minute, by id, with when. */
const counted = new Map<string, number>();
const REMEMBERED_MS = 60_000;

/**
 * Whether a visit is counted for the first time here: a page may render twice for one request (`next dev` does, a render
 * warming its caches before the one it sends), and each render would count it. Remembered a minute, in this server's
 * memory: a render twice for one request happens within it.
 */
function firstCount(visitId: string, now: number): boolean {
  for (const [id, at] of counted) {
    if (now - at > REMEMBERED_MS) {
      counted.delete(id);
    }
  }
  if (counted.has(visitId)) {
    return false;
  }
  counted.set(visitId, now);
  return true;
}

/**
 * A visitor's first visit of a public page, which proxy.ts marks (ARRIVAL_HEADER, with the visit's id), counted once the
 * page is sent (VisitDay, src/db/visits.ts): the visitor never waits on it, and a failure costs a count, never the page.
 * Shows nothing. Every public page is rendered at each request (they read the request's cookies), so each first visit is.
 */
export async function CountArrival() {
  const requestHeaders = await headers();
  const arrival = readArrival(requestHeaders.get(ARRIVAL_HEADER));
  const visitId = requestHeaders.get(VISIT_ID_HEADER);
  // Not simulation code: a real visit, on its real day.
  const now = Date.now();
  if (arrival !== null && visitId !== null && firstCount(visitId, now)) {
    const day = utcDayOf(new Date(now));
    after(async () => {
      try {
        await recordVisit(prisma, { day, source: arrival.source, page: arrival.landingPage });
      } catch (error) {
        console.error(`[CountArrival] ${describeError(error)}`);
      }
    });
  }
  return null;
}
