import { describe, expect, it } from "vitest";
import { readClubColors } from "./colors";
import { buildWorldPlan } from "./seed";

describe("club colors", () => {
  const colors = readClubColors();
  const slugs = buildWorldPlan().flatMap(({ clubs }) => clubs.map((club) => club.slug));

  it("gives traditional colors to every club of the world, and to no unknown club", () => {
    expect([...colors.keys()].sort()).toEqual([...slugs].sort());
  });

  it("stores #RRGGBB colors", () => {
    for (const { primary, secondary } of colors.values()) {
      expect(primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(secondary).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
