import "server-only";
import { managedMatchesPlayed } from "@/src/db/first-steps";
import { getDailyMissions, type DailyMissionsView } from "@/src/db/missions";
import { getNextAppointment, lastManagedResult, type NextAppointment } from "@/src/db/next-appointment";
import { OBJECTIVES_JUDGED_FROM_MATCH } from "@/src/engine/objectives";
import { assistantWordAfter, type AssistantWord } from "@/src/lib/session-end";
import { dayOnePlace, firstDayCalm, fullTimeDue, type TutorialProgress } from "@/src/lib/tutorial";
import { matchResultFor } from "./stage";

/** The tutorial's « À demain » on its first day: the assistant's line in place of the missions, and its place in the day. */
export type SessionEndTutorial = { place: { index: number; total: number } | null };

/**
 * What the « À demain » card shows: the next appointment, the assistant's word on the club's last match, and the day's
 * mission (none in a challenge save, nor on the tutorial's first day); with its first day's line once a tutorial's first
 * match is played (docs/design/tutoriel.md, step « full-time »).
 */
export type SessionEnd = {
  appointment: NextAppointment;
  word: AssistantWord | null;
  mission: DailyMissionsView | null;
  tutorial: SessionEndTutorial | null;
};

type SessionEndOptions = {
  excluded?: string; // a live match not over
  tutorial?: TutorialProgress | null; // the one the save follows (getSaveTutorial)
};

/**
 * The « À demain » card's data, read once the matches are played (the live match over, the simulation finished): the
 * next match and its stake, the week's challenge, the assistant's word after a defeat, the season's young matches
 * judged as the objectives are (OBJECTIVES_JUDGED_FROM_MATCH), and the day's mission as the moves just played left it.
 * On the tutorial's first day, neither mission (none drawn that day) nor challenge, and the assistant's « Reviens
 * demain » once its first match is played. `now` is real time.
 */
export async function readSessionEnd(saveId: string, now: Date, { excluded, tutorial = null }: SessionEndOptions = {}): Promise<SessionEnd> {
  const calm = tutorial !== null && firstDayCalm(tutorial, now);
  const [appointment, last, mission, matchesPlayed] = await Promise.all([
    getNextAppointment(saveId, now, excluded),
    lastManagedResult(saveId),
    calm ? null : getDailyMissions(saveId, now),
    tutorial === null ? 0 : managedMatchesPlayed(saveId, 1),
  ]);
  const shown = calm ? { ...appointment, challenge: null } : appointment;
  const fullTime: SessionEndTutorial | null =
    tutorial !== null && fullTimeDue(tutorial, { now, matchesPlayed }) ? { place: dayOnePlace(tutorial, "full-time") } : null;
  if (last === null) {
    return { appointment: shown, word: null, mission, tutorial: fullTime };
  }
  const [scored, conceded] = last.home ? [last.homeGoals, last.awayGoals] : [last.awayGoals, last.homeGoals];
  const word = assistantWordAfter(
    { result: matchResultFor(last, last.home), scored, conceded, cup: last.cup, europeKnockout: last.europeKnockout },
    appointment.leaguePlayed,
    OBJECTIVES_JUDGED_FROM_MATCH,
  );
  return { appointment: shown, word, mission, tutorial: fullTime };
}
