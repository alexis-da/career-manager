import { describe, expect, it } from "vitest";
import type { SeasonResultView } from "@/src/db/season-results";
import { CARD_SIZES, seasonCardResponse, type CardFormat } from "./season-card";

const LYON = { primary: "#1B3E8F", secondary: "#E2001A" };

const CHAMPION: SeasonResultView = {
  seasonId: "season",
  startYear: 2027,
  competitionName: "France — Division 1",
  rank: 1,
  champion: true,
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

async function render(season: SeasonResultView, format: CardFormat): Promise<Buffer> {
  const response = await seasonCardResponse(season, LYON, format);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("private, max-age=0");
  return Buffer.from(await response.arrayBuffer());
}

// Rendering only: the images themselves are checked by eye (the drawing of a face is tested in player-face.test.tsx).
describe("seasonCardResponse", () => {
  it.each(["landscape", "square"] as const)("draws a champion's %s card at its size", async (format) => {
    expect(pngSize(await render(CHAMPION, format))).toEqual(CARD_SIZES[format]);
  });

  it("draws a card without a best player", async () => {
    const season = { ...CHAMPION, rank: 14, champion: false, bestPlayer: null };
    expect(pngSize(await render(season, "landscape"))).toEqual(CARD_SIZES.landscape);
  });
});
