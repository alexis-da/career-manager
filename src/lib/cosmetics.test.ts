import { describe, expect, it } from "vitest";
import { testTranslator } from "@/src/i18n/test-intl";
import {
  COSMETICS,
  COSMETIC_IDS,
  DEFAULT_COSMETIC,
  FRAME_STYLES,
  frameStyleOf,
  nextStreakLot,
  owns,
  priceOf,
  streakLotOf,
  type Cosmetic,
} from "./cosmetics";

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

  it("frames a European title, either competition's, in the compass rose, never on sale", () => {
    const bySeason = (what: string) =>
      COSMETICS.filter(({ unlock }: Cosmetic) => unlock.by === "achievement" && unlock.achievement.on === "season" && unlock.achievement.what === what).map(
        ({ id }) => id,
      );
    expect(bySeason("europe")).toEqual(["frame-compass-rose"]);
    expect(frameStyleOf("frame-compass-rose")).toMatchObject({ ornament: "compass", width: 20 });
    expect(priceOf("frame-compass-rose")).toBeNull();
    // The other season titles keep theirs.
    expect(bySeason("champion")).toEqual(["frame-laurels"]);
    expect(bySeason("double")).toEqual(["badge-double", "frame-double-star"]);
  });

  it("gives the national coach's title for a summer tournament won, never on sale, named in both languages", () => {
    const bySeason = (what: string) =>
      COSMETICS.filter(({ unlock }: Cosmetic) => unlock.by === "achievement" && unlock.achievement.on === "season" && unlock.achievement.what === what).map(
        ({ id, kind }) => `${kind}:${id}`,
      );
    expect(bySeason("nationalTournament")).toEqual(["TITLE:title-national-coach"]);
    expect(priceOf("title-national-coach")).toBeNull();
    const [fr, en] = [testTranslator("fr", "rewards"), testTranslator("en", "rewards")];
    expect([fr("cosmetics.title-national-coach.name"), en("cosmetics.title-national-coach.name")]).toEqual(["Sélectionneur", "National coach"]);
  });

  it("names the laurel frames « Couronne » and « Couronne d'or », clear of the Coupe des Lauriers, under their ids of always", () => {
    const [fr, en] = [testTranslator("fr", "rewards"), testTranslator("en", "rewards")];
    expect(COSMETIC_IDS.has("frame-laurels") && COSMETIC_IDS.has("frame-gold-laurels")).toBe(true);
    expect([fr("cosmetics.frame-laurels.name"), fr("cosmetics.frame-gold-laurels.name")]).toEqual(["Couronne", "Couronne d'or"]);
    expect([en("cosmetics.frame-laurels.name"), en("cosmetics.frame-gold-laurels.name")]).toEqual(["Wreath", "Golden wreath"]);
    expect([fr("cosmetics.frame-compass-rose.name"), en("cosmetics.frame-compass-rose.name")]).toEqual(["Rose des vents", "Compass rose"]);
  });
});
