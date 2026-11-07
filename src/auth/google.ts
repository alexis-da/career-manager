import type { Acquisition } from "../lib/arrival";

// Signing in with Google: which of our users a Google account is, what becomes of the anonymous user of the same
// browser, and the administrator's inherited saves. Pure: the database is a store passed in (src/db/accounts.ts for
// the real one, an in-memory one in the tests), the request's cookie and ADMIN_EMAIL are values passed in.

/** What Google says about the account, from the OpenID profile. */
export type GoogleProfile = {
  sub: string; // stable id of the Google account
  email: string;
  name: string | null;
  image: string | null;
};

export type AccountUser = { id: string; kind: "ANONYMOUS" | "REGISTERED" };

/** What signing in needs from the database. Every call of one sign-in runs in the same transaction. */
export type AccountStore = {
  findUserById: (id: string) => Promise<AccountUser | null>;
  findUserByGoogleSub: (sub: string) => Promise<AccountUser | null>;
  findUserByEmail: (email: string) => Promise<AccountUser | null>;
  /** A new account, with the arrival of the request that creates it (src/lib/arrival.ts). */
  createRegisteredUser: (data: GoogleAccountData, acquisition: Acquisition) => Promise<AccountUser>;
  updateRegisteredUser: (id: string, data: GoogleAccountData) => Promise<void>;
  /** Gives every save of one user to another; the number of saves moved. */
  moveSaves: (fromUserId: string, toUserId: string) => Promise<number>;
  /**
   * Gives one user's weekly challenge entries to another, as their saves, but the other keeps its own entry of a week:
   * the first user's entry of that week is deleted, its save (moved all the same) no longer counts. The entries moved
   * and dropped.
   */
  moveChallengeEntries: (fromUserId: string, toUserId: string) => Promise<{ moved: number; dropped: number }>;
  /**
   * Gives one user's history to another, the same player: their days of visit (UserDay), the earliest date of each first
   * step of both (User.firstSaveAt…), and, with `arrival` (an account this sign-in creates), their creation's date and
   * their arrival (User.source…), the account's being the sign-in's.
   */
  moveHistory: (fromUserId: string, toUserId: string, options: { arrival: boolean }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  /** Gives the inherited saves (ownerId NULL) to a user; the number of saves attached. */
  claimInheritedSaves: (toUserId: string) => Promise<number>;
};

/** The columns of User a Google sign-in writes, each time: the account may have changed its name or picture. */
export type GoogleAccountData = {
  googleSub: string;
  email: string;
  name: string | null;
  image: string | null;
  lastSeenAt: Date;
};

export type GoogleSignIn = {
  profile: GoogleProfile;
  anonymousUserId: string | null; // the user of a valid lw_uid cookie, if any
  adminEmail: string | null; // ADMIN_EMAIL
  now: Date; // real time, for lastSeenAt
  acquisition: Acquisition; // the sign-in request's: the arrival of an account it creates, unless an anonymous player's
};

export type GoogleSignInResult = {
  userId: string;
  created: boolean;
  mergedSaves: number; // saves of the anonymous user given to the account
  mergedChallengeEntries: number; // the anonymous user's challenge entries given to the account with their saves
  droppedChallengeEntries: number; // those of a week the account already plays: the account keeps its own
  deletedAnonymousUserId: string | null;
  claimedInheritedSaves: number;
};

/** Emails are compared and stored in lower case: Google's are case-insensitive. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** ADMIN_EMAIL, or null when it is not set. */
export function readAdminEmail(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : normalizeEmail(value);
}

/** Whether an email is the administrator's, ignoring case. Nobody is when ADMIN_EMAIL is not set. */
export function isAdminEmail(email: string | null | undefined, adminEmail: string | null): boolean {
  return adminEmail !== null && email !== null && email !== undefined && normalizeEmail(email) === adminEmail;
}

/**
 * Signs a Google account in: our user of that Google account (by its sub, else by its email, else a new REGISTERED
 * one), its name and picture brought up to date; the saves of the browser's anonymous user given to it with their
 * challenge entries (the account keeping its own entry of a week), and that user deleted; the inherited saves given
 * to the administrator. Running it again changes nothing more.
 */
export async function signInWithGoogle(store: AccountStore, input: GoogleSignIn): Promise<GoogleSignInResult> {
  const data: GoogleAccountData = {
    googleSub: input.profile.sub,
    email: normalizeEmail(input.profile.email),
    name: input.profile.name,
    image: input.profile.image,
    lastSeenAt: input.now,
  };

  const existing = (await store.findUserByGoogleSub(data.googleSub)) ?? (await store.findUserByEmail(data.email));
  let userId: string;
  if (existing === null) {
    userId = (await store.createRegisteredUser(data, input.acquisition)).id;
  } else {
    userId = existing.id;
    await store.updateRegisteredUser(userId, data);
  }

  // The anonymous user of this browser: its saves follow the player into the account. Only an anonymous user: a
  // cookie never names an account, and an account is never deleted here.
  let mergedSaves = 0;
  let challengeEntries = { moved: 0, dropped: 0 };
  let deletedAnonymousUserId: string | null = null;
  if (input.anonymousUserId !== null && input.anonymousUserId !== userId) {
    const anonymous = await store.findUserById(input.anonymousUserId);
    if (anonymous !== null && anonymous.kind === "ANONYMOUS") {
      mergedSaves = await store.moveSaves(anonymous.id, userId);
      // Before the user goes, or their entries would go with them.
      challengeEntries = await store.moveChallengeEntries(anonymous.id, userId);
      // Their days of visit too, and, into an account created now, when and how they arrived: the same player.
      await store.moveHistory(anonymous.id, userId, { arrival: existing === null });
      await store.deleteUser(anonymous.id);
      deletedAnonymousUserId = anonymous.id;
    }
  }

  const claimedInheritedSaves = isAdminEmail(data.email, input.adminEmail) ? await store.claimInheritedSaves(userId) : 0;

  return {
    userId,
    created: existing === null,
    mergedSaves,
    mergedChallengeEntries: challengeEntries.moved,
    droppedChallengeEntries: challengeEntries.dropped,
    deletedAnonymousUserId,
    claimedInheritedSaves,
  };
}

/**
 * The Google profile of a sign-in, or null when it cannot be one of our accounts: no sub, or no email Google has
 * verified (an unverified email must not reach the account that owns it).
 */
export function readGoogleProfile(profile: Record<string, unknown> | undefined): GoogleProfile | null {
  if (profile === undefined) {
    return null;
  }
  const { sub, email, email_verified: emailVerified, name, picture } = profile;
  if (typeof sub !== "string" || sub === "" || typeof email !== "string" || email === "" || emailVerified !== true) {
    return null;
  }
  return {
    sub,
    email,
    name: typeof name === "string" && name.trim() !== "" ? name.trim() : null,
    image: typeof picture === "string" && picture !== "" ? picture : null,
  };
}
