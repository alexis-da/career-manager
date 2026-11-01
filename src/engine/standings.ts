export type MatchScore = {
  home: string; // club key, e.g. its slug
  away: string;
  homeGoals: number;
  awayGoals: number;
};

export type StandingRow = {
  rank: number;
  club: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type FormResult = "W" | "D" | "L";

export const POINTS_FOR_WIN = 3;
export const POINTS_FOR_DRAW = 1;

/** Results of a club shown in a league table. */
export const TABLE_FORM_LENGTH = 5;

type Tally = Omit<StandingRow, "rank" | "goalDifference" | "points">;

function compareRows(a: StandingRow, b: StandingRow): number {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    (a.club < b.club ? -1 : a.club > b.club ? 1 : 0)
  );
}

/**
 * League table from final scores, sorted by points, goal difference, goals scored, then club key.
 * No head-to-head rule and no point deduction: a deterministic approximation of the real table.
 * `clubs` lists every club of the competition, so that clubs without a played match still appear.
 */
export function computeStandings(matches: readonly MatchScore[], clubs: readonly string[] = []): StandingRow[] {
  const tallies = new Map<string, Tally>();
  const tally = (club: string): Tally => {
    let row = tallies.get(club);
    if (row === undefined) {
      row = { club, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
      tallies.set(club, row);
    }
    return row;
  };

  for (const club of clubs) {
    tally(club);
  }
  for (const match of matches) {
    const home = tally(match.home);
    const away = tally(match.away);
    home.played++;
    away.played++;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;
    if (match.homeGoals > match.awayGoals) {
      home.won++;
      away.lost++;
    } else if (match.homeGoals < match.awayGoals) {
      away.won++;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
    }
  }

  return [...tallies.values()]
    .map((row) => ({
      ...row,
      rank: 0,
      goalDifference: row.goalsFor - row.goalsAgainst,
      points: row.won * POINTS_FOR_WIN + row.drawn * POINTS_FOR_DRAW,
    }))
    .sort(compareRows)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

const resultOf = (scored: number, conceded: number): FormResult => (scored > conceded ? "W" : scored < conceded ? "L" : "D");

/**
 * Each club's last results, oldest first, from the final scores of a season in chronological order. A club without a
 * played match has no entry.
 */
export function computeForm(matches: readonly MatchScore[]): Map<string, FormResult[]> {
  const form = new Map<string, FormResult[]>();
  const record = (club: string, result: FormResult): void => {
    form.set(club, [...(form.get(club) ?? []), result].slice(-TABLE_FORM_LENGTH));
  };

  for (const { home, away, homeGoals, awayGoals } of matches) {
    record(home, resultOf(homeGoals, awayGoals));
    record(away, resultOf(awayGoals, homeGoals));
  }
  return form;
}
