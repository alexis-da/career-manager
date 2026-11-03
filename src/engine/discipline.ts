import { SUSPENSION_MATCHES, YELLOWS_PER_SUSPENSION } from "./balance";

/** The two kinds of official matches, whose yellow cards count apart. */
export type CompetitionKind = "LEAGUE" | "CUP";

/**
 * A player's discipline, as PlayerSave stores it: his yellow cards in each competition since his last suspension there or
 * the season's start, and the official matches he still has to miss.
 */
export type Discipline = {
  leagueYellows: number;
  cupYellows: number;
  suspendedMatches: number; // after a red card: the club's next official matches, whatever the competition
  suspendedLeagueMatches: number; // after YELLOWS_PER_SUSPENSION league yellows: the club's next league matches
  suspendedCupMatches: number; // the same in the cup
};

export const CLEAN_DISCIPLINE: Discipline = {
  leagueYellows: 0,
  cupYellows: 0,
  suspendedMatches: 0,
  suspendedLeagueMatches: 0,
  suspendedCupMatches: 0,
};

/** Whether a player may not play his club's next match of a competition: suspended for any match, or for that one's. */
export function isSuspended(discipline: Discipline, competition: CompetitionKind): boolean {
  const ofCompetition = competition === "LEAGUE" ? discipline.suspendedLeagueMatches : discipline.suspendedCupMatches;
  return discipline.suspendedMatches > 0 || ofCompetition > 0;
}

/** His yellow cards in a competition: what a booking more there would bring to YELLOWS_PER_SUSPENSION. */
export function yellowsIn(discipline: Discipline, competition: CompetitionKind): number {
  return competition === "LEAGUE" ? discipline.leagueYellows : discipline.cupYellows;
}

/**
 * A player's discipline after an official match of his club. Suspended for it, he has served it: one match less of each
 * suspension that kept him out. Sent off in it, he misses the club's next official match, and that match's yellows do
 * not count. Booked otherwise, his yellows in the competition grow, and reaching YELLOWS_PER_SUSPENSION suspends him for
 * its next match, his count back to 0. A player of the club who did not play only serves.
 */
export function disciplineAfterMatch(
  discipline: Discipline,
  competition: CompetitionKind,
  cards: { yellowCards: number; redCards: number } | undefined,
): Discipline {
  const served = isSuspended(discipline, competition);
  const after: Discipline = served
    ? {
        ...discipline,
        suspendedMatches: Math.max(0, discipline.suspendedMatches - 1),
        suspendedLeagueMatches:
          competition === "LEAGUE" ? Math.max(0, discipline.suspendedLeagueMatches - 1) : discipline.suspendedLeagueMatches,
        suspendedCupMatches: competition === "CUP" ? Math.max(0, discipline.suspendedCupMatches - 1) : discipline.suspendedCupMatches,
      }
    : { ...discipline };
  if (cards === undefined) {
    return after;
  }
  if (cards.redCards > 0) {
    return { ...after, suspendedMatches: after.suspendedMatches + SUSPENSION_MATCHES };
  }
  const yellows = yellowsIn(after, competition) + cards.yellowCards;
  if (yellows < YELLOWS_PER_SUSPENSION) {
    return competition === "LEAGUE" ? { ...after, leagueYellows: yellows } : { ...after, cupYellows: yellows };
  }
  return competition === "LEAGUE"
    ? { ...after, leagueYellows: 0, suspendedLeagueMatches: after.suspendedLeagueMatches + SUSPENSION_MATCHES }
    : { ...after, cupYellows: 0, suspendedCupMatches: after.suspendedCupMatches + SUSPENSION_MATCHES };
}

/** A new season: the yellow cards start again from 0, a suspension still to serve carries over. */
export function disciplineForNewSeason(discipline: Discipline): Discipline {
  return { ...discipline, leagueYellows: 0, cupYellows: 0 };
}
