import { describe, expect, it } from "vitest";
import {
  isAdminEmail,
  readAdminEmail,
  readGoogleProfile,
  signInWithGoogle,
  type AccountStore,
  type GoogleProfile,
} from "./google";

const NOW = new Date("2026-10-09T08:00:00.000Z");
const ADMIN = "admin@example.com";

type FakeUser = {
  id: string;
  kind: "ANONYMOUS" | "REGISTERED";
  googleSub: string | null;
  email: string | null;
  name: string | null;
  image: string | null;
};

/** An in-memory users and saves table, standing in for Prisma (src/db/accounts.ts). */
function fakeStore(options: { users?: Partial<FakeUser>[]; saves?: { id: string; ownerId: string | null }[] } = {}) {
  const users = new Map<string, FakeUser>(
    (options.users ?? []).map((user, index) => {
      const full: FakeUser = { id: `u${index}`, kind: "REGISTERED", googleSub: null, email: null, name: null, image: null, ...user };
      return [full.id, full];
    }),
  );
  const saves = (options.saves ?? []).map((save) => ({ ...save }));
  let created = 0;
  const account = (user: FakeUser | undefined) => (user === undefined ? null : { id: user.id, kind: user.kind });

  const store: AccountStore = {
    findUserById: async (id) => account(users.get(id)),
    findUserByGoogleSub: async (sub) => account([...users.values()].find((user) => user.googleSub === sub)),
    findUserByEmail: async (email) => account([...users.values()].find((user) => user.email === email)),
    createRegisteredUser: async ({ googleSub, email, name, image }) => {
      created++;
      const user: FakeUser = { id: `new-${created}`, kind: "REGISTERED", googleSub, email, name, image };
      users.set(user.id, user);
      return account(user) ?? { id: user.id, kind: user.kind };
    },
    updateRegisteredUser: async (id, { googleSub, email, name, image }) => {
      const user = users.get(id);
      if (user !== undefined) {
        Object.assign(user, { kind: "REGISTERED", googleSub, email, name, image });
      }
    },
    moveSaves: async (from, to) => {
      const moved = saves.filter((save) => save.ownerId === from);
      moved.forEach((save) => (save.ownerId = to));
      return moved.length;
    },
    deleteUser: async (id) => {
      users.delete(id);
    },
    claimInheritedSaves: async (to) => {
      const claimed = saves.filter((save) => save.ownerId === null);
      claimed.forEach((save) => (save.ownerId = to));
      return claimed.length;
    },
  };
  return { store, users, saves, created: () => created };
}

const PROFILE: GoogleProfile = { sub: "google-1", email: "Player@Example.com", name: "Ada Lovelace", image: "https://img/ada" };

const signIn = (store: AccountStore, overrides: { profile?: Partial<GoogleProfile>; anonymousUserId?: string | null } = {}) =>
  signInWithGoogle(store, {
    profile: { ...PROFILE, ...overrides.profile },
    anonymousUserId: overrides.anonymousUserId ?? null,
    adminEmail: readAdminEmail(ADMIN),
    now: NOW,
  });

describe("signing in with Google", () => {
  it("creates a REGISTERED user for a new account, its email in lower case", async () => {
    const { store, users } = fakeStore();

    const result = await signIn(store);

    expect(result).toMatchObject({ created: true, mergedSaves: 0, deletedAnonymousUserId: null, claimedInheritedSaves: 0 });
    expect(users.get(result.userId)).toMatchObject({
      kind: "REGISTERED",
      googleSub: "google-1",
      email: "player@example.com",
      name: "Ada Lovelace",
      image: "https://img/ada",
    });
  });

  it("finds the user by its Google sub, even when the account's email has changed", async () => {
    const { store, users, created } = fakeStore({ users: [{ id: "known", googleSub: "google-1", email: "old@example.com" }] });

    const result = await signIn(store);

    expect(result).toMatchObject({ userId: "known", created: false });
    expect(created()).toBe(0);
    expect(users.get("known")?.email).toBe("player@example.com");
  });

  it("finds the user by its email when it has no Google sub yet, and records the sub", async () => {
    const { store, users, created } = fakeStore({ users: [{ id: "by-email", email: "player@example.com" }] });

    const result = await signIn(store);

    expect(result).toMatchObject({ userId: "by-email", created: false });
    expect(created()).toBe(0);
    expect(users.get("by-email")?.googleSub).toBe("google-1");
  });

  it("brings the name and picture up to date at each sign-in", async () => {
    const { store, users } = fakeStore({ users: [{ id: "known", googleSub: "google-1", name: "Ada", image: null }] });

    await signIn(store, { profile: { name: "Ada King", image: "https://img/new" } });

    expect(users.get("known")).toMatchObject({ name: "Ada King", image: "https://img/new" });
  });

  it("gives the anonymous user's saves to the account, then deletes that user", async () => {
    const { store, users, saves } = fakeStore({
      users: [
        { id: "account", googleSub: "google-1" },
        { id: "anon", kind: "ANONYMOUS" },
        { id: "someone", kind: "ANONYMOUS" },
      ],
      saves: [
        { id: "s1", ownerId: "anon" },
        { id: "s2", ownerId: "anon" },
        { id: "s3", ownerId: "someone" },
        { id: "s4", ownerId: "account" },
      ],
    });

    const result = await signIn(store, { anonymousUserId: "anon" });

    expect(result).toMatchObject({ userId: "account", mergedSaves: 2, deletedAnonymousUserId: "anon" });
    expect(users.has("anon")).toBe(false);
    expect(users.has("someone")).toBe(true);
    expect(saves.filter((save) => save.ownerId === "account").map((save) => save.id).sort()).toEqual(["s1", "s2", "s4"]);
    expect(saves.find((save) => save.id === "s3")?.ownerId).toBe("someone");
  });

  it("merges into a brand new account too", async () => {
    const { store, saves } = fakeStore({ users: [{ id: "anon", kind: "ANONYMOUS" }], saves: [{ id: "s1", ownerId: "anon" }] });

    const result = await signIn(store, { anonymousUserId: "anon" });

    expect(result.created).toBe(true);
    expect(saves[0]?.ownerId).toBe(result.userId);
  });

  it("never deletes an account named by the cookie, nor the account itself, nor a purged user", async () => {
    const { store, users, saves } = fakeStore({
      users: [
        { id: "account", googleSub: "google-1" },
        { id: "other-account", googleSub: "google-2" },
      ],
      saves: [{ id: "s1", ownerId: "other-account" }],
    });

    expect(await signIn(store, { anonymousUserId: "other-account" })).toMatchObject({ mergedSaves: 0, deletedAnonymousUserId: null });
    expect(await signIn(store, { anonymousUserId: "account" })).toMatchObject({ mergedSaves: 0, deletedAnonymousUserId: null });
    expect(await signIn(store, { anonymousUserId: "purged" })).toMatchObject({ mergedSaves: 0, deletedAnonymousUserId: null });
    expect([...users.keys()].sort()).toEqual(["account", "other-account"]);
    expect(saves[0]?.ownerId).toBe("other-account");
  });

  it("attaches the inherited saves to the administrator, whatever the case of the email", async () => {
    const { store, saves } = fakeStore({
      saves: [
        { id: "inherited-1", ownerId: null },
        { id: "inherited-2", ownerId: null },
        { id: "owned", ownerId: "someone" },
      ],
    });

    const result = await signIn(store, { profile: { email: "Admin@Example.COM" } });

    expect(result.claimedInheritedSaves).toBe(2);
    expect(saves.map((save) => save.ownerId)).toEqual([result.userId, result.userId, "someone"]);
  });

  it("leaves the inherited saves alone for anyone else", async () => {
    const { store, saves } = fakeStore({ saves: [{ id: "inherited", ownerId: null }] });

    expect((await signIn(store)).claimedInheritedSaves).toBe(0);
    expect(saves[0]?.ownerId).toBeNull();
  });

  it("does nothing more on a second sign-in", async () => {
    const { store, users, saves } = fakeStore({
      users: [{ id: "anon", kind: "ANONYMOUS" }],
      saves: [
        { id: "s1", ownerId: "anon" },
        { id: "inherited", ownerId: null },
      ],
    });
    const first = await signIn(store, { profile: { email: ADMIN }, anonymousUserId: "anon" });

    const second = await signIn(store, { profile: { email: ADMIN }, anonymousUserId: "anon" });

    expect(second).toEqual({ userId: first.userId, created: false, mergedSaves: 0, deletedAnonymousUserId: null, claimedInheritedSaves: 0 });
    expect(users.size).toBe(1);
    expect(saves.every((save) => save.ownerId === first.userId)).toBe(true);
  });
});

describe("the administrator", () => {
  it("is the account of ADMIN_EMAIL, ignoring case and spaces, and nobody without it", () => {
    expect(isAdminEmail("ADMIN@example.com", readAdminEmail(" admin@EXAMPLE.com "))).toBe(true);
    expect(isAdminEmail("other@example.com", readAdminEmail(ADMIN))).toBe(false);
    expect(isAdminEmail(null, readAdminEmail(ADMIN))).toBe(false);
    expect(isAdminEmail(ADMIN, readAdminEmail(undefined))).toBe(false);
    expect(isAdminEmail(ADMIN, readAdminEmail(""))).toBe(false);
  });
});

describe("the Google profile", () => {
  const google = { sub: "google-1", email: "player@example.com", email_verified: true, name: " Ada ", picture: "https://img/ada" };

  it("keeps the sub, the email, the name and the picture", () => {
    expect(readGoogleProfile(google)).toEqual({ sub: "google-1", email: "player@example.com", name: "Ada", image: "https://img/ada" });
    expect(readGoogleProfile({ ...google, name: "", picture: undefined })).toMatchObject({ name: null, image: null });
  });

  it("refuses a profile without a sub or without an email Google has verified", () => {
    expect(readGoogleProfile(undefined)).toBeNull();
    expect(readGoogleProfile({ ...google, sub: undefined })).toBeNull();
    expect(readGoogleProfile({ ...google, email: undefined })).toBeNull();
    expect(readGoogleProfile({ ...google, email_verified: false })).toBeNull();
    expect(readGoogleProfile({ ...google, email_verified: undefined })).toBeNull();
  });
});
