import { EUROPE_YELLOWS_PER_SUSPENSION, SUSPENSION_MATCHES, YELLOWS_PER_SUSPENSION } from "./balance";

/** The three kinds of official matches, whose yellow cards count apart: the league, the cup, the European competition. */
export type CompetitionKind = "LEAGUE" | "CUP" | "EUROPE";

/**
 * A player's discipline, as PlayerSave stores it: his yellow cards in each competition since his last suspension there or
 * the season's start, and the official matches he still has to miss.
 */
export type Discipline = {
  leagueYellows: number;
  cupYellows: number;
  europeYellows: number;
  suspendedMatches: number; // after a red card: the club's next official matches, whatever the competition
  suspendedLeagueMatches: number; // after YELLOWS_PER_SUSPENSION league yellows: the club's next league matches
  suspendedCupMatches: number; // the same in the cup
  suspendedEuropeMatches: number; // after EUROPE_YELLOWS_PER_SUSPENSION European yellows: the club's next European matches
};

export const CLEAN_DISCIPLINE: Discipline = {
  leagueYellows: 0,
  cupYellows: 0,
  europeYellows: 0,
  suspendedMatches: 0,
  suspendedLeagueMatches: 0,
  suspendedCupMatches: 0,
  suspendedEuropeMatches: 0,
};

/** The columns of a competition's yellow cards and suspension. */
const COLUMNS: Readonly<
  Record<CompetitionKind, { yellows: "leagueYellows" | "cupYellows" | "europeYellows"; suspended: "suspendedLeagueMatches" | "suspendedCupMatches" | "suspendedEuropeMatches" }>
> = {
  LEAGUE: { yellows: "leagueYellows", suspended: "suspendedLeagueMatches" },
  CUP: { yellows: "cupYellows", suspended: "suspendedCupMatches" },
  EUROPE: { yellows: "europeYellows", suspended: "suspendedEuropeMatches" },
};

/** The yellow cards that suspend a player in a competition: EUROPE_YELLOWS_PER_SUSPENSION in Europe, YELLOWS_PER_SUSPENSION elsewhere. */
export function yellowsPerSuspension(competition: CompetitionKind): number {
  return competition === "EUROPE" ? EUROPE_YELLOWS_PER_SUSPENSION : YELLOWS_PER_SUSPENSION;
}

/** His suspensions still to serve in a competition after its yellow cards (the red card's are suspendedMatches). */
export function suspendedMatchesIn(discipline: Discipline, competition: CompetitionKind): number {
  return discipline[COLUMNS[competition].suspended];
}

/** Whether a player may not play his club's next match of a competition: suspended for any match, or for that one's. */
export function isSuspended(discipline: Discipline, competition: CompetitionKind): boolean {
  return discipline.suspendedMatches > 0 || suspendedMatchesIn(discipline, competition) > 0;
}

/** His yellow cards in a competition: what a booking more there would bring to yellowsPerSuspension. */
export function yellowsIn(discipline: Discipline, competition: CompetitionKind): number {
  return discipline[COLUMNS[competition].yellows];
}

/**
 * A player's discipline after an official match of his club. Suspended for it, he has served it: one match less of each
 * suspension that kept him out. Sent off in it, he misses the club's next official match, and that match's yellows do
 * not count. Booked otherwise, his yellows in the competition grow, and reaching its yellowsPerSuspension suspends him
 * for its next match, his count back to 0. A player of the club who did not play only serves.
 */
export function disciplineAfterMatch(
  discipline: Discipline,
  competition: CompetitionKind,
  cards: { yellowCards: number; redCards: number } | undefined,
): Discipline {
  const { yellows: yellowsColumn, suspended: suspendedColumn } = COLUMNS[competition];
  const after: Discipline = isSuspended(discipline, competition)
    ? {
        ...discipline,
        suspendedMatches: Math.max(0, discipline.suspendedMatches - 1),
        [suspendedColumn]: Math.max(0, discipline[suspendedColumn] - 1),
      }
    : { ...discipline };
  if (cards === undefined) {
    return after;
  }
  if (cards.redCards > 0) {
    return { ...after, suspendedMatches: after.suspendedMatches + SUSPENSION_MATCHES };
  }
  const yellows = after[yellowsColumn] + cards.yellowCards;
  if (yellows < yellowsPerSuspension(competition)) {
    return { ...after, [yellowsColumn]: yellows };
  }
  return { ...after, [yellowsColumn]: 0, [suspendedColumn]: after[suspendedColumn] + SUSPENSION_MATCHES };
}

/** A new season: the yellow cards start again from 0, a suspension still to serve carries over. */
export function disciplineForNewSeason(discipline: Discipline): Discipline {
  return { ...discipline, leagueYellows: 0, cupYellows: 0, europeYellows: 0 };
}
