import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "../db/client";
import { loadOwnedSave, type OwnedSave } from "../db/access";
import { recordUserDay } from "../db/user-days";
import { requestAcquisition } from "./acquisition";
import { auth } from "./auth";
import { isAdminEmail, readAdminEmail } from "./google";
import {
  readAuthSecret,
  resolveCurrentUser,
  resolveOrCreateUser,
  signUserId,
  USER_COOKIE,
  USER_COOKIE_MAX_AGE_SECONDS,
  type IdentityContext,
} from "./identity";

// The player making the request: from the Auth.js session when signed in with Google, else from the lw_uid cookie. Read once when the module loads: without AUTH_SECRET, the
// server fails here (and at start-up, instrumentation.ts) rather than serve unsigned identities.
const AUTH_SECRET = readAuthSecret(process.env.AUTH_SECRET);

export type CurrentUser = {
  id: string;
  kind: "ANONYMOUS" | "REGISTERED";
  lastSeenAt: Date;
  email: string | null; // the Google account's, null for an anonymous user
  name: string | null;
  image: string | null;
};

const USER_SELECT = { id: true, kind: true, lastSeenAt: true, email: true, name: true, image: true } as const;

const ADMIN_EMAIL = readAdminEmail(process.env.ADMIN_EMAIL);

/** Whether a user is the administrator: the Google account of ADMIN_EMAIL. No column: the variable decides. */
export function isAdmin(user: Pick<CurrentUser, "email"> | null): boolean {
  return user !== null && isAdminEmail(user.email, ADMIN_EMAIL);
}

/** The lw_uid cookie's options: the server's alone, sent back by the browser on the game's pages, for a year. */
const USER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV !== "development",
  path: "/",
  maxAge: USER_COOKIE_MAX_AGE_SECONDS,
} as const;

async function identityContext(): Promise<IdentityContext<CurrentUser>> {
  const [store, session] = await Promise.all([cookies(), auth()]);
  return {
    secret: AUTH_SECRET,
    sessionUserId: session?.userId ?? null,
    // Not simulation code: lastSeenAt is real time.
    now: new Date(),
    readCookie: () => store.get(USER_COOKIE)?.value,
    writeCookie: (value) => store.set(USER_COOKIE, value, USER_COOKIE_OPTIONS),
    findUser: (id) => prisma.user.findUnique({ where: { id }, select: USER_SELECT }),
    // lastSeenAt and the day's UserDay, together: the first request of a day.
    touchUser: async (id, now) => {
      await prisma.user.update({ where: { id }, data: { lastSeenAt: now } });
      await recordUserDay(prisma, id, now);
    },
    // With how they arrived: the request creating a save is the player's browser.
    createUser: async (now) => {
      const data = { kind: "ANONYMOUS" as const, lastSeenAt: now, ...(await requestAcquisition()) };
      const user = await prisma.user.create({ data, select: USER_SELECT });
      await recordUserDay(prisma, user.id, now);
      return user;
    },
  };
}

/** The user of the request, from the Google session, else the lw_uid cookie; null without either. Creates nothing. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => resolveCurrentUser(await identityContext()));

/**
 * The user of the request (signed in, or anonymous), created as an anonymous one with its cookie when there is none. Sets a cookie, so it
 * only runs in a Server Action: the creation of a save is the one that calls it.
 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  return resolveOrCreateUser(await identityContext());
}

/**
 * The save of a page or a Server Action, if the user of the request may open it (src/db/access.ts); notFound()
 * otherwise. Every entry point that receives a saveId goes through it: the layout alone does not protect actions.
 */
export const requireOwnedSave = cache(async (saveId: string): Promise<OwnedSave> => loadOwnedSave(saveId, await getCurrentUser()));

/**
 * Makes this browser an anonymous player's: their signed cookie, as their first save set it in the browser they began
 * in. Only for a resume link spent by its button (app/resume/actions.ts), so only in a Server Action; never an account's.
 */
export async function adoptAnonymousUser(userId: string): Promise<void> {
  (await cookies()).set(USER_COOKIE, signUserId(userId, AUTH_SECRET), USER_COOKIE_OPTIONS);
}
