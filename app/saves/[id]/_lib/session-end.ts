import "server-only";
import { getDailyMission, type DailyMissionView } from "@/src/db/missions";
import { getNextAppointment, lastManagedResult, type NextAppointment } from "@/src/db/next-appointment";
import { OBJECTIVES_JUDGED_FROM_MATCH } from "@/src/engine/objectives";
import { assistantWordAfter, type AssistantWord } from "@/src/lib/session-end";
import { matchResultFor } from "./stage";

/**
 * What the « À demain » card shows: the next appointment, the assistant's word on the club's last match, and the day's
 * mission (none in a challenge save).
 */
export type SessionEnd = { appointment: NextAppointment; word: AssistantWord | null; mission: DailyMissionView | null };

/**
 * The « À demain » card's data, read once the matches are played (the live match over, the simulation finished): the
 * next match and its stake, the week's challenge, the assistant's word after a defeat, the season's young matches
 * judged as the objectives are (OBJECTIVES_JUDGED_FROM_MATCH), and the day's mission as the moves just played left it.
 * `now` is real time; `excluded`, a live match not over.
 */
export async function readSessionEnd(saveId: string, now: Date, excluded?: string): Promise<SessionEnd> {
  const [appointment, last, mission] = await Promise.all([
    getNextAppointment(saveId, now, excluded),
    lastManagedResult(saveId),
    getDailyMission(saveId, now),
  ]);
  if (last === null) {
    return { appointment, word: null, mission };
  }
  const [scored, conceded] = last.home ? [last.homeGoals, last.awayGoals] : [last.awayGoals, last.homeGoals];
  const word = assistantWordAfter(
    { result: matchResultFor(last, last.home), scored, conceded, cup: last.cup },
    appointment.leaguePlayed,
    OBJECTIVES_JUDGED_FROM_MATCH,
  );
  return { appointment, word, mission };
}
