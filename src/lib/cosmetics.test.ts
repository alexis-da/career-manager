import { describe, expect, it } from "vitest";
import { COSMETICS, COSMETIC_IDS, DEFAULT_COSMETIC, FRAME_STYLES, frameStyleOf, nextStreakLot, owns, priceOf, streakLotOf } from "./cosmetics";

describe("the collection's catalogue", () => {
  it("has unique ids, each its kind's prefix, a style for every frame, and the defaults worn without being had", () => {
    expect(COSMETIC_IDS.size).toBe(COSMETICS.length);
    for (const { id, kind } of COSMETICS) {
      expect(id.startsWith(`${kind.toLowerCase()}-`), id).toBe(true);
    }
    for (const frame of COSMETICS.filter(({ kind }) => kind === "FRAME")) {
      expect(frameStyleOf(frame.id), frame.id).toBe((FRAME_STYLES as Record<string, unknown>)[frame.id]);
    }
    expect(owns(new Set(), DEFAULT_COSMETIC.TITLE ?? "")).toBe(true);
    expect(owns(new Set(), "title-professor")).toBe(false);
    expect(owns(new Set(["title-professor"]), "title-professor")).toBe(true);
  });

  it("gives a streak's cycles their exclusive lots, never on sale, in the order of the design", () => {
    expect(streakLotOf(1).map(({ id }) => id).sort()).toEqual(["badge-one-week", "frame-bronze"]);
    expect(
      [2, 3, 4, 5, 6, 7, 8].map((cycle) =>
        streakLotOf(cycle)
          .map(({ id }) => id)
          .join(","),
      ),
    ).toEqual(["title-regular", "frame-silver", "badge-one-month", "title-relentless", "frame-gold", "badge-seven-weeks", "frame-gold-laurels"]);
    expect(nextStreakLot(0)?.cycle).toBe(1);
    expect(nextStreakLot(8)).toBeNull();
    for (const { id } of COSMETICS.filter(({ unlock }) => unlock.by === "streak")) {
      expect(priceOf(id), id).toBeNull();
    }
  });

  it("sells four titles at 250 and four frames at 400, never a badge", () => {
    const onSale = COSMETICS.filter(({ unlock }) => unlock.by === "shop");
    expect(onSale.filter(({ kind }) => kind === "TITLE").map(({ id }) => priceOf(id))).toEqual([250, 250, 250, 250]);
    expect(onSale.filter(({ kind }) => kind === "FRAME").map(({ id }) => priceOf(id))).toEqual([400, 400, 400, 400]);
    expect(onSale.some(({ kind }) => kind === "BADGE")).toBe(false);
  });
});
