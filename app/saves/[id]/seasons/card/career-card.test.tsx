import { describe, expect, it } from "vitest";
import { realClubNames } from "@/prisma/seed/real-club-names";
import { careerHistoryView, type CompletedCareer, type LiveCareer } from "@/src/db/career-history";
import type { CoachHistory } from "@/src/db/national-view";
import type { HistoryLine, HistorySeason } from "@/src/engine/career-history";
import type { Locale } from "@/src/i18n/locale";
import { MESSAGES } from "@/src/i18n/messages";
import { testTranslator } from "@/src/i18n/test-intl";
import { frameStyleOf } from "@/src/lib/cosmetics";
import { forbiddenNamesIn } from "@/src/lib/outward-names";
import { CARD_SIZES, type CardFormat } from "../[seasonId]/card/season-card";
import { careerCardData, careerCardResponse, type CareerCardData } from "./career-card";

const LYON = { primary: "#1B3E8F", secondary: "#E2001A" };

function season(startYear: number, overrides: Partial<HistorySeason> = {}): HistorySeason {
  return {
    seasonId: `s${startYear}`,
    startYear,
    competitionCode: "fr.1",
    tier: 1,
    rank: 4,
    points: 66,
    played: 34,
    won: 20,
    drawn: 6,
    lost: 8,
    goalsFor: 60,
    goalsAgainst: 35,
    champion: false,
    promoted: false,
    relegated: false,
    cupRound: null,
    cupWinner: false,
    europeCode: null,
    europeStage: null,
    europeWinner: false,
    bestPlayer: null,
    objectives: { met: 2, total: 3 },
    budget: 40_000_000,
    highlights: null,
    ...overrides,
  };
}

const line = (playerKey: string, startYear: number, appearances: number, goals: number): HistoryLine => ({
  playerKey,
  startYear,
  kind: "LEAGUE",
  appearances,
  goals,
  assists: 2,
});

const COMPLETED: CompletedCareer = {
  seasons: [
    season(2026, { tier: 2, competitionCode: "fr.2", rank: 2, promoted: true }),
    season(2027, { rank: 1, champion: true, cupRound: 6, cupWinner: true }),
    season(2028, { europeCode: "eu.1", europeStage: 5, europeWinner: true }),
  ],
  matches: [
    { date: Date.UTC(2027, 9, 3), startYear: 2027, kind: "LEAGUE", competitionCode: "fr.1", round: 8, opponentClubSaveId: "rival", home: true, goalsFor: 7, goalsAgainst: 0, penalties: false },
    { date: Date.UTC(2027, 9, 10), startYear: 2027, kind: "LEAGUE", competitionCode: "fr.1", round: 9, opponentClubSaveId: "rival", home: false, goalsFor: 1, goalsAgainst: 1, penalties: false },
  ],
  lines: [line("olympique-lyonnais#9", 2026, 40, 25), line("olympique-lyonnais#9", 2027, 40, 30), line("olympique-lyonnais#9", 2028, 40, 22)],
};

const LIVE: LiveCareer = {
  managedSlug: "olympique-lyonnais",
  clubColors: LYON,
  challenge: false,
  context: { currentTier: 1, secondDivisions: true, cups: true, europe: true },
  current: null,
  matches: [],
  lines: [],
  players: [{ playerKey: "olympique-lyonnais#9", name: "Prénom Nom", position: "ST", overall: 82, atClub: true, age: 27 }],
  transfers: [],
  clubNames: new Map([["rival", "Un club réel"]]),
};

/** Width and height of a PNG, from its IHDR chunk; throws when the bytes are not a PNG. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A test that draws a card: the first drawing loads the fonts and the image engine, more than 5 s on a busy machine. */
const DRAWING_TIMEOUT_MS = 15_000;

async function render(data: CareerCardData, format: CardFormat, locale: Locale = "fr", frame: string | null = null): Promise<Buffer> {
  const response = await careerCardResponse(data, LYON, format, testTranslator(locale, "careerCard"), locale, {
    frame: frameStyleOf(frame),
    title: frame === null ? null : "Champion",
  });
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("private, max-age=0");
  return Buffer.from(await response.arrayBuffer());
}

describe("careerCardData", () => {
  it("shows the trophies won, two records by their figures, the first legend and the objectives", () => {
    const data = careerCardData(careerHistoryView(COMPLETED, LIVE));

    expect(data).toEqual({
      seasons: 3,
      firstYear: 2026,
      lastYear: 2028,
      path: "D2 → D1",
      trophies: [
        { kind: "championD1", count: 1 },
        { kind: "cup", count: 1 },
        { kind: "eu1", count: 1 },
        { kind: "promotion", count: 1 },
      ],
      coachTitles: [],
      biggestWin: "7-0",
      unbeaten: 2,
      player: { title: "legend", playerKey: "olympique-lyonnais#9", name: "Prénom Nom", age: 27, matches: 120, goals: 77 },
      objectives: { met: 6, total: 9 },
    });
  });

  it("names no opponent, and features the top scorer before any legend", () => {
    const young = careerCardData(careerHistoryView({ ...COMPLETED, lines: [line("olympique-lyonnais#9", 2026, 10, 4)] }, LIVE));
    expect(young.player).toMatchObject({ title: "topScorer", goals: 4 });
    expect(JSON.stringify(young)).not.toContain("Un club réel");
  });

  it("counts the summer tournaments won as a national coach, those that ended a completed season only", () => {
    // The career's last completed season is 2028-29, which the tournament of 2029 ended.
    const titles: CoachHistory["titles"] = [
      { tournament: "int.world", year: 2028, code: "POR" },
      { tournament: "int.world", year: 2029, code: "POR" },
      // Won in June of the season in progress (2029-30): not yet the career its card shows.
      { tournament: "int.eu", year: 2030, code: "POR" },
    ];
    const data = careerCardData(careerHistoryView(COMPLETED, LIVE), { titles });
    expect(data.coachTitles).toEqual([{ tournament: "int.world", count: 2 }]);
    // Never among the club's own trophies.
    expect(data.trophies.map(({ kind }) => kind)).toEqual(["championD1", "cup", "eu1", "promotion"]);
    expect(careerCardData(careerHistoryView(COMPLETED, LIVE), null).coachTitles).toEqual([]);
  });
});

// Rendering only: the images themselves are checked by eye.
describe("careerCardResponse", () => {
  const data = careerCardData(careerHistoryView(COMPLETED, LIVE));
  const bare: CareerCardData = { ...data, path: null, trophies: [], coachTitles: [], biggestWin: null, unbeaten: null, player: null, objectives: null };
  // Every trophy of the room and both summer tournaments: more than a list holds, side by side.
  const crowded: CareerCardData = {
    ...data,
    path: "D2 → D1 → D2 → D1",
    trophies: [
      { kind: "championD1", count: 3 },
      { kind: "championD2", count: 1 },
      { kind: "cup", count: 2 },
      { kind: "eu1", count: 1 },
      { kind: "eu2", count: 2 },
      { kind: "promotion", count: 2 },
    ],
    coachTitles: [
      { tournament: "int.eu", count: 1 },
      { tournament: "int.world", count: 2 },
    ],
  };

  it("draws a career's card in both formats and languages, and a bare one", async () => {
    for (const locale of ["fr", "en"] as const) {
      for (const format of ["landscape", "square"] as const) {
        expect(pngSize(await render(data, format, locale))).toEqual(CARD_SIZES[format]);
        expect(pngSize(await render(bare, format, locale))).toEqual(CARD_SIZES[format]);
      }
    }
  }, DRAWING_TIMEOUT_MS * 2);

  it("draws every trophy and the titles won as a national coach side by side, in both formats and languages", async () => {
    for (const locale of ["fr", "en"] as const) {
      for (const format of ["landscape", "square"] as const) {
        expect(pngSize(await render(crowded, format, locale, "frame-gold-laurels"))).toEqual(CARD_SIZES[format]);
      }
    }
    const coachOnly: CareerCardData = { ...bare, coachTitles: [{ tournament: "int.world", count: 1 }] };
    expect(pngSize(await render(coachOnly, "landscape"))).toEqual(CARD_SIZES.landscape);
  }, DRAWING_TIMEOUT_MS * 2);

  it("draws it in a frame of the collection, with the manager's title", async () => {
    for (const format of ["landscape", "square"] as const) {
      expect(pngSize(await render(data, format, "fr", "frame-compass-rose"))).toEqual(CARD_SIZES[format]);
    }
  }, DRAWING_TIMEOUT_MS);

  it("names no real club, brand or licensed competition in its words, in either language", () => {
    const clubs = realClubNames();
    for (const locale of ["fr", "en"] as const) {
      const { careerCard, seasonCard } = MESSAGES[locale];
      expect(forbiddenNamesIn(JSON.stringify({ careerCard, seasonCard }), clubs)).toEqual([]);
    }
  });
});
