"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import * as z from "zod";
import { requireCurrentUser } from "@/src/auth/current-user";
import { ensureCurrentChallenge, isChallengeOpen } from "@/src/db/challenge";
import { challengeClubName } from "@/src/db/challenge-view";
import { isWakeUpError, retryOnWakeUp } from "@/src/db/retry";
import { createChallengeSave } from "@/src/db/saves";
import { rankingName } from "@/src/engine/challenge";
import { LOCALES } from "@/src/i18n/locale";
import { publicPath, type PublicPageName } from "@/src/i18n/public-pages";
import { describeError, phaseTimer } from "@/src/lib/diagnostics";
import { isoWeekKey } from "@/src/lib/iso-week";
import { ChallengeEntryExistsError, ChallengeFullError } from "@/src/lib/limits";

export type PlayChallengeState = { message: string | null };

/** These public pages, in both languages: a challenge save changes what they show. */
function revalidatePublicPages(pages: PublicPageName[]): void {
  for (const page of pages) {
    for (const locale of LOCALES) {
      revalidatePath(publicPath(page, locale));
    }
  }
}

const playChallengeSchema = z.object({ weekKey: z.string().regex(/^\d{4}-W\d{2}$/) });

/**
 * The club of a week's challenge by its name, which the public challenge page asks for once in the browser: no club's
 * name is in a public page's HTML. Null for a week that is not one or has no challenge. Public: no user needed.
 */
export async function challengeClubNameAction(weekKey: string): Promise<string | null> {
  const parsed = playChallengeSchema.shape.weekKey.safeParse(weekKey);
  return parsed.success ? challengeClubName(parsed.data) : null;
}

/** The manager's name of a challenge save: the Google account's first name, else this one, in every language. */
const DEFAULT_CHALLENGE_MANAGER = "Manager";

/**
 * « Jouer le défi »: the player's save of the challenge open now (createChallengeSave), then its dashboard. The page
 * sends the week it offered: from a page of a week now over, refused (the challenge is closed), never another week's
 * save. One a player a week, at most MAX_CHALLENGE_SAVES_PER_WEEK a week: refused with a message, the page then shows
 * why in place of the button.
 */
export async function playChallengeAction(_previous: PlayChallengeState, formData: FormData): Promise<PlayChallengeState> {
  const t = await getTranslations("challenge");
  const parsed = playChallengeSchema.safeParse({ weekKey: formData.get("weekKey") });
  // Not simulation code: the challenge open now is the real week's.
  const now = new Date();
  if (!parsed.success || parsed.data.weekKey !== isoWeekKey(now)) {
    return { message: t("closed") };
  }

  let saveId: string;
  const timer = phaseTimer();
  try {
    const challenge = await ensureCurrentChallenge(now);
    if (!isChallengeOpen(challenge, now)) {
      return { message: t("closed") };
    }
    // The player gets an anonymous identity, and its cookie, with this save as with any first one.
    const owner = await requireCurrentUser();
    const managerName = rankingName(owner.name) ?? DEFAULT_CHALLENGE_MANAGER;
    // A database waking up (P2028, P1001, P1017) gets one more try: the failed transaction was rolled back.
    ({ id: saveId } = await retryOnWakeUp(() => createChallengeSave({ challengeId: challenge.id, managerName, ownerId: owner.id }), {
      onRetry: (error) => console.warn(`[playChallengeAction] trying again after ${timer.elapsed()} ms: ${describeError(error)}`),
    }));
  } catch (error) {
    if (error instanceof ChallengeEntryExistsError || error instanceof ChallengeFullError) {
      revalidatePublicPages(["challenge"]);
      return { message: error instanceof ChallengeFullError ? t("full") : t("played") };
    }
    console.error(`[playChallengeAction] failed after ${timer.elapsed()} ms: ${describeError(error)}`, error);
    return { message: isWakeUpError(error) ? (await getTranslations("common"))("wakingUp") : t("failed") };
  }

  revalidatePublicPages(["home", "challenge"]);
  redirect(`/saves/${saveId}`);
}
