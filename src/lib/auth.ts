import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Password protection of the whole app, for a private deployment: one shared password, APP_PASSWORD, and a signed
// session cookie. Without APP_PASSWORD (local development), nothing is protected.

export const SESSION_COOKIE = "cm_session";

/** A session lasts 30 days, then the password is asked again. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** The app's password, or null when the app is not protected. */
export function appPassword(): string | null {
  const password = process.env.APP_PASSWORD;
  return password === undefined || password === "" ? null : password;
}

/** The signing secret, derived from the password: changing the password signs every session out. */
function secretOf(password: string): Buffer {
  return createHash("sha256").update(`career-manager:session-secret:${password}`).digest();
}

const sign = (payload: string, password: string): string =>
  createHmac("sha256", secretOf(password)).update(payload).digest("base64url");

const sameBytes = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b);

/** Compares a typed password with the app's in constant time, whatever their lengths. */
export function passwordMatches(input: string, password: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return sameBytes(digest(input), digest(password));
}

/** The cookie value of a new session: its expiry (ms since epoch), then its signature. */
export function createSessionValue(password: string, now: number): string {
  const expiresAt = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt, password)}`;
}

/** Whether a cookie value is a session signed with this password and not expired. */
export function isValidSession(value: string | undefined, password: string, now: number): boolean {
  if (value === undefined) {
    return false;
  }
  const [expiresAt, signature, ...rest] = value.split(".");
  if (rest.length > 0 || expiresAt === undefined || signature === undefined || !/^\d+$/.test(expiresAt)) {
    return false;
  }
  return sameBytes(Buffer.from(signature), Buffer.from(sign(expiresAt, password))) && Number(expiresAt) > now;
}

/** Where to go after signing in: a path of the app, never another site nor the login page itself. */
export function safeNextPath(next: string | null | undefined): string {
  if (next === null || next === undefined || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next.startsWith("/login") ? "/" : next;
}
