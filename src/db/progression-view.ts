import { DECLINE_BY_AGE, GROWTH_BY_MINUTES, GROWTH_END_AGE } from "../engine/balance";
import { interpolate } from "../engine/curves";
import { expectedProgression, projectedLeagueMinutes } from "../engine/progression";

// A player's progression as the squad and the sheet show it (docs/design/effectif-adjoint.md § 3.2): the summer passed,
// the summer to come and, at the managed club, his rating season by season. Pure: no query here, the callers read the
// rows (src/db/players.ts).

/** League minutes from which a season's growth is whole (GROWTH_BY_MINUTES's last point): the gauge's full mark. */
export const FULL_GROWTH_MINUTES = GROWTH_BY_MINUTES[GROWTH_BY_MINUTES.length - 1][0];

/** A season of a player's at the managed club: his rating then, and his potential when the season's relevé kept it. */
export type ProgressionPoint = { startYear: number; overall: number; potential: number | null };

/**
 * The summer to come, rounded to the point, for a player of the managed club: the season's turn without its draw
 * (expectedProgression), his league minutes prorated to the club's league season.
 */
export type SummerOutlook = {
  leagueMinutes: number; // this season's league minutes, every club's, as the turn counts them
  // A player with room (potential above overall, under GROWTH_END_AGE on the next 1 July): his rhythm kept, then no league
  // minute and every one; null otherwise.
  growth: { expected: number; idle: number; starter: number } | null;
  // A player whose age takes points off at the turn (from 30 on the next 1 July), negative; null otherwise.
  decline: number | null;
};

export type PlayerProgression = {
  // The summer passed: his rating against the one before the season's last turn; null when unknown (a player who was not
  // in the world then, or a career that has not turned a season since the column).
  last: number | null;
  outlook: SummerOutlook | null; // the managed club's players only: their club's matches are read
  history: ProgressionPoint[]; // the managed club's: one point per completed season at the club, then this one; [] otherwise
};

/** The noise of a float's products: 20 × 0.325 gives 6.4999999999999991, a half all the same. */
const ROUNDING_EPSILON = 1e-9;

/** A change rounded to the point, half away from zero: « about −3 » for a decline of 2.5, as « about +7 » for a growth of 6.5. */
export function roundChange(change: number): number {
  const rounded = Math.sign(change) * Math.round(Math.abs(change) + ROUNDING_EPSILON);
  return rounded === 0 ? 0 : rounded; // never -0
}

/**
 * The summer to come for a player of age `ageNext` on the next 1 July, `leagueMinutes` in the league so far, his club
 * having played `clubPlayed` of its `clubMatches` league matches of the season.
 */
export function summerOutlook(
  player: { overall: number; potential: number },
  ageNext: number,
  leagueMinutes: number,
  club: { played: number; matches: number },
): SummerOutlook {
  const hasRoom = player.potential > player.overall && ageNext < GROWTH_END_AGE;
  const decline = interpolate(DECLINE_BY_AGE, ageNext);
  const at = (minutes: number): number => roundChange(expectedProgression(player, ageNext, minutes));
  return {
    leagueMinutes,
    growth: hasRoom
      ? {
          expected: at(projectedLeagueMinutes(leagueMinutes, club.played, club.matches)),
          idle: at(0),
          starter: at(FULL_GROWTH_MINUTES),
        }
      : null,
    decline: decline > 0 ? roundChange(-decline) : null,
  };
}

/**
 * His points season by season at the managed club: each completed season whose relevé has him (SeasonResult.highlights,
 * kept since 18/11: his rating at its end, before the turn), then the season under way.
 */
export function progressionHistory(
  playerKey: string,
  seasons: readonly { startYear: number; squad: readonly { playerKey: string; overall: number; potential?: number }[] }[],
  current: ProgressionPoint,
): ProgressionPoint[] {
  const completed = seasons
    .filter((season) => season.startYear < current.startYear)
    .flatMap((season) => {
      const entry = season.squad.find((squadPlayer) => squadPlayer.playerKey === playerKey);
      return entry === undefined ? [] : [{ startYear: season.startYear, overall: entry.overall, potential: entry.potential ?? null }];
    })
    .sort((a, b) => a.startYear - b.startYear);
  return [...completed, current];
}
