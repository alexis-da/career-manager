import { describe, expect, it } from "vitest";
import { challengeSeed } from "./challenge-seed";

describe("a challenge's seed", () => {
  it("is the same for the same week and secret, and another for any other week or secret", () => {
    const seed = challengeSeed("secret-a", "2026-W45");

    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(challengeSeed("secret-a", "2026-W45")).toBe(seed);
    expect(challengeSeed("secret-a", "2026-W46")).not.toBe(seed);
    expect(challengeSeed("secret-b", "2026-W45")).not.toBe(seed);
  });

  it("does not show its week, and needs a secret", () => {
    expect(challengeSeed("secret-a", "2026-W45")).not.toContain("2026");
    expect(() => challengeSeed("", "2026-W45")).toThrow();
  });
});
