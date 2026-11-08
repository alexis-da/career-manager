import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("lets a key through `limit` times a window, then again once the window is over", () => {
    const limiter = rateLimit({ limit: 3, windowMs: 60_000, maxKeys: 10 });

    expect([0, 1, 2, 3].map((second) => limiter.allow("a", second * 1000))).toEqual([true, true, true, false]);
    expect(limiter.allow("b", 4000)).toBe(true);
    expect(limiter.allow("a", 59_999)).toBe(false);
    expect(limiter.allow("a", 60_000)).toBe(true);
  });

  it("remembers at most `maxKeys` keys, forgetting the oldest first", () => {
    const limiter = rateLimit({ limit: 1, windowMs: 60_000, maxKeys: 2 });

    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 1)).toBe(true);
    expect(limiter.allow("c", 2)).toBe(true);
    // « a » was forgotten: its window starts again.
    expect(limiter.allow("a", 3)).toBe(true);
    expect(limiter.allow("c", 4)).toBe(false);
  });
});
