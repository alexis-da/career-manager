import {
  isSuspended,
  suspendedMatchesIn,
  yellowsIn,
  yellowsPerSuspension,
  type CompetitionKind,
  type Discipline,
} from "../engine/discipline";

// Suspensions and yellow cards as the screens show them, for a player of the managed club before its next match. Pure: no
// query here, the callers read the fixtures and the players.

/** The competitions in the order the screens name them: the league, the cup, then the European competition. */
const COMPETITIONS: readonly CompetitionKind[] = ["LEAGUE", "CUP", "EUROPE"];

/** The columns of PlayerSave a player's discipline is read from. */
export const DISCIPLINE_SELECT = {
  leagueYellows: true,
  cupYellows: true,
  suspendedMatches: true,
  suspendedLeagueMatches: true,
  suspendedCupMatches: true,
  europeYellows: true,
  suspendedEuropeMatches: true,
} as const;

/** What the managed club still has to play: its next match, null once none is left, and every competition it still plays in. */
export type MatchesAhead = {
  next: { date: Date; competition: CompetitionKind } | null;
  competitions: readonly CompetitionKind[]; // with an unplayed match of the club, the league first
};

/** The managed club's matches ahead, from its unplayed fixtures, the soonest first. */
export function matchesAhead(fixtures: readonly { date: Date; competition: CompetitionKind }[]): MatchesAhead {
  return {
    next: fixtures.at(0) ?? null,
    competitions: COMPETITIONS.filter((competition) => fixtures.some((fixture) => fixture.competition === competition)),
  };
}

/** A competition where one booking more would suspend the player, and his yellow cards there. */
export type BookingRisk = { competition: CompetitionKind; yellows: number };

export type DisciplineStatus = {
  // He may not play the club's next match, whose competition decides (isSuspended): the matchday leaves him out, as an
  // injured player. Never without a next match.
  suspended: boolean;
  // Free for the next match, but suspended for his next one of this competition, the other one, which the club still plays.
  suspendedLater: CompetitionKind | null;
  // One booking from a suspension (yellowsPerSuspension − 1 yellow cards: 4 in the league and the cup, 2 in Europe) in a
  // competition the club still plays this season, the league first: the yellow cards start from 0 again with the next
  // season.
  bookingRisks: BookingRisk[];
  // A booking in the next match would suspend him: one of bookingRisks is its competition's. What the pitch warns of.
  bookingRiskNextMatch: boolean;
};

/** A suspension still to serve in a competition after the yellow cards there: the red card's is the club's next match's. */
const suspendedIn = (discipline: Discipline, competition: CompetitionKind): boolean => suspendedMatchesIn(discipline, competition) > 0;

/** A player's suspensions and yellow cards at risk, against what his club still has to play. */
export function disciplineStatus(discipline: Discipline, ahead: MatchesAhead): DisciplineStatus {
  const next = ahead.next?.competition ?? null;
  const later = ahead.competitions.find((competition) => competition !== next && suspendedIn(discipline, competition));
  const bookingRisks = ahead.competitions.flatMap((competition) => {
    const yellows = yellowsIn(discipline, competition);
    return yellows >= yellowsPerSuspension(competition) - 1 ? [{ competition, yellows }] : [];
  });
  return {
    suspended: next !== null && isSuspended(discipline, next),
    suspendedLater: later ?? null,
    bookingRisks,
    bookingRiskNextMatch: bookingRisks.some(({ competition }) => competition === next),
  };
}
