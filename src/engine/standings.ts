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

const POINTS_FOR_WIN = 3;
const POINTS_FOR_DRAW = 1;

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
 */
export function computeStandings(matches: readonly MatchScore[]): StandingRow[] {
  const tallies = new Map<string, Tally>();
  const tally = (club: string): Tally => {
    let row = tallies.get(club);
    if (row === undefined) {
      row = { club, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
      tallies.set(club, row);
    }
    return row;
  };

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
