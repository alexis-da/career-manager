import type { CoachMatchLine, NationalTeamView } from "@/src/db/national-view";
import type { NationCode } from "@/src/engine/nations";
import { isTournament, type TournamentCode } from "@/src/engine/tournaments";
import type { ResultKind } from "../../_lib/results";

// The national coach's screen read from his view (src/db/national-view.ts): his nation's matches as his lists tell them
// (their opponent, their venue, their result, his next one at stake), the tournament of his session, where his nation
// stands in its zone. Pure; the names (stages, tournaments, days) are the coach's screens' own (_components/coach-names).

type Sides = Pick<CoachMatchLine, "home" | "away">;

/** The nation his plays in a match. */
export const opponentOf = (line: Sides, code: NationCode): NationCode => (line.home === code ? line.away : line.home);

export type Venue = "home" | "away" | "neutral";

/** Where his nation plays a match: a tournament's on neutral ground. */
export const venueOf = (line: Sides & Pick<CoachMatchLine, "neutral">, code: NationCode): Venue =>
  line.neutral ? "neutral" : line.home === code ? "home" : "away";

/** His nation's result in a played match, the shoot-out's after a draw; null before it is played. */
export function nationResult(
  line: Sides & Pick<CoachMatchLine, "played" | "homeGoals" | "awayGoals" | "decidedBy" | "homePenalties" | "awayPenalties">,
  code: NationCode,
): ResultKind | null {
  if (!line.played || line.homeGoals === null || line.awayGoals === null) {
    return null;
  }
  const shootOut = line.homeGoals === line.awayGoals && line.decidedBy === "PENALTIES" && line.homePenalties !== null && line.awayPenalties !== null;
  const [home, away] = shootOut ? [line.homePenalties ?? 0, line.awayPenalties ?? 0] : [line.homeGoals, line.awayGoals];
  const [own, other] = line.home === code ? [home, away] : [away, home];
  return own > other ? "W" : own < other ? "L" : "D";
}

/** A match's key in a list: its row's id, else its date and its nations (a tournament's next match has no row yet). */
export const lineKey = (line: Pick<CoachMatchLine, "id" | "date" | "home" | "away">): string =>
  line.id ?? `${line.date.toISOString()}-${line.home}-${line.away}`;

/** The index of his next match at stake in his session's lines: the first not played that his assistant does not play; -1 without. */
export const nextStopIndex = (lines: readonly Pick<CoachMatchLine, "played" | "byAssistant">[]): number =>
  lines.findIndex((line) => !line.played && !line.byAssistant);

/**
 * The tournament of his session, in the June of its last date: its matches' competition, else its cycle's. null for a
 * break, or when neither says it.
 */
export function sessionTournament(view: Pick<NationalTeamView, "session" | "tournament">): { tournament: TournamentCode; year: number } | null {
  const session = view.session;
  if (session === null || session.kind !== "tournament") {
    return null;
  }
  const tournament = session.matches.map((match) => match.competition).find(isTournament) ?? view.tournament;
  return tournament === null ? null : { tournament, year: session.last.getUTCFullYear() };
}

/** Where his nation stands in its zone's qualifiers, once it has played there; null before, or without qualifiers. */
export function zoneStanding(view: Pick<NationalTeamView, "code" | "zone">): { rank: number; points: number; played: number; qualifying: boolean } | null {
  const row = view.zone?.rows.find((entry) => entry.code === view.code);
  if (view.zone === null || row === undefined || row.played === 0) {
    return null;
  }
  return { rank: row.rank, points: row.points, played: row.played, qualifying: row.rank <= view.zone.places };
}
