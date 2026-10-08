import { describe, expect, it } from "vitest";
import {
  LAST_SEEN_INTERVAL_MS,
  readAuthSecret,
  readSignedUserId,
  resolveCurrentUser,
  resolveOrCreateUser,
  signUserId,
  type IdentityContext,
  type IdentityUser,
} from "./identity";

const SECRET = "a-test-secret-of-at-least-32-characters";
const OTHER_SECRET = "another-test-secret-of-32-characters!";
const NOW = new Date("2026-10-08T12:00:00.000Z");

describe("the lw_uid cookie", () => {
  it("reads back the user id of a value it signed", () => {
    expect(readSignedUserId(signUserId("cmuser123", SECRET), SECRET)).toBe("cmuser123");
  });

  it("refuses a tampered value: another user id, another signature, another secret", () => {
    const value = signUserId("cmuser123", SECRET);
    const [, signature] = value.split(".");

    expect(readSignedUserId(`cmuser124.${signature}`, SECRET)).toBeNull();
    expect(readSignedUserId(`${value.slice(0, -1)}${value.endsWith("A") ? "B" : "A"}`, SECRET)).toBeNull();
    expect(readSignedUserId(value, OTHER_SECRET)).toBeNull();
  });

  it("refuses an absent or malformed value", () => {
    expect(readSignedUserId(undefined, SECRET)).toBeNull();
    expect(readSignedUserId("", SECRET)).toBeNull();
    expect(readSignedUserId("cmuser123", SECRET)).toBeNull();
    expect(readSignedUserId(".signature", SECRET)).toBeNull();
    expect(readSignedUserId("cmuser123.", SECRET)).toBeNull();
  });

  it("requires AUTH_SECRET, and a long enough one, with the command that generates it", () => {
    expect(() => readAuthSecret(undefined)).toThrow(/AUTH_SECRET is not set.*randomBytes\(32\)/);
    expect(() => readAuthSecret("  ")).toThrow(/AUTH_SECRET is not set/);
    expect(() => readAuthSecret("too-short")).toThrow(/too short/);
    expect(readAuthSecret(` ${SECRET} `)).toBe(SECRET);
  });
});

/** An in-memory request and users table, counting what the identity does with them. */
function fakeContext(options: { cookie?: string; users?: IdentityUser[]; now?: Date } = {}) {
  const users = new Map((options.users ?? []).map((user) => [user.id, { ...user }]));
  const state = { cookie: options.cookie, created: 0, touched: 0, cookiesWritten: 0 };
  const context: IdentityContext<IdentityUser> = {
    secret: SECRET,
    now: options.now ?? NOW,
    readCookie: () => state.cookie,
    writeCookie: (value) => {
      state.cookie = value;
      state.cookiesWritten++;
    },
    findUser: async (id) => users.get(id) ?? null,
    touchUser: async (id, now) => {
      const user = users.get(id);
      if (user !== undefined) {
        user.lastSeenAt = now;
      }
      state.touched++;
    },
    createUser: async (now) => {
      state.created++;
      const user = { id: `user-${state.created}`, lastSeenAt: now };
      users.set(user.id, user);
      return { ...user };
    },
  };
  return { context, state, users };
}

describe("the current user", () => {
  it("is null without a cookie, and getCurrentUser creates nobody", async () => {
    const { context, state } = fakeContext();

    expect(await resolveCurrentUser(context)).toBeNull();
    expect(state).toMatchObject({ created: 0, cookiesWritten: 0 });
  });

  it("is null with a tampered cookie or a cookie of a user since purged", async () => {
    const known = { id: "known", lastSeenAt: NOW };

    expect(await resolveCurrentUser(fakeContext({ cookie: "known.forged", users: [known] }).context)).toBeNull();
    expect(await resolveCurrentUser(fakeContext({ cookie: signUserId("purged", SECRET), users: [known] }).context)).toBeNull();
  });

  it("is created lazily, with its cookie, by requireCurrentUser only, then found again", async () => {
    const { context, state } = fakeContext();

    const created = await resolveOrCreateUser(context);
    expect(state).toMatchObject({ created: 1, cookiesWritten: 1 });
    expect(readSignedUserId(state.cookie, SECRET)).toBe(created.id);

    const again = await resolveOrCreateUser(context);
    expect(again.id).toBe(created.id);
    expect(await resolveCurrentUser(context)).toMatchObject({ id: created.id });
    expect(state).toMatchObject({ created: 1, cookiesWritten: 1 });
  });

  it("refreshes lastSeenAt at most once a day", async () => {
    const recent = { id: "recent", lastSeenAt: new Date(NOW.getTime() - LAST_SEEN_INTERVAL_MS + 60_000) };
    const stale = { id: "stale", lastSeenAt: new Date(NOW.getTime() - LAST_SEEN_INTERVAL_MS) };
    const fresh = fakeContext({ cookie: signUserId("recent", SECRET), users: [recent] });
    const old = fakeContext({ cookie: signUserId("stale", SECRET), users: [stale] });

    expect(await resolveCurrentUser(fresh.context)).toMatchObject({ lastSeenAt: recent.lastSeenAt });
    expect(fresh.state.touched).toBe(0);
    expect(await resolveCurrentUser(old.context)).toMatchObject({ lastSeenAt: NOW });
    expect(old.state.touched).toBe(1);
    expect(old.users.get("stale")?.lastSeenAt).toEqual(NOW);
  });
});
