import { createHash, timingSafeEqual } from "node:crypto";

// The maintenance endpoint (app/api/maintenance/purge/route.ts): its secret, and who the purge removes. Pure: the
// secret and the time are passed in.

const HOUR_MS = 60 * 60 * 1000;

/** An anonymous user not seen for this long goes, with their saves. */
export const INACTIVE_ANONYMOUS_DAYS = 30;
/** An anonymous user without a save, not seen for this long, goes too. */
export const EMPTY_ANONYMOUS_HOURS = 24;

/** MAINTENANCE_SECRET, or null when it is not set: the endpoint then does not exist. */
export function readMaintenanceSecret(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value.trim();
}

/** Whether an Authorization header is « Bearer <secret> », compared in constant time whatever the lengths. */
export function bearerMatches(header: string | null, secret: string): boolean {
  if (header === null || !header.startsWith("Bearer ")) {
    return false;
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice("Bearer ".length).trim()), digest(secret));
}

/** The two thresholds of a purge at this time: lastSeenAt before them, an anonymous user goes. */
export function purgeCutoffs(now: Date): { inactiveBefore: Date; emptyBefore: Date } {
  return {
    inactiveBefore: new Date(now.getTime() - INACTIVE_ANONYMOUS_DAYS * 24 * HOUR_MS),
    emptyBefore: new Date(now.getTime() - EMPTY_ANONYMOUS_HOURS * HOUR_MS),
  };
}
