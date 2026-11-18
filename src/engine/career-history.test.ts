import { describe, expect, it } from "vitest";
import {
  attributedLines,
  bestYouth,
  biggestTransfer,
  biggestWin,
  careerHistory,
  LEGEND_POINTS,
  LEGEND_THRESHOLD,
  legendLines,
  legends,
  mostCappedRecord,
  playerTotals,
  pointsRecords,
  recordsSetIn,
  topScorerRecord,
  trophyRoom,
  unbeatenRuns,
  youthOrigin,
  type CareerHistoryInput,
  type HistoryContext,
  type HistoryLine,
  type HistoryMatch,
  type HistorySeason,
  type StatsRow,
} from "./career-history";

const MANAGED = "club-managed";
const at = (year: number, month: number, day: number): number => Date.UTC(year, month - 1, day);

function season(startYear: number, overrides: Partial<HistorySeason> = {}): HistorySeason {
  return {
    seasonId: `s${startYear}`,
    startYear,
    competitionCode: "fr.1",
    tier: 1,
    rank: 5,
    points: 60,
    played: 34,
    won: 17,
    drawn: 9,
    lost: 8,
    goalsFor: 50,
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
    objectives: null,
    budget: null,
    highlights: null,
    ...overrides,
  };
}

function match(date: number, goalsFor: number, goalsAgainst: number, overrides: Partial<HistoryMatch> = {}): HistoryMatch {
  return {
    date,
    startYear: new Date(date).getUTCMonth() >= 6 ? new Date(date).getUTCFullYear() : new Date(date).getUTCFullYear() - 1,
    kind: "LEAGUE",
    competitionCode: "fr.1",
    round: 1,
    opponentClubSaveId: "opponent",
    home: true,
    goalsFor,
    goalsAgainst,
    penalties: false,
    ...overrides,
  };
}

const line = (playerKey: string, startYear: number, appearances: number, goals = 0, assists = 0): HistoryLine => ({
  playerKey,
  startYear,
  kind: "LEAGUE",
  appearances,
  goals,
  assists,
});

const WORLD_2_D1: HistoryContext = { currentTier: 1, secondDivisions: true, cups: true, europe: true };

describe("attributedLines", () => {
  const row = (playerKey: string, kind: StatsRow["kind"] = "LEAGUE"): StatsRow => ({ playerKey, startYear: 2026, kind, appearances: 20, goals: 3, assists: 1 });
  const move = (month: number, day: number, fromClubId: string | null, toClubId: string | null) => ({
    date: new Date(at(month >= 7 ? 2026 : 2027, month, day)),
    fromClubId,
    toClubId,
  });
  const leagueClubIds = new Map([[2026, new Set([MANAGED, "rival-same-league"])]]);
  const endOf = (startYear: number) => new Date(at(startYear + 1, 6, 30));

  it("gives the club every cup and European line, and a league line of a player who ended the season there", () => {
    const timelines = new Map([
      ["stayed", { currentClubId: MANAGED, moves: [] }],
      ["arrived-in-winter", { currentClubId: MANAGED, moves: [move(1, 10, "abroad", MANAGED)] }],
    ]);
    const kept = attributedLines({
      managedClubId: MANAGED,
      rows: [row("stayed"), row("arrived-in-winter"), row("cup-only", "CUP"), row("europe-only", "EUROPE")],
      timelines,
      leagueClubIds,
      endOf,
    });

    expect(kept.map((kept) => kept.playerKey)).toEqual(["stayed", "arrived-in-winter", "cup-only", "europe-only"]);
  });

  it("keeps the league line of a player sold abroad in winter, and leaves that of one sold within the league to his new club", () => {
    const timelines = new Map([
      ["sold-abroad", { currentClubId: "abroad", moves: [move(1, 10, MANAGED, "abroad")] }],
      ["sold-to-rival", { currentClubId: "rival-same-league", moves: [move(1, 10, MANAGED, "rival-same-league")] }],
      ["released", { currentClubId: null, moves: [move(1, 10, MANAGED, null)] }],
      // Sold in the summer after the season: he ended it at the club.
      ["sold-after", { currentClubId: "rival-same-league", moves: [{ date: new Date(at(2027, 7, 15)), fromClubId: MANAGED, toClubId: "rival-same-league" }] }],
      ["never-there", { currentClubId: "rival-same-league", moves: [] }],
    ]);
    const kept = attributedLines({
      managedClubId: MANAGED,
      rows: ["sold-abroad", "sold-to-rival", "released", "sold-after", "never-there", "no-timeline"].map((key) => row(key)),
      timelines,
      leagueClubIds,
      endOf,
    });

    expect(kept.map((kept) => kept.playerKey)).toEqual(["sold-abroad", "released", "sold-after"]);
  });
});

describe("trophyRoom", () => {
  it("shows each trophy won with its seasons, the most recent first, and what is still to conquer", () => {
    const room = trophyRoom(
      [
        season(2026, { tier: 2, champion: true, promoted: true, competitionCode: "fr.2" }),
        season(2027, { cupRound: 6, cupWinner: true }),
        season(2028, { champion: true, europeCode: "eu.2", europeStage: 5 }),
        season(2029, { champion: true, europeCode: "eu.1", europeStage: 5, europeWinner: true, cupRound: 6 }),
      ],
      WORLD_2_D1,
    );

    expect(room.tiles).toEqual([
      { kind: "championD1", seasons: [2029, 2028], toConquer: false },
      { kind: "championD2", seasons: [2026], toConquer: false },
      { kind: "cup", seasons: [2027], toConquer: false },
      { kind: "eu1", seasons: [2029], toConquer: false },
      { kind: "eu2", seasons: [], toConquer: true },
      { kind: "promotion", seasons: [2026], toConquer: false },
    ]);
    // The Pennant Cup's final lost in 2028, the cup's in 2029.
    expect(room.lostFinals).toBe(2);
  });

  it("offers a second division's title and a promotion only from the second division, and nothing of a world without them", () => {
    const fromD2 = trophyRoom([], { ...WORLD_2_D1, currentTier: 2 });
    expect(fromD2.tiles.map((tile) => tile.kind)).toEqual(["championD1", "championD2", "cup", "eu1", "eu2", "promotion"]);
    expect(fromD2.tiles.every((tile) => tile.toConquer)).toBe(true);
    expect(trophyRoom([], WORLD_2_D1).tiles.map((tile) => tile.kind)).toEqual(["championD1", "cup", "eu1", "eu2"]);
    const worldOne = { currentTier: 1 as const, secondDivisions: false, cups: false, europe: false };
    expect(trophyRoom([season(2026, { champion: true })], worldOne).tiles).toEqual([{ kind: "championD1", seasons: [2026], toConquer: false }]);
    // A challenge career: no Europe.
    expect(trophyRoom([], { ...WORLD_2_D1, europe: false }).tiles.map((tile) => tile.kind)).toEqual(["championD1", "cup"]);
  });
});

describe("records", () => {
  it("runs unbeaten across seasons, a shoot-out lost counting as a draw, and keeps the earliest of two equal runs", () => {
    const matches = [
      match(at(2026, 9, 1), 1, 0),
      match(at(2026, 9, 8), 0, 2), // lost: a run of 1 ends
      match(at(2027, 5, 1), 2, 2),
      match(at(2027, 5, 8), 1, 1, { kind: "CUP", penalties: true }), // lost on penalties: still unbeaten
      match(at(2027, 8, 20), 3, 0),
      match(at(2027, 8, 27), 0, 1), // lost: a run of 3 ends
      match(at(2027, 9, 3), 1, 0),
      match(at(2027, 9, 10), 2, 0),
    ];
    const { record, current } = unbeatenRuns(matches);

    expect(record).toEqual({ length: 3, from: at(2027, 5, 1), to: at(2027, 8, 20), current: false });
    expect(current).toBe(2);
    // A run still going that beats the record is the record, current.
    const longer = [...matches, match(at(2027, 9, 17), 0, 0)];
    expect(unbeatenRuns(longer).record).toEqual({ length: 3, from: at(2027, 5, 1), to: at(2027, 8, 20), current: false });
    expect(unbeatenRuns([...longer, match(at(2027, 9, 24), 1, 0)]).record).toEqual({
      length: 4,
      from: at(2027, 9, 3),
      to: at(2027, 9, 24),
      current: true,
    });
    expect(unbeatenRuns([])).toEqual({ record: null, current: 0 });
  });

  it("takes the widest win, then the most goals scored, then the earliest", () => {
    const wins = [match(at(2026, 9, 1), 4, 0), match(at(2026, 10, 1), 5, 1), match(at(2026, 11, 1), 4, 0), match(at(2026, 12, 1), 2, 2)];
    expect(biggestWin(wins)?.date).toBe(at(2026, 10, 1));
    expect(biggestWin([match(at(2026, 9, 1), 0, 0), match(at(2026, 9, 2), 1, 1, { penalties: true })])).toBeNull();
  });

  it("keeps a points record for each division, fewer matches first on a tie", () => {
    const records = pointsRecords([
      season(2026, { tier: 2, points: 91, played: 46 }),
      season(2027, { points: 80, played: 38 }),
      season(2028, { points: 80, played: 34 }),
    ]);
    expect(records.map((record) => [record.tier, record.startYear, record.points])).toEqual([
      [1, 2028, 80],
      [2, 2026, 91],
    ]);
  });

  it("names the top scorer and the most capped player, and a player at the club close behind", () => {
    const totals = [
      ...playerTotals([line("legend", 2026, 40, 30), line("legend", 2027, 38, 20), line("young", 2027, 30, 46), line("old", 2026, 90, 2)]).values(),
    ];
    const atClub = new Set(["young", "old"]);

    expect(topScorerRecord(totals, atClub)).toEqual({ playerKey: "legend", value: 50, chaser: { playerKey: "young", gap: 4 } });
    expect(mostCappedRecord(totals, atClub)).toEqual({ playerKey: "old", value: 90, chaser: null });
    expect(topScorerRecord([], atClub)).toBeNull();
  });

  it("takes the biggest fee each way, never a free transfer", () => {
    const transfers = [
      { playerKey: "a", fee: 10_000_000, date: 1, incoming: true, otherClubId: "x" },
      { playerKey: "b", fee: 25_000_000, date: 2, incoming: true, otherClubId: "y" },
      { playerKey: "c", fee: 0, date: 3, incoming: false, otherClubId: null },
    ];
    expect(biggestTransfer(transfers, true)?.playerKey).toBe("b");
    expect(biggestTransfer(transfers, false)).toBeNull();
  });
});

describe("legends", () => {
  it("counts matches, goals, assists, the season's best player and the trophies of his seasons of 10 matches or more", () => {
    const seasons = [
      season(2026, { champion: true, bestPlayer: { playerKey: "star", name: "Star", position: "ST", rating: 7.9, goals: 20, assists: 5, age: 24 } }),
      season(2027, { cupWinner: true, cupRound: 6 }),
    ];
    const ranking = legendLines([line("star", 2026, 30, 20, 5), line("star", 2027, 9, 4, 0), line("bench", 2027, 12, 0, 0)], seasons);

    // 39 matches, 24 goals, 5 assists, one election, the 2026 title (the 2027 cup with 9 matches only).
    expect(ranking[0]).toEqual({
      playerKey: "star",
      index: 39 + 24 * LEGEND_POINTS.goal + 5 + LEGEND_POINTS.bestPlayer + LEGEND_POINTS.championD1,
      matches: 39,
      goals: 24,
      assists: 5,
      firstYear: 2026,
      lastYear: 2027,
      titles: 1,
      awards: 1,
    });
    expect(ranking[1]).toMatchObject({ playerKey: "bench", index: 12 + LEGEND_POINTS.cup, titles: 1 });
  });

  it("makes legends from the threshold, and puts the best players still at the club below it on their way", () => {
    const ranking = legendLines(
      [line("gone", 2026, LEGEND_THRESHOLD), line("here", 2026, LEGEND_THRESHOLD - 1), line("here-too", 2026, 20), line("left", 2026, 100)],
      [],
    );
    const { legends: shown, onTheWay } = legends(ranking, new Set(["here", "here-too"]));
    expect(shown.map((legend) => legend.playerKey)).toEqual(["gone"]);
    expect(onTheWay.map((player) => player.playerKey)).toEqual(["here", "here-too"]);
  });

  it("knows the club's academy and the shop's young players, and picks the most successful", () => {
    expect(youthOrigin("youth:2027:club-a:3", "club-a")).toEqual({ shop: false, year: 2027 });
    expect(youthOrigin("youth:2027:club-b:3", "club-a")).toBeNull();
    expect(youthOrigin("shop-youth:2", "club-a")).toEqual({ shop: true, year: null });
    expect(youthOrigin("club-a#5", "club-a")).toBeNull();
    const players = [
      { playerKey: "youth:2027:club-a:1", name: "A", position: "CM" as const, overall: 70, atClub: true },
      { playerKey: "shop-youth:1", name: "B", position: "ST" as const, overall: 75, atClub: true },
      { playerKey: "youth:2028:club-a:2", name: "C", position: "CB" as const, overall: 80, atClub: true },
    ];
    expect(bestYouth(players, new Map([["youth:2027:club-a:1", 90], ["shop-youth:1", 90]]), "club-a")).toEqual({
      playerKey: "shop-youth:1",
      index: 90,
      shop: true,
      year: null,
    });
    expect(bestYouth([], new Map(), "club-a")).toBeNull();
  });
});

describe("careerHistory", () => {
  const input: CareerHistoryInput = {
    managedSlug: "club-a",
    context: WORLD_2_D1,
    seasons: [
      season(2027, {
        points: 80,
        objectives: { met: 2, total: 3 },
        highlights: {
          version: 1,
          budget: 9_000_000,
          scorers: [{ playerKey: "star", name: "Star Exact", goals: 21, assists: 3 }],
          hatTricks: [{ playerKey: "star", name: "Star Exact", goals: 3, date: "2027-10-01", competitionCode: "fr.1", round: 8, opponentClubSaveId: "x" }],
          squad: [],
        },
      }),
      season(2026, { tier: 2, competitionCode: "fr.2", promoted: true, points: 70, objectives: { met: 1, total: 2 } }),
    ],
    current: { startYear: 2028, competitionCode: "fr.1", tier: 1, rank: 3, points: 20, played: 10, cup: null, europe: null },
    matches: [match(at(2026, 9, 1), 6, 0, { startYear: 2026 }), match(at(2027, 9, 1), 2, 0, { startYear: 2027 })],
    lines: [line("star", 2026, 30, 12), line("star", 2027, 34, 20), line("mate", 2026, 25, 14)],
    players: [
      { playerKey: "star", name: "Star", position: "ST", overall: 80, atClub: true },
      { playerKey: "mate", name: "Mate", position: "ST", overall: 70, atClub: false },
    ],
    transfers: [],
  };

  it("sums the career up: its seasons, its divisions' path, its titles, promotions and objectives", () => {
    const history = careerHistory(input);
    expect(history.summary).toEqual({
      seasons: 2,
      firstYear: 2026,
      lastYear: 2027,
      path: [2, 1],
      titles: 0,
      promotions: 1,
      objectives: { met: 3, total: 5 },
    });
    expect(history.seasons.map((line) => line.startYear)).toEqual([2027, 2026]);
    // The exact scorer of the highlights, else the best of the season's lines.
    expect(history.seasons[0]).toMatchObject({ topScorer: { playerKey: "star", name: "Star Exact", goals: 21 }, hatTricks: 1, endBudget: 9_000_000 });
    expect(history.seasons[1]).toMatchObject({ topScorer: { playerKey: "mate", name: "Mate", goals: 14 }, hatTricks: 0, endBudget: null });
    expect(history.records.biggestWin?.goalsFor).toBe(6);
  });

  it("tells the bilan of a season the records it set, never in the first season", () => {
    const history = careerHistory(input);
    expect(recordsSetIn(history, 2026)).toEqual([]);
    // 2027: the first season in the first division, its points are no record yet; the unbeaten run of two ends in it.
    expect(recordsSetIn(history, 2027)).toEqual([{ kind: "unbeaten", length: 2 }]);
    const later = careerHistory({ ...input, seasons: [...input.seasons, season(2028, { points: 85 })], matches: [...input.matches, match(at(2028, 9, 1), 8, 0, { startYear: 2028 })] });
    expect(recordsSetIn(later, 2028)).toEqual([
      { kind: "points", tier: 1, points: 85 },
      { kind: "biggestWin", goalsFor: 8, goalsAgainst: 0 },
      { kind: "unbeaten", length: 3 },
    ]);
  });
});
