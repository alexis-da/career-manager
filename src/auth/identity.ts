import { createHmac, timingSafeEqual } from "node:crypto";

// Who is playing: a user signed in with Google (the Auth.js session, src/auth/auth.ts), or else an anonymous user
// recognised by a signed cookie, lw_uid = "<user id>.<HMAC-SHA256 signature>".
// The pure part: signing, checking, and resolving the user with the cookies and the users given. The server wiring
// (next/headers, Prisma, AUTH_SECRET) lives in current-user.ts.

export const USER_COOKIE = "lw_uid";

/** The cookie lasts a year; it is set again, for another year, each time a user is created. */
export const USER_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * lastSeenAt is written at most once per UTC day: on the first request of a day (with the UserDay of that day, for
 * the retention). So a user seen in the last 24 hours always has a lastSeenAt within them, which the purge relies on.
 */
export const isSameUtcDay = (a: Date, b: Date): boolean => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/** Shortest AUTH_SECRET accepted: 32 characters, as the 44 of 32 random bytes in base64. */
const MIN_SECRET_LENGTH = 32;

const AUTH_SECRET_HELP = `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;

/** AUTH_SECRET checked: missing or too short, the server refuses to start rather than sign cookies with nothing. */
export function readAuthSecret(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`AUTH_SECRET is not set: it signs the lw_uid cookie. ${AUTH_SECRET_HELP}`);
  }
  if (value.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET is too short (${MIN_SECRET_LENGTH} characters at least). ${AUTH_SECRET_HELP}`);
  }
  return value.trim();
}

const signatureOf = (userId: string, secret: string): string =>
  createHmac("sha256", secret).update(`lw_uid:${userId}`).digest("base64url");

/** The cookie value for a user. */
export function signUserId(userId: string, secret: string): string {
  return `${userId}.${signatureOf(userId, secret)}`;
}

/** The user id of a cookie value signed with this secret, or null when it is absent, malformed or tampered with. */
export function readSignedUserId(value: string | undefined, secret: string): string | null {
  if (value === undefined) {
    return null;
  }
  const dot = value.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const userId = value.slice(0, dot);
  const signature = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(signatureOf(userId, secret));
  return signature.length === expected.length && timingSafeEqual(signature, expected) ? userId : null;
}

export type IdentityUser = { id: string; lastSeenAt: Date };

/** What resolving the user needs from the request and the database, injected so tests can fake them. */
export type IdentityContext<U extends IdentityUser> = {
  secret: string;
  now: Date; // real time: lastSeenAt is about the player, not the game
  sessionUserId: string | null; // our user id in the Auth.js session, when signed in with Google
  readCookie: () => string | undefined;
  writeCookie: (value: string) => void; // only where cookies can be set: a Server Action or a route handler
  findUser: (id: string) => Promise<U | null>;
  touchUser: (id: string, now: Date) => Promise<void>;
  createUser: (now: Date) => Promise<U>;
};

/** The user of the session, else of the signed cookie; null when neither leads to a user. */
async function findRequestUser<U extends IdentityUser>(context: IdentityContext<U>): Promise<U | null> {
  if (context.sessionUserId !== null) {
    const user = await context.findUser(context.sessionUserId);
    if (user !== null) {
      return user;
    }
    // A session of a user since purged: fall back on the cookie.
  }
  const userId = readSignedUserId(context.readCookie(), context.secret);
  // null as well for a valid cookie of a user since purged
  return userId === null ? null : context.findUser(userId);
}

/** The user of the session or of the signed cookie, or null; lastSeenAt refreshed once a UTC day. Creates nothing. */
export async function resolveCurrentUser<U extends IdentityUser>(context: IdentityContext<U>): Promise<U | null> {
  const user = await findRequestUser(context);
  if (user === null) {
    return null;
  }
  if (!isSameUtcDay(user.lastSeenAt, context.now)) {
    await context.touchUser(user.id, context.now);
    return { ...user, lastSeenAt: context.now };
  }
  return user;
}

/** The current user, created as an anonymous one with its cookie when there is none. */
export async function resolveOrCreateUser<U extends IdentityUser>(context: IdentityContext<U>): Promise<U> {
  const existing = await resolveCurrentUser(context);
  if (existing !== null) {
    return existing;
  }
  const user = await context.createUser(context.now);
  context.writeCookie(signUserId(user.id, context.secret));
  return user;
}
