import type { TeamView } from "@/src/db/calendar";
import type { EuropeCompetitionView, EuropeTableRowView, EuropeTieView } from "@/src/db/europe-view";
import { europeDates, type EuropeCode } from "@/src/engine/europe";
import { WORLD_START_YEAR } from "@/src/engine/world";

// European views for the screen's tests, as src/db/europe-view.ts gives them: « Club 1 » first in every table.

export const DATES = europeDates(WORLD_START_YEAR);

const COUNTRIES = ["de", "en", "es", "fr", "it"];

/** A league phase table: « Club 1 » first, the managed club at its rank (none when null), every club `played` matches in. */
export function table(managedRank: number | null, size = 20, played = 6): EuropeTableRowView[] {
  return Array.from({ length: size }, (_, index) => {
    const rank = index + 1;
    return {
      clubSaveId: `c${rank}`,
      name: `Club ${rank}`,
      country: COUNTRIES[index % COUNTRIES.length],
      isManaged: rank === managedRank,
      rank,
      played,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: played === 0 ? 0 : 3 * (size - rank),
    };
  });
}

export const team = (row: EuropeTableRowView): TeamView => ({
  clubSaveId: row.clubSaveId,
  name: row.name,
  isManaged: row.isManaged,
  colors: { primary: "#000000", secondary: "#ffffff" },
});

/**
 * A match of a round between two clubs of a table, by rank, home first: not played without a result; a knockout match
 * won 1-0 by the club of `winner`'s rank; a league phase match played 1-1 when `winner` is 0.
 */
export function match(rows: EuropeTableRowView[], round: number, homeRank: number, awayRank: number, winner?: number): EuropeTieView {
  const goals = (rank: number): number | null => (winner === undefined ? null : winner === 0 || winner === rank ? 1 : 0);
  const through = winner === undefined || winner === 0 ? null : rows[winner - 1].clubSaveId;
  return {
    id: `m${round}-${homeRank}-${awayRank}`,
    round,
    cup: false,
    scheduledAt: DATES[round - 1],
    competitionCode: "eu.1",
    home: team(rows[homeRank - 1]),
    away: team(rows[awayRank - 1]),
    played: winner !== undefined,
    homeGoals: goals(homeRank),
    awayGoals: goals(awayRank),
    homeHalfTimeGoals: null,
    awayHalfTimeGoals: null,
    decidedBy: through === null ? null : "REGULATION",
    homePenalties: null,
    awayPenalties: null,
    winnerClubSaveId: through,
  };
}

/** A competition of a table, its league phase over or not, with its knockout matches scheduled. */
export function competition(
  rows: EuropeTableRowView[],
  over: boolean,
  knockout: EuropeTieView[] = [],
  code: EuropeCode = "eu.1",
): EuropeCompetitionView {
  return { code, dates: DATES, leagueMatches: code === "eu.1" ? 6 : 4, table: rows, leaguePhaseOver: over, knockout, winner: null };
}

/** The play-offs of a table (5th-12th … 8th-9th), each won by the rank given, or scheduled only. */
export function playoffs(rows: EuropeTableRowView[], winners?: readonly [number, number, number, number]): EuropeTieView[] {
  const ties = [
    [5, 12],
    [6, 11],
    [7, 10],
    [8, 9],
  ] as const;
  return ties.map(([home, away], index) => match(rows, 7, home, away, winners?.[index]));
}

/**
 * A whole knockout phase: the play-offs won by the 5th, 11th, 7th and 9th; the quarter-finals by the 1st, the 2nd, the
 * 11th and the 5th; the semi-finals by the 5th and the 2nd; the final, 2nd against 5th, won by `final`'s rank or to play.
 */
export function knockoutPhase(rows: EuropeTableRowView[], final?: number): EuropeTieView[] {
  return [
    ...playoffs(rows, [5, 11, 7, 9]),
    match(rows, 8, 1, 9, 1),
    match(rows, 8, 2, 7, 2),
    match(rows, 8, 3, 11, 11),
    match(rows, 8, 4, 5, 5),
    match(rows, 9, 1, 5, 5),
    match(rows, 9, 2, 11, 2),
    match(rows, 10, 2, 5, final),
  ];
}
