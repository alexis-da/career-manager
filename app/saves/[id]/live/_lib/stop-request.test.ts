import { afterEach, describe, expect, it, vi } from "vitest";

/** A tab's session storage, or one that refuses everything (private browsing, storage blocked). */
function sessionOf(blocked = false): Storage {
  const items = new Map<string, string>();
  const refuse = (): never => {
    throw new Error("SecurityError");
  };
  return {
    get length() {
      return items.size;
    },
    clear: () => (blocked ? refuse() : items.clear()),
    getItem: (key) => (blocked ? refuse() : (items.get(key) ?? null)),
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => (blocked ? refuse() : void items.delete(key)),
    setItem: (key, value) => (blocked ? refuse() : void items.set(key, value)),
  };
}

/** The module as a page loads it: a reload starts with an empty memory, the tab's session kept. */
async function load(session: Storage) {
  vi.stubGlobal("window", { sessionStorage: session });
  vi.resetModules();
  return import("./stop-request");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stop requests", () => {
  it("keeps the pause asked for in the tab's session, one per save and match, and forgets it on demand", async () => {
    const session = sessionOf();
    const page = await load(session);
    const key = page.stopRequestKey("save-1", "fixture-1");

    expect(key).toBe("lw_live_stop:save-1:fixture-1");
    expect(page.readStopRequest(key)).toBeNull();
    page.writeStopRequest(key, "IN_PLAY:30");
    expect(page.readStopRequest(key)).toBe("IN_PLAY:30");
    // Only the key of the pause: nothing else is kept.
    expect(session.length).toBe(1);
    expect(session.getItem(key)).toBe("IN_PLAY:30");
    expect(page.readStopRequest(page.stopRequestKey("save-1", "fixture-2"))).toBeNull();

    // After a reload, the session gives it back.
    const reloaded = await load(session);
    expect(reloaded.readStopRequest(key)).toBe("IN_PLAY:30");
    reloaded.writeStopRequest(key, null);
    expect(reloaded.readStopRequest(key)).toBeNull();
    expect(session.length).toBe(0);
  });

  it("holds it in the page's memory without a session, until a reload", async () => {
    const blocked = sessionOf(true);
    const page = await load(blocked);
    const key = page.stopRequestKey("save-1", "fixture-1");

    page.writeStopRequest(key, "IN_PLAY:60");
    expect(page.readStopRequest(key)).toBe("IN_PLAY:60");
    expect((await load(blocked)).readStopRequest(key)).toBeNull();
  });

  it("tells the page of each change, and only of a change", async () => {
    const page = await load(sessionOf());
    const key = page.stopRequestKey("save-1", "fixture-1");
    const listener = vi.fn();
    const unsubscribe = page.subscribeToStopRequests(listener);

    page.writeStopRequest(key, "IN_PLAY:15");
    page.writeStopRequest(key, "IN_PLAY:15");
    page.writeStopRequest(key, null);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    page.writeStopRequest(key, "IN_PLAY:75");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
