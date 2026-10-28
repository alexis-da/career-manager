"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { requireCurrentUser } from "@/src/auth/current-user";
import { ensureCurrentChallenge, isChallengeOpen } from "@/src/db/challenge";
import { isWakeUpError, retryOnWakeUp } from "@/src/db/retry";
import { createChallengeSave } from "@/src/db/saves";
import { rankingName } from "@/src/engine/challenge";
import { describeError, phaseTimer } from "@/src/lib/diagnostics";
import { isoWeekKey } from "@/src/lib/iso-week";
import { ChallengeEntryExistsError, ChallengeFullError } from "@/src/lib/limits";
import {
  CHALLENGE_CLOSED_MESSAGE,
  CHALLENGE_FULL_MESSAGE,
  CHALLENGE_PLAYED_MESSAGE,
  DEFAULT_CHALLENGE_MANAGER,
} from "./_lib/messages";

export type PlayChallengeState = { message: string | null };

const playChallengeSchema = z.object({ weekKey: z.string().regex(/^\d{4}-W\d{2}$/) });

/**
 * « Jouer le défi »: the player's save of the challenge open now (createChallengeSave), then its dashboard. The page
 * sends the week it offered: from a page of a week now over, refused (the challenge is closed), never another week's
 * save. One a player a week, at most MAX_CHALLENGE_SAVES_PER_WEEK a week: refused with a message, the page then shows
 * why in place of the button.
 */
export async function playChallengeAction(_previous: PlayChallengeState, formData: FormData): Promise<PlayChallengeState> {
  const parsed = playChallengeSchema.safeParse({ weekKey: formData.get("weekKey") });
  // Not simulation code: the challenge open now is the real week's.
  const now = new Date();
  if (!parsed.success || parsed.data.weekKey !== isoWeekKey(now)) {
    return { message: CHALLENGE_CLOSED_MESSAGE };
  }

  let saveId: string;
  const timer = phaseTimer();
  try {
    const challenge = await ensureCurrentChallenge(now);
    if (!isChallengeOpen(challenge, now)) {
      return { message: CHALLENGE_CLOSED_MESSAGE };
    }
    // The player gets an anonymous identity, and its cookie, with this save as with any first one.
    const owner = await requireCurrentUser();
    const managerName = owner.name === null ? DEFAULT_CHALLENGE_MANAGER : rankingName(owner.name);
    // A database waking up (P2028, P1001, P1017) gets one more try: the failed transaction was rolled back.
    ({ id: saveId } = await retryOnWakeUp(() => createChallengeSave({ challengeId: challenge.id, managerName, ownerId: owner.id }), {
      onRetry: (error) => console.warn(`[playChallengeAction] trying again after ${timer.elapsed()} ms: ${describeError(error)}`),
    }));
  } catch (error) {
    if (error instanceof ChallengeEntryExistsError || error instanceof ChallengeFullError) {
      revalidatePath("/challenge");
      return { message: error instanceof ChallengeFullError ? CHALLENGE_FULL_MESSAGE : CHALLENGE_PLAYED_MESSAGE };
    }
    console.error(`[playChallengeAction] failed after ${timer.elapsed()} ms: ${describeError(error)}`, error);
    const message = isWakeUpError(error)
      ? "Le serveur se réveille : réessaie dans quelques secondes."
      : "La partie de défi n'a pas pu être créée. Réessaie.";
    return { message };
  }

  revalidatePath("/");
  revalidatePath("/challenge");
  redirect(`/saves/${saveId}`);
}
