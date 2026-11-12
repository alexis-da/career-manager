import "server-only";
import { getNextAppointment, lastManagedResult, type NextAppointment } from "@/src/db/next-appointment";
import { OBJECTIVES_JUDGED_FROM_MATCH } from "@/src/engine/objectives";
import { assistantWordAfter, type AssistantWord } from "@/src/lib/session-end";
import { matchResultFor } from "./stage";

/** What the « À demain » card shows: the next appointment, and the assistant's word on the club's last match. */
export type SessionEnd = { appointment: NextAppointment; word: AssistantWord | null };

/**
 * The « À demain » card's data, read once the matches are played (the live match over, the simulation finished): the
 * next match and its stake, the week's challenge, and the assistant's word after a defeat, the season's young matches
 * judged as the objectives are (OBJECTIVES_JUDGED_FROM_MATCH). `now` is real time; `excluded`, a live match not over.
 */
export async function readSessionEnd(saveId: string, now: Date, excluded?: string): Promise<SessionEnd> {
  const [appointment, last] = await Promise.all([getNextAppointment(saveId, now, excluded), lastManagedResult(saveId)]);
  if (last === null) {
    return { appointment, word: null };
  }
  const [scored, conceded] = last.home ? [last.homeGoals, last.awayGoals] : [last.awayGoals, last.homeGoals];
  const word = assistantWordAfter(
    { result: matchResultFor(last, last.home), scored, conceded, cup: last.cup },
    appointment.leaguePlayed,
    OBJECTIVES_JUDGED_FROM_MATCH,
  );
  return { appointment, word };
}
