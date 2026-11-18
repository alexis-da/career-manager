// The managed club's career history (chantier « historique », docs/design/historique.md): its trophy room, its seasons,
// its records and its legends, from what the save keeps: its season results and their highlights, its matches, its
// players' season lines, its transfers. Pure: src/db/career-history.ts reads them. The managed club never changes in a
// save: its career is this club's story since the save began.

import { CUP_ROUNDS } from "./balance";
import { EUROPE_STAGES, type EuropeCode } from "./europe";
import type { Position } from "./positions";
import { clubAtDate, type ClubMove } from "./season-result";
import type { SeasonHighlights } from "./season-highlights";
import { seasonEndDate, seasonStartDate } from "./world";

/** The legend index (cahier § 4): what each thing counts. */
export const LEGEND_POINTS = {
  match: 1,
  goal: 2,
  assist: 1,
  bestPlayer: 15, // elected the season's best player (SeasonResult.bestPlayerKey)
  championD1: 20,
  eu1: 20,
  eu2: 10,
  cup: 10,
  championD2: 10,
  promotion: 10,
} as const;
/** A legend: this index or more, some three seasons as a starter, two for a scorer. */
export const LEGEND_THRESHOLD = 150;
export const LEGENDS_SHOWN = 5;
export const ON_THE_WAY_SHOWN = 3;
/** Matches for the club a season that make its trophies his. */
export const TROPHY_SEASON_MIN_APPEARANCES = 10;
/** A player still at the club this close to a player record says so. */
export const RECORD_CHASE_GOALS = 5;
export const RECORD_CHASE_MATCHES = 10;

export type HistoryTier = 1 | 2;
export type HistoryKind = "LEAGUE" | "CUP" | "EUROPE";

/** A completed season of the managed club: its result (SeasonResult) and what goes with it. */
export type HistorySeason = {
  seasonId: string; // its league season
  startYear: number;
  competitionCode: string; // its division
  tier: HistoryTier;
  rank: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  champion: boolean;
  promoted: boolean;
  relegated: boolean;
  cupRound: number | null; // the last cup round played; null without a cup
  cupWinner: boolean;
  europeCode: EuropeCode | null;
  europeStage: number | null; // 1 league phase … 5 final, its winner's too
  europeWinner: boolean;
  // The season's best player (SeasonResult.bestPlayer*), his age at the season's end for his face.
  bestPlayer: { playerKey: string; name: string; position: Position; rating: number; goals: number; assists: number; age: number } | null;
  objectives: { met: number; total: number } | null; // closed objectives; null for a season without
  budget: number | null; // the board's for it (SeasonBudget); null before them
  highlights: SeasonHighlights | null; // null before them, and for a season rebuilt
};

/** A match of the managed club, played, any competition, any season. */
export type HistoryMatch = {
  date: number; // epoch milliseconds (a cache keeps it as it is)
  startYear: number;
  kind: HistoryKind;
  competitionCode: string;
  round: number;
  opponentClubSaveId: string;
  home: boolean;
  goalsFor: number; // after extra time, without the shoot-out
  goalsAgainst: number;
  penalties: boolean; // decided by a shoot-out
};

/** A player's matches for the club in one competition of one season (attributedLines). */
export type HistoryLine = { playerKey: string; startYear: number; kind: HistoryKind; appearances: number; goals: number; assists: number };

/** A player who was at the club. */
export type HistoryPlayer = { playerKey: string; name: string; position: Position; overall: number; atClub: boolean };

/** A transfer with a fee, to or from the managed club. */
export type HistoryTransfer = { playerKey: string; fee: number; date: number; incoming: boolean; otherClubId: string | null };

/** What the club can still win in its world: the trophy room shows these unwon, « to conquer ». */
export type HistoryContext = { currentTier: HistoryTier; secondDivisions: boolean; cups: boolean; europe: boolean };

/** The season in progress, at the top of the seasons: no trophy, no objective closed. */
export type CurrentSeason = {
  startYear: number;
  competitionCode: string;
  tier: HistoryTier;
  rank: number | null; // null before its first league match
  points: number;
  played: number;
  cup: { round: number; out: boolean; won: boolean } | null;
  europe: { code: EuropeCode; stage: number; out: boolean; won: boolean } | null;
};

// ------------------------------------------------------------------ Attribution of the statistics

/** A line of statistics, by competition and year, as the save keeps it: no club (PlayerSeasonStats). */
export type StatsRow = { playerKey: string; startYear: number; kind: HistoryKind; appearances: number; goals: number; assists: number };

/** A player's club now (a Club.id) and every move of his (Transfer: dates and Club.ids). */
export type PlayerTimeline = { currentClubId: string | null; moves: readonly ClubMove[] };

const movesAfter = (moves: readonly ClubMove[], date: Date): ClubMove[] => moves.filter((move) => move.date.getTime() > date.getTime());

/**
 * The managed club's lines among some statistics (cahier § 7.2): a cup or European line is always the club's, only its
 * players having statistics there; a league line is the club's when the player ended the season (or is now, for the
 * season in progress, `endOf`) at the club, or when he was at the club during it and ended it at a club outside its
 * league, or at none: a player who moved within the league during the season has one line for both clubs, which goes
 * to the club he ended it at (as the season's result does). A player without a timeline was never at the club.
 */
export function attributedLines(input: {
  managedClubId: string;
  rows: readonly StatsRow[];
  timelines: ReadonlyMap<string, PlayerTimeline>;
  leagueClubIds: ReadonlyMap<number, ReadonlySet<string>>; // the clubs of the club's league, by year (Club.ids)
  endOf: (startYear: number) => Date;
}): HistoryLine[] {
  const { managedClubId, timelines } = input;
  return input.rows.filter((row) => {
    if (row.kind !== "LEAGUE") {
      return true;
    }
    const timeline = timelines.get(row.playerKey);
    if (timeline === undefined) {
      return false;
    }
    const end = input.endOf(row.startYear);
    const endClub = clubAtDate(timeline.currentClubId, movesAfter(timeline.moves, end));
    if (endClub === managedClubId) {
      return true;
    }
    const start = seasonStartDate(row.startYear);
    const during = timeline.moves.filter((move) => move.date.getTime() > start.getTime() && move.date.getTime() <= end.getTime());
    const wasThere =
      clubAtDate(timeline.currentClubId, movesAfter(timeline.moves, start)) === managedClubId ||
      during.some((move) => move.fromClubId === managedClubId || move.toClubId === managedClubId);
    return wasThere && (endClub === null || !(input.leagueClubIds.get(row.startYear)?.has(endClub) ?? false));
  });
}

// ------------------------------------------------------------------ Trophy room

export const TROPHY_KINDS = ["championD1", "championD2", "cup", "eu1", "eu2", "promotion"] as const;
export type TrophyKind = (typeof TROPHY_KINDS)[number];

/** A trophy's seasons (start years, the most recent first), and whether it is still to conquer. */
export type TrophyTile = { kind: TrophyKind; seasons: number[]; toConquer: boolean };
export type TrophyRoom = { tiles: TrophyTile[]; lostFinals: number };

function wonIn(kind: TrophyKind, season: HistorySeason): boolean {
  switch (kind) {
    case "championD1":
      return season.champion && season.tier === 1;
    case "championD2":
      return season.champion && season.tier === 2;
    case "cup":
      return season.cupWinner;
    case "eu1":
      return season.europeWinner && season.europeCode === "eu.1";
    case "eu2":
      return season.europeWinner && season.europeCode === "eu.2";
    case "promotion":
      return season.promoted;
  }
}

function winnable(kind: TrophyKind, context: HistoryContext): boolean {
  switch (kind) {
    case "championD1":
      return true;
    case "championD2":
    case "promotion":
      return context.secondDivisions && context.currentTier === 2;
    case "cup":
      return context.cups;
    case "eu1":
    case "eu2":
      return context.europe;
  }
}

/**
 * The trophy room: a tile for each trophy won, with its seasons; one unwon stays, « to conquer », while the club can
 * still win it (a second division's title and a promotion only from the second division). Lost finals counted apart.
 */
export function trophyRoom(seasons: readonly HistorySeason[], context: HistoryContext): TrophyRoom {
  const recentFirst = [...seasons].sort((a, b) => b.startYear - a.startYear);
  const tiles = TROPHY_KINDS.flatMap((kind) => {
    const won = recentFirst.filter((season) => wonIn(kind, season)).map((season) => season.startYear);
    return won.length > 0 || winnable(kind, context) ? [{ kind, seasons: won, toConquer: won.length === 0 }] : [];
  });
  const lostFinals = seasons.filter(
    (season) =>
      (season.cupRound === CUP_ROUNDS && !season.cupWinner) || (season.europeStage === EUROPE_STAGES.FINAL && !season.europeWinner),
  ).length;
  return { tiles, lostFinals };
}

/** The titles among the trophies (a promotion is not one). */
export const isTitle = (kind: TrophyKind): boolean => kind !== "promotion";

// ------------------------------------------------------------------ Records

export type UnbeatenRun = { length: number; from: number; to: number; current: boolean };

const byDate = (a: HistoryMatch, b: HistoryMatch): number => a.date - b.date || a.round - b.round;

/**
 * The longest run of matches without a defeat, from one season to the next, every competition; a match lost on
 * penalties is a draw (its score). Ties: the earliest. `current`: the run still going after the last match played (0
 * after a defeat); the record is it when it is the longest.
 */
export function unbeatenRuns(matches: readonly HistoryMatch[]): { record: UnbeatenRun | null; current: number } {
  let record: UnbeatenRun | null = null;
  let run: HistoryMatch[] = [];
  const close = (current: boolean) => {
    if (run.length > 0 && (record === null || run.length > record.length)) {
      record = { length: run.length, from: run[0].date, to: run[run.length - 1].date, current };
    }
  };
  for (const match of [...matches].sort(byDate)) {
    if (match.goalsFor < match.goalsAgainst) {
      close(false);
      run = [];
    } else {
      run.push(match);
    }
  }
  close(true);
  return { record, current: run.length };
}

/** The widest win, the score after extra time; ties: the most goals scored, then the earliest. null without a win. */
export function biggestWin(matches: readonly HistoryMatch[]): HistoryMatch | null {
  let best: HistoryMatch | null = null;
  for (const match of [...matches].sort(byDate)) {
    const margin = match.goalsFor - match.goalsAgainst;
    if (margin <= 0) {
      continue;
    }
    const bestMargin = best === null ? 0 : best.goalsFor - best.goalsAgainst;
    if (best === null || margin > bestMargin || (margin === bestMargin && match.goalsFor > best.goalsFor)) {
      best = match;
    }
  }
  return best;
}

export type PointsRecord = { tier: HistoryTier; seasonId: string; startYear: number; points: number; played: number; rank: number };

/** The best points total of a league season, one per division (34 to 46 matches); ties: fewer matches, the earliest. */
export function pointsRecords(seasons: readonly HistorySeason[]): PointsRecord[] {
  return ([1, 2] as const).flatMap((tier) => {
    const best = [...seasons]
      .filter((season) => season.tier === tier)
      .sort((a, b) => b.points - a.points || a.played - b.played || a.startYear - b.startYear)[0];
    return best === undefined
      ? []
      : [{ tier, seasonId: best.seasonId, startYear: best.startYear, points: best.points, played: best.played, rank: best.rank }];
  });
}

/** A player's matches, goals and assists for the club, and the years he played for it. */
export type PlayerTotals = { playerKey: string; matches: number; goals: number; assists: number; years: number[] };

export function playerTotals(lines: readonly HistoryLine[]): Map<string, PlayerTotals> {
  const totals = new Map<string, PlayerTotals>();
  for (const line of lines) {
    const total = totals.get(line.playerKey) ?? { playerKey: line.playerKey, matches: 0, goals: 0, assists: 0, years: [] };
    total.matches += line.appearances;
    total.goals += line.goals;
    total.assists += line.assists;
    if (line.appearances > 0 && !total.years.includes(line.startYear)) {
      total.years.push(line.startYear);
    }
    totals.set(line.playerKey, total);
  }
  for (const total of totals.values()) {
    total.years.sort((a, b) => a - b);
  }
  return totals;
}

/** A player record: its holder, and the closest player still at the club, when close enough. */
export type PlayerRecord = { playerKey: string; value: number; chaser: { playerKey: string; gap: number } | null };

const byKey = (a: { playerKey: string }, b: { playerKey: string }): number => (a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0);

function playerRecord(
  totals: readonly PlayerTotals[],
  atClub: ReadonlySet<string>,
  value: (total: PlayerTotals) => number,
  order: (a: PlayerTotals, b: PlayerTotals) => number,
  chaseWithin: number,
): PlayerRecord | null {
  const ranked = totals.filter((total) => value(total) > 0).sort((a, b) => value(b) - value(a) || order(a, b) || byKey(a, b));
  const holder = ranked[0];
  if (holder === undefined) {
    return null;
  }
  const chaser = ranked.find((total) => total !== holder && atClub.has(total.playerKey));
  const gap = chaser === undefined ? Infinity : value(holder) - value(chaser);
  return {
    playerKey: holder.playerKey,
    value: value(holder),
    chaser: chaser !== undefined && gap > 0 && gap <= chaseWithin ? { playerKey: chaser.playerKey, gap } : null,
  };
}

/** The club's top scorer of the career; ties: fewer matches. */
export const topScorerRecord = (totals: readonly PlayerTotals[], atClub: ReadonlySet<string>): PlayerRecord | null =>
  playerRecord(totals, atClub, (total) => total.goals, (a, b) => a.matches - b.matches, RECORD_CHASE_GOALS);

/** The player with the most matches for the club; ties: more goals. */
export const mostCappedRecord = (totals: readonly PlayerTotals[], atClub: ReadonlySet<string>): PlayerRecord | null =>
  playerRecord(totals, atClub, (total) => total.matches, (a, b) => b.goals - a.goals, RECORD_CHASE_MATCHES);

/** The biggest fee paid (incoming) or received (outgoing) by the club; ties: the earliest. */
export function biggestTransfer(transfers: readonly HistoryTransfer[], incoming: boolean): HistoryTransfer | null {
  return (
    [...transfers]
      .filter((transfer) => transfer.incoming === incoming && transfer.fee > 0)
      .sort((a, b) => b.fee - a.fee || a.date - b.date || byKey(a, b))[0] ?? null
  );
}

// ------------------------------------------------------------------ Legends

/** The trophies of a season, as the legend index counts them. */
function seasonTrophyPoints(season: HistorySeason): { points: number; titles: number } {
  let points = 0;
  let titles = 0;
  for (const kind of TROPHY_KINDS) {
    if (wonIn(kind, season)) {
      points += LEGEND_POINTS[kind];
      titles += isTitle(kind) ? 1 : 0;
    }
  }
  return { points, titles };
}

export type LegendLine = {
  playerKey: string;
  index: number;
  matches: number;
  goals: number;
  assists: number;
  firstYear: number;
  lastYear: number;
  titles: number; // won with him (TROPHY_SEASON_MIN_APPEARANCES matches that season)
  awards: number; // elected the season's best player
};

/**
 * Each player's legend index (cahier § 4): his matches, goals and assists for the club, his elections as the season's
 * best player, and the trophies of the seasons he played TROPHY_SEASON_MIN_APPEARANCES matches for the club.
 */
export function legendLines(lines: readonly HistoryLine[], seasons: readonly HistorySeason[]): LegendLine[] {
  const totals = playerTotals(lines);
  const matchesByYear = new Map<string, number>(); // `${playerKey}|${startYear}`
  for (const line of lines) {
    const key = `${line.playerKey}|${line.startYear}`;
    matchesByYear.set(key, (matchesByYear.get(key) ?? 0) + line.appearances);
  }
  return [...totals.values()]
    .filter((total) => total.matches > 0)
    .map((total) => {
      let trophyPoints = 0;
      let titles = 0;
      let awards = 0;
      for (const season of seasons) {
        if (season.bestPlayer?.playerKey === total.playerKey) {
          awards += 1;
        }
        if ((matchesByYear.get(`${total.playerKey}|${season.startYear}`) ?? 0) >= TROPHY_SEASON_MIN_APPEARANCES) {
          const won = seasonTrophyPoints(season);
          trophyPoints += won.points;
          titles += won.titles;
        }
      }
      return {
        playerKey: total.playerKey,
        index:
          total.matches * LEGEND_POINTS.match +
          total.goals * LEGEND_POINTS.goal +
          total.assists * LEGEND_POINTS.assist +
          awards * LEGEND_POINTS.bestPlayer +
          trophyPoints,
        matches: total.matches,
        goals: total.goals,
        assists: total.assists,
        firstYear: total.years[0],
        lastYear: total.years[total.years.length - 1],
        titles,
        awards,
      };
    })
    .sort((a, b) => b.index - a.index || b.matches - a.matches || byKey(a, b));
}

/** The legends (index LEGEND_THRESHOLD or more, the first LEGENDS_SHOWN) and the players on their way, still at the club. */
export function legends(lines: readonly LegendLine[], atClub: ReadonlySet<string>): { legends: LegendLine[]; onTheWay: LegendLine[] } {
  return {
    legends: lines.filter((line) => line.index >= LEGEND_THRESHOLD).slice(0, LEGENDS_SHOWN),
    onTheWay: lines.filter((line) => line.index < LEGEND_THRESHOLD && atClub.has(line.playerKey)).slice(0, ON_THE_WAY_SHOWN),
  };
}

/** Where a young player comes from: the club's academy (youth:{year}:{club}:{n}), the shop (shop-youth:{n}), or neither. */
export function youthOrigin(playerKey: string, managedSlug: string): { shop: boolean; year: number | null } | null {
  if (playerKey.startsWith("shop-youth:")) {
    return { shop: true, year: null };
  }
  const [prefix, year, slug] = playerKey.split(":");
  return prefix === "youth" && slug === managedSlug ? { shop: false, year: Number(year) } : null;
}

export type YouthRecord = { playerKey: string; index: number; shop: boolean; year: number | null };

/**
 * The most successful youth of the club: the highest legend index, then the best rating now; one who has played for the
 * club, a match at least (none before, as at the start of a career).
 */
export function bestYouth(
  players: readonly HistoryPlayer[],
  indexes: ReadonlyMap<string, number>,
  managedSlug: string,
): YouthRecord | null {
  const best = players
    .flatMap((player) => {
      const origin = youthOrigin(player.playerKey, managedSlug);
      const index = indexes.get(player.playerKey) ?? 0;
      return origin === null || index === 0 ? [] : [{ player, origin, index }];
    })
    .sort((a, b) => b.index - a.index || b.player.overall - a.player.overall || byKey(a.player, b.player))[0];
  return best === undefined ? null : { playerKey: best.player.playerKey, index: best.index, shop: best.origin.shop, year: best.origin.year };
}

// ------------------------------------------------------------------ The seasons

/** A completed season as the history shows it: its result, its top scorer, its hat-tricks, its budget at the end. */
export type HistorySeasonLine = HistorySeason & {
  topScorer: { playerKey: string; name: string; goals: number } | null;
  hatTricks: number; // null-safe: 0 without highlights
  endBudget: number | null; // from its highlights
};

function seasonLine(season: HistorySeason, lines: readonly HistoryLine[], names: ReadonlyMap<string, string>): HistorySeasonLine {
  const exact = season.highlights?.scorers[0];
  let topScorer: HistorySeasonLine["topScorer"] = exact === undefined ? null : { playerKey: exact.playerKey, name: exact.name, goals: exact.goals };
  if (season.highlights === null) {
    // Before the highlights: from the season's lines for the club, every competition.
    const ofYear = playerTotals(lines.filter((line) => line.startYear === season.startYear));
    const best = [...ofYear.values()]
      .filter((total) => total.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.matches - b.matches || byKey(a, b))[0];
    topScorer = best === undefined ? null : { playerKey: best.playerKey, name: names.get(best.playerKey) ?? best.playerKey, goals: best.goals };
  }
  return { ...season, topScorer, hatTricks: season.highlights?.hatTricks.length ?? 0, endBudget: season.highlights?.budget ?? null };
}

// ------------------------------------------------------------------ The whole history

export type CareerSummary = {
  seasons: number; // completed
  firstYear: number | null;
  lastYear: number | null;
  path: HistoryTier[]; // its divisions, oldest first, the current one included, each change once
  titles: number;
  promotions: number;
  objectives: { met: number; total: number } | null; // over the seasons that had some
};

export type CareerRecords = {
  biggestWin: HistoryMatch | null;
  unbeaten: { record: UnbeatenRun | null; current: number };
  points: PointsRecord[];
  topScorer: PlayerRecord | null;
  mostCapped: PlayerRecord | null;
  biggestIn: HistoryTransfer | null;
  biggestOut: HistoryTransfer | null;
  bestYouth: YouthRecord | null;
};

export type CareerHistory = {
  summary: CareerSummary;
  trophyRoom: TrophyRoom;
  current: CurrentSeason | null;
  seasons: HistorySeasonLine[]; // the most recent first
  records: CareerRecords;
  legends: LegendLine[];
  onTheWay: LegendLine[];
  totals: Map<string, PlayerTotals>;
};

export type CareerHistoryInput = {
  managedSlug: string;
  context: HistoryContext;
  seasons: readonly HistorySeason[]; // completed
  current: CurrentSeason | null;
  matches: readonly HistoryMatch[]; // completed seasons and the one in progress
  lines: readonly HistoryLine[]; // the club's, every season
  players: readonly HistoryPlayer[]; // every player of the lines, the transfers and the highlights
  transfers: readonly HistoryTransfer[];
};

export function careerHistory(input: CareerHistoryInput): CareerHistory {
  const seasons = [...input.seasons].sort((a, b) => a.startYear - b.startYear);
  const room = trophyRoom(seasons, input.context);
  const atClub = new Set(input.players.filter((player) => player.atClub).map((player) => player.playerKey));
  const names = new Map(input.players.map((player) => [player.playerKey, player.name]));
  const totals = playerTotals(input.lines);
  const legendRanking = legendLines(input.lines, seasons);
  const indexes = new Map(legendRanking.map((line) => [line.playerKey, line.index]));
  const path: HistoryTier[] = [];
  for (const tier of [...seasons.map((season) => season.tier), ...(input.current === null ? [] : [input.current.tier])]) {
    if (path[path.length - 1] !== tier) {
      path.push(tier);
    }
  }
  const withObjectives = seasons.flatMap((season) => (season.objectives === null ? [] : [season.objectives]));
  return {
    summary: {
      seasons: seasons.length,
      firstYear: seasons[0]?.startYear ?? null,
      lastYear: seasons[seasons.length - 1]?.startYear ?? null,
      path,
      titles: room.tiles.filter((tile) => isTitle(tile.kind)).reduce((sum, tile) => sum + tile.seasons.length, 0),
      promotions: room.tiles.find((tile) => tile.kind === "promotion")?.seasons.length ?? 0,
      objectives:
        withObjectives.length === 0
          ? null
          : withObjectives.reduce((sum, objectives) => ({ met: sum.met + objectives.met, total: sum.total + objectives.total }), { met: 0, total: 0 }),
    },
    trophyRoom: room,
    current: input.current,
    seasons: [...seasons].reverse().map((season) => seasonLine(season, input.lines, names)),
    records: {
      biggestWin: biggestWin(input.matches),
      unbeaten: unbeatenRuns(input.matches),
      points: pointsRecords(seasons),
      topScorer: topScorerRecord([...totals.values()], atClub),
      mostCapped: mostCappedRecord([...totals.values()], atClub),
      biggestIn: biggestTransfer(input.transfers, true),
      biggestOut: biggestTransfer(input.transfers, false),
      bestYouth: bestYouth(input.players, indexes, input.managedSlug),
    },
    ...legends(legendRanking, atClub),
    totals,
  };
}

/** A record a season set (its bilan says so), when an earlier season existed to beat. */
export type SeasonRecord =
  | { kind: "points"; tier: HistoryTier; points: number }
  | { kind: "biggestWin"; goalsFor: number; goalsAgainst: number }
  | { kind: "unbeaten"; length: number };

/** The team records a completed season set: its division's points, the widest win, the longest unbeaten run. */
export function recordsSetIn(history: CareerHistory, startYear: number): SeasonRecord[] {
  const earlier = history.seasons.filter((season) => season.startYear < startYear);
  if (earlier.length === 0) {
    return [];
  }
  const records: SeasonRecord[] = [];
  for (const record of history.records.points) {
    if (record.startYear === startYear && earlier.some((season) => season.tier === record.tier)) {
      records.push({ kind: "points", tier: record.tier, points: record.points });
    }
  }
  const win = history.records.biggestWin;
  if (win !== null && win.startYear === startYear) {
    records.push({ kind: "biggestWin", goalsFor: win.goalsFor, goalsAgainst: win.goalsAgainst });
  }
  const run = history.records.unbeaten.record;
  const end = seasonEndDate(startYear).getTime() + 86_400_000;
  if (run !== null && run.to >= seasonStartDate(startYear).getTime() && run.to < end) {
    records.push({ kind: "unbeaten", length: run.length });
  }
  return records;
}
