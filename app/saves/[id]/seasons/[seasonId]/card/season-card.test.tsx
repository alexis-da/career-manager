import { describe, expect, it } from "vitest";
import type { SeasonResultView } from "@/src/db/season-results";
import { testTranslator } from "@/src/i18n/test-intl";
import { CARD_SIZES, cardBadge, seasonCardResponse, type CardFormat } from "./season-card";

const LYON = { primary: "#1B3E8F", secondary: "#E2001A" };

const CHAMPION: SeasonResultView = {
  seasonId: "season",
  startYear: 2027,
  competitionCode: "fr.1",
  rank: 1,
  champion: true,
  promoted: false,
  relegated: false,
  cupRound: 5,
  cupWinner: false,
  points: 84,
  played: 34,
  won: 26,
  drawn: 6,
  lost: 2,
  goalsFor: 81,
  goalsAgainst: 25,
  formation: "4-3-3",
  bestPlayer: { playerKey: "olympique-lyonnais#9", name: "Prénom Nom", position: "ST", goals: 24, assists: 6, rating: 7.6, age: 27 },
};

/** Width and height of a PNG, from its IHDR chunk; throws when the bytes are not a PNG. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A test that draws a card: the first drawing loads the fonts and the image engine, more than 5 s on a busy machine. */
const DRAWING_TIMEOUT_MS = 15_000;

async function render(season: SeasonResultView, format: CardFormat): Promise<Buffer> {
  const response = await seasonCardResponse(season, LYON, format, {
    positions: testTranslator("fr", "positions"),
    world: testTranslator("fr", "world"),
  });
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("private, max-age=0");
  return Buffer.from(await response.arrayBuffer());
}

// Rendering only: the images themselves are checked by eye (the drawing of a face is tested in player-face.test.tsx).
describe("seasonCardResponse", () => {
  it.each(["landscape", "square"] as const)("draws a champion's %s card at its size", async (format) => {
    expect(pngSize(await render(CHAMPION, format))).toEqual(CARD_SIZES[format]);
  }, DRAWING_TIMEOUT_MS);

  it.each([
    ["a second division champion, promoted", { rank: 1, champion: true, promoted: true }],
    ["a club promoted from second place", { rank: 2, champion: false, promoted: true }],
    ["a relegated club", { rank: 18, champion: false, relegated: true }],
  ] as const)("draws the card of %s in both formats", async (_, change) => {
    const season = { ...CHAMPION, competitionCode: "fr.2", ...change };
    for (const format of ["landscape", "square"] as const) {
      expect(pngSize(await render(season, format))).toEqual(CARD_SIZES[format]);
    }
  }, DRAWING_TIMEOUT_MS);

  it("shows the double, the cup or the league, then a promotion", () => {
    const season = { rank: 1, promoted: false, relegated: false, cupWinner: false };
    expect(cardBadge({ ...season, cupWinner: true })).toEqual({ badge: "DOUBLÉ", line: "Championnat et Coupe" });
    expect(cardBadge({ ...season, cupWinner: true, promoted: true })).toEqual({
      badge: "DOUBLÉ",
      line: "Championnat et Coupe · Promu en Division 1",
    });
    expect(cardBadge(season)).toEqual({ badge: "CHAMPION", line: null });
    expect(cardBadge({ ...season, rank: 4, cupWinner: true })).toEqual({ badge: "COUPE", line: "4e place" });
    expect(cardBadge({ ...season, rank: 2, cupWinner: true, promoted: true })).toEqual({ badge: "COUPE", line: "2e place · promu" });
    expect(cardBadge({ ...season, rank: 3, promoted: true })).toEqual({ badge: "PROMU", line: "3e place" });
    expect(cardBadge({ ...season, rank: 9 })).toBeNull();
  });

  it("draws the cards of a double and of a cup winner in both formats", async () => {
    for (const change of [{ cupWinner: true, cupRound: 6 }, { rank: 5, champion: false, cupWinner: true, cupRound: 6 }]) {
      for (const format of ["landscape", "square"] as const) {
        expect(pngSize(await render({ ...CHAMPION, ...change }, format))).toEqual(CARD_SIZES[format]);
      }
    }
  }, DRAWING_TIMEOUT_MS);

  it("draws a card without a best player", async () => {
    const season = { ...CHAMPION, rank: 14, champion: false, bestPlayer: null };
    expect(pngSize(await render(season, "landscape"))).toEqual(CARD_SIZES.landscape);
  }, DRAWING_TIMEOUT_MS);
});
