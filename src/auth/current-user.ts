import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "../db/client";
import { loadOwnedSave, type OwnedSave } from "../db/access";
import {
  readAuthSecret,
  resolveCurrentUser,
  resolveOrCreateUser,
  USER_COOKIE,
  USER_COOKIE_MAX_AGE_SECONDS,
  type IdentityContext,
} from "./identity";

// The player making the request, from the lw_uid cookie. Read once when the module loads: without AUTH_SECRET, the
// server fails here (and at start-up, instrumentation.ts) rather than serve unsigned identities.
const AUTH_SECRET = readAuthSecret(process.env.AUTH_SECRET);

export type CurrentUser = { id: string; kind: "ANONYMOUS" | "REGISTERED"; lastSeenAt: Date };

const USER_SELECT = { id: true, kind: true, lastSeenAt: true } as const;

async function identityContext(): Promise<IdentityContext<CurrentUser>> {
  const store = await cookies();
  return {
    secret: AUTH_SECRET,
    // Not simulation code: lastSeenAt is real time.
    now: new Date(),
    readCookie: () => store.get(USER_COOKIE)?.value,
    writeCookie: (value) =>
      store.set(USER_COOKIE, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV !== "development",
        path: "/",
        maxAge: USER_COOKIE_MAX_AGE_SECONDS,
      }),
    findUser: (id) => prisma.user.findUnique({ where: { id }, select: USER_SELECT }),
    touchUser: async (id, now) => {
      await prisma.user.update({ where: { id }, data: { lastSeenAt: now } });
    },
    createUser: (now) => prisma.user.create({ data: { kind: "ANONYMOUS", lastSeenAt: now }, select: USER_SELECT }),
  };
}

/** The user of the request, or null without a valid cookie. Creates nothing. Once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => resolveCurrentUser(await identityContext()));

/**
 * The user of the request, created as an anonymous one with its cookie when there is none. Sets a cookie, so it
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
