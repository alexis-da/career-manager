import { CLUB_LEVEL_BY_TIER, HOME_ADVANTAGE, POSITION_PROFILES } from "./balance";
import { DEFAULT_FORMATION_NAME, FORMATION_NAMES, FORMATIONS, formationPositions, type FormationName } from "./formations";
import { clampRating, overallFor, type AttributeName } from "./generation";
import { restedLineups, selectRestedLineup, type Lineup, type SquadPlayer } from "./lineup";
import { expectedGoals, formationStrength, type TeamStrength } from "./strength";
import type { CompetitionTier } from "./tiers";

// The formation an AI club plays (docs/design/gameplay-v2.md, V1): of every formation, with its automatic eleven in it,
// the one that brings the most points expected against the average opponent of its division. One pure function, the
// same for the match, the preview of an opponent and the lineup screen's best formations for the manager's squad. No
// draw: the same squad gives the same formation.

/** Goals counted per side when expected points are summed up: past this, the chance is nil. */
const MAX_GOALS = 12;

/** The level of a division's average club: halfway between its champion's and its last club's (CLUB_LEVEL_BY_TIER). */
export function averageLevel(tier: CompetitionTier): number {
  const { worst, best } = CLUB_LEVEL_BY_TIER[tier];
  return (worst + best) / 2;
}

const averageOpponents = new Map<CompetitionTier, TeamStrength>();

/**
 * The average opponent of a division, as an AI club weighs its formations against him: an eleven of the division's
 * average level, every player at his position's profile, neither tired nor out of form, in the default formation (the
 * 4-3-3 sentinelle). Computed once per division.
 */
export function averageOpponent(tier: CompetitionTier): TeamStrength {
  const known = averageOpponents.get(tier);
  if (known !== undefined) {
    return known;
  }
  const level = averageLevel(tier);
  const eleven = FORMATIONS[DEFAULT_FORMATION_NAME].map(({ position }, index): SquadPlayer => {
    const profiled = (name: AttributeName): number => clampRating(level + POSITION_PROFILES[position][name]);
    const attributes: Record<AttributeName, number> = {
      pace: profiled("pace"),
      shooting: profiled("shooting"),
      passing: profiled("passing"),
      dribbling: profiled("dribbling"),
      defending: profiled("defending"),
      physical: profiled("physical"),
      goalkeeping: profiled("goalkeeping"),
    };
    return {
      id: `average-${tier}-${index}`,
      position,
      overall: overallFor(position, attributes),
      injured: false,
      form: 50,
      morale: 50,
      fitness: 100,
      ...attributes,
    };
  });
  const lineup = selectRestedLineup(eleven, formationPositions(DEFAULT_FORMATION_NAME));
  const strength = formationStrength(lineup, DEFAULT_FORMATION_NAME);
  averageOpponents.set(tier, strength);
  return strength;
}

/** The chances of 0 to MAX_GOALS goals for a side expecting `lambda` (Poisson). */
function goalChances(lambda: number): number[] {
  const chances = [Math.exp(-lambda)];
  for (let goals = 1; goals <= MAX_GOALS; goals++) {
    chances.push((chances[goals - 1] * lambda) / goals);
  }
  return chances;
}

/** The points a side expects from a match where it expects `scored` goals and its opponent `conceded`: 3 a win, 1 a draw. */
function pointsOf(scored: number, conceded: number): number {
  const own = goalChances(scored);
  const other = goalChances(conceded);
  let points = 0;
  own.forEach((ownChance, ownGoals) => {
    other.forEach((otherChance, otherGoals) => {
      if (ownGoals > otherGoals) {
        points += 3 * ownChance * otherChance;
      } else if (ownGoals === otherGoals) {
        points += ownChance * otherChance;
      }
    });
  });
  return points;
}

/**
 * The points a team expects per match against an opponent, at home and away alike: the engine's expected goals of each
 * side (expectedGoals, home advantage included), goals drawn as Poisson's law has them.
 */
export function expectedPoints(team: TeamStrength, opponent: TeamStrength): number {
  const home = pointsOf(expectedGoals(team, opponent, HOME_ADVANTAGE), expectedGoals(opponent, team, 1 / HOME_ADVANTAGE));
  const away = pointsOf(expectedGoals(team, opponent, 1 / HOME_ADVANTAGE), expectedGoals(opponent, team, HOME_ADVANTAGE));
  return (home + away) / 2;
}

/** A formation weighed for a squad: its automatic eleven, that eleven's strength in it, the points it expects. */
export type RankedFormation<P extends SquadPlayer = SquadPlayer> = {
  formation: FormationName;
  lineup: Lineup<P>;
  strength: TeamStrength;
  points: number; // per match, against the average opponent of the division
};

/**
 * Every formation for a squad, best first: its automatic eleven in each (selectRestedLineup: the injured and the
 * suspended out, a tired player rested where a rested one is hardly worse; picked by restedLineups, the squad ranked
 * once at each position), that eleven's strength with the formation's profile, and the points it expects per match
 * against the average opponent of its division. Equal points keep the order of FORMATION_NAMES.
 */
export function rankFormations<P extends SquadPlayer>(squad: readonly P[], tier: CompetitionTier): RankedFormation<P>[] {
  const opponent = averageOpponent(tier);
  const lineupIn = restedLineups(squad);
  const ranked = FORMATION_NAMES.map((formation): RankedFormation<P> => {
    const lineup = lineupIn(formationPositions(formation));
    const strength = formationStrength(lineup, formation);
    return { formation, lineup, strength, points: expectedPoints(strength, opponent) };
  });
  // A stable sort: equal points stay in the order of FORMATION_NAMES.
  return ranked.sort((a, b) => b.points - a.points);
}

/**
 * The formation an AI club plays a match in, and its eleven: the best of rankFormations for its squad as it stands before
 * the match, its tired, injured and suspended players included in the weighing. The matchday, the preview of an
 * opponent and the tests call it alike.
 */
export function chooseFormation<P extends SquadPlayer>(
  squad: readonly P[],
  tier: CompetitionTier,
): { formation: FormationName; lineup: Lineup<P> } {
  const [best] = rankFormations(squad, tier);
  return { formation: best.formation, lineup: best.lineup };
}

/** The formation an AI club keeps for a month of the game: the one it chose, and that month (formationMonthOf). */
export type KeptFormation = { formation: FormationName; month: number };

/** The month of the game a match falls in, as an AI club keeps its formation: 202611 for November 2026 (dates in UTC). */
export function formationMonthOf(date: Date): number {
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

/**
 * The formation of an AI club that chooses once a month, and its eleven for a match: within the month of the formation it
 * keeps, that formation, its eleven picked for this match as chooseFormation picks it in there (selectRestedLineup); at
 * its first match of another month, or with none kept, chooseFormation's, to keep until the month after (`toKeep`, null
 * when the kept one plays). The clubs of the countries other than the managed club's choose so (src/db/matchday.ts): the
 * player sees only their scores, and weighing seventeen formations before each of their matches was a large share of a
 * matchday's CPU.
 */
export function monthlyFormation<P extends SquadPlayer>(
  squad: readonly P[],
  tier: CompetitionTier,
  kept: KeptFormation | null,
  date: Date,
): { formation: FormationName; lineup: Lineup<P>; toKeep: KeptFormation | null } {
  const month = formationMonthOf(date);
  if (kept !== null && kept.month === month) {
    return { formation: kept.formation, lineup: selectRestedLineup(squad, formationPositions(kept.formation)), toKeep: null };
  }
  const chosen = chooseFormation(squad, tier);
  return { ...chosen, toKeep: { formation: chosen.formation, month } };
}
