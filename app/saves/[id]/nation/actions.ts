"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { lineupInputSchema, lineupIssueOf } from "@/src/db/lineup";
import { NoMatchInProgressError, PauseMismatchError } from "@/src/db/live-match";
import {
  acceptCoachOffer,
  declineCoachOffer,
  NationalCoachError,
  resignNationalTeam,
  saveCoachCallUp,
  saveCoachLineup,
  setNationFriendlies,
} from "@/src/db/national-coach";
import { advanceNationalLiveMatch, getNationalLiveStep } from "@/src/db/national-live";
import { EXTRA_TIME_SUBSTITUTIONS, MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import { CHOICE_OPTIONS, ChoiceError } from "@/src/engine/choices";
import { HalfTimeChoiceError } from "@/src/engine/match";
import { NATION_CODES } from "@/src/engine/nations";
import { formationSchema } from "@/src/db/lineup";
import type { ActionResult } from "../_lib/action-result";
import { halfTimeRefusalMessage } from "../_lib/live-match";
import type { LiveStepResult } from "../actions";

// The national coach's moves (docs/design/selections.md § 5, N4 and N4b): a federation's offer accepted or declined, his
// post left, his friendlies left to his assistant or not, his list of 23, his lineup, and his match played live step by
// step. Each checks the save's owner first; a refusal says why.

const saveIdSchema = z.string().min(1);
const nationSchema = z.enum(NATION_CODES);

/** The screens that show the national coach: his tab, the dashboard, the season's start, the History. */
function revalidateCoach(saveId: string): void {
  revalidatePath(`/saves/${saveId}`, "layout");
}

async function refusal(error: unknown): Promise<ActionResult | null> {
  if (error instanceof NationalCoachError) {
    const t = await getTranslations("nationalTeam.refusals");
    return { ok: false, message: t(error.reason) };
  }
  return null;
}

/** « Accepter le poste »: the federation's offer of this season, while it is open. */
export async function acceptCoachOfferAction(saveId: string, code: string): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tWorld] = [await getTranslations("nationalTeam"), await getTranslations("world")];
  const nation = nationSchema.safeParse(code);
  if (!nation.success) {
    return { ok: false, message: t("refusals.invalid") };
  }
  try {
    await acceptCoachOffer(id, nation.data);
  } catch (error) {
    const refused = await refusal(error);
    if (refused !== null) {
      return refused;
    }
    throw error;
  }
  revalidateCoach(id);
  return { ok: true, message: t("done.accepted", { nation: tWorld(`nationalities.${nation.data}`) }) };
}

/** « Pas maintenant »: the offer goes; others may come at a later season. */
export async function declineCoachOfferAction(saveId: string, code: string): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("nationalTeam");
  const nation = nationSchema.safeParse(code);
  if (!nation.success) {
    return { ok: false, message: t("refusals.invalid") };
  }
  await declineCoachOffer(id, nation.data);
  revalidateCoach(id);
  return { ok: true, message: t("done.declined") };
}

/** « Quitter la sélection »: between two breaks, never during one; his club goes on. */
export async function resignNationalTeamAction(saveId: string, code: string): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tWorld] = [await getTranslations("nationalTeam"), await getTranslations("world")];
  const nation = nationSchema.safeParse(code);
  try {
    await resignNationalTeam(id);
  } catch (error) {
    const refused = await refusal(error);
    if (refused !== null) {
      return refused;
    }
    throw error;
  }
  revalidateCoach(id);
  return { ok: true, message: t("done.resigned", { nation: nation.success ? tWorld(`nationalities.${nation.data}`) : code }) };
}

/** « L'adjoint joue les amicaux »: on, his assistant plays them without a stop; off, he plays them himself. */
export async function setNationFriendliesAction(saveId: string, byAssistant: boolean): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("nationalTeam");
  const parsed = z.boolean().safeParse(byAssistant);
  if (!parsed.success) {
    return { ok: false, message: t("refusals.invalid") };
  }
  try {
    await setNationFriendlies(id, parsed.data);
  } catch (error) {
    const refused = await refusal(error);
    if (refused !== null) {
      return refused;
    }
    throw error;
  }
  revalidateCoach(id);
  return { ok: true, message: t(parsed.data ? "done.friendliesByAssistant" : "done.friendliesByYou") };
}

/** « Enregistrer la liste »: his 23 for his next break or tournament, before its first match. */
export async function saveCoachCallUpAction(saveId: string, keys: string[]): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("nationalTeam");
  const parsed = z.array(z.string().min(1).max(100)).max(30).safeParse(keys);
  if (!parsed.success) {
    return { ok: false, message: t("refusals.call-up") };
  }
  try {
    await saveCoachCallUp(id, parsed.data);
  } catch (error) {
    const refused = await refusal(error);
    if (refused !== null) {
      return refused;
    }
    throw error;
  }
  revalidateCoach(id);
  return { ok: true, message: t("done.callUp") };
}

/** « Enregistrer » in his lineup editor: his formation, eleven, bench and starting instruction for his nation. */
export async function saveCoachLineupAction(saveId: string, input: unknown): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tLineup] = [await getTranslations("nationalTeam"), await getTranslations("actions.lineup")];
  const parsed = lineupInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = lineupIssueOf(parsed.error);
    return { ok: false, message: issue === null ? tLineup("invalid") : tLineup(`issues.${issue}`) };
  }
  try {
    await saveCoachLineup(id, { formation: parsed.data.formation, lineup: parsed.data.lineup });
  } catch (error) {
    const refused = await refusal(error);
    if (refused !== null) {
      return refused;
    }
    throw error;
  }
  revalidatePath(`/saves/${id}/nation`, "layout");
  return { ok: true, message: t("done.lineup") };
}

// ------------------------------------------------------------------ His match live (N4b)

const halfTimeChoiceSchema = z
  .object({
    formation: formationSchema,
    lineup: z.array(z.object({ slot: z.number().int().min(0).max(10), playerKey: z.string().min(1).max(100) })).max(11),
    substitutions: z
      .array(z.object({ in: z.string().min(1).max(100), out: z.string().min(1).max(100) }))
      .max(MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS),
  })
  .nullable();

const liveMoveSchema = z.object({
  decision: z.object({ option: z.enum(CHOICE_OPTIONS), playerKey: z.string().min(1).max(100).optional() }).nullable(),
  changes: halfTimeChoiceSchema,
  instruction: z.enum(["ATTACK", "BALANCED", "DEFEND"]).nullable(),
});

const livePauseSchema = z.object({
  phase: z.enum(["IN_PLAY", "HALF_TIME", "REGULATION_END", "EXTRA_TIME_BREAK"]),
  minute: z.number().int().min(0).max(120),
});

/**
 * Plays on the national coach's match from the pause it waits at, with what he brings there, as playLiveStepAction does
 * for his club's: one call a step, returning what the live page shows. Once over, his break or tournament goes on to his
 * next match at stake (or ends), and the save's screens are read again on the way out.
 */
export async function playNationLiveStepAction(
  saveId: string,
  at: { phase: string; minute: number },
  move: z.input<typeof liveMoveSchema>,
  until: "segment" | "pause" | "break",
): Promise<LiveStepResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tLive] = [await getTranslations("actions.resume"), await getTranslations("liveMatch")];
  const pause = livePauseSchema.safeParse(at);
  const parsed = liveMoveSchema.safeParse(move);
  const mode = z.enum(["segment", "pause", "break"]).safeParse(until);
  if (!pause.success || !mode.success) {
    return { ok: false, message: tLive("pauseGone") };
  }
  if (!parsed.success) {
    return { ok: false, message: t("invalid", { max: MAX_SUBSTITUTIONS }) };
  }
  const { decision, changes, instruction } = parsed.data;
  try {
    const moved = await advanceNationalLiveMatch(
      id,
      pause.data,
      {
        decision: decision === null ? null : { option: decision.option, playerId: decision.playerKey },
        changes: changes === null ? null : { formation: changes.formation, starters: changes.lineup, substitutions: changes.substitutions },
        instruction,
      },
      mode.data,
    );
    const step = await getNationalLiveStep(id, moved);
    if (moved.pause === null) {
      revalidateCoach(id);
    }
    return { ok: true, step };
  } catch (error) {
    if (error instanceof HalfTimeChoiceError) {
      return { ok: false, message: halfTimeRefusalMessage(error.issue, tLive) };
    }
    if (error instanceof ChoiceError) {
      return { ok: false, message: tLive("invalidDecision") };
    }
    if (error instanceof PauseMismatchError) {
      return { ok: false, message: tLive("pauseGone") };
    }
    if (error instanceof NoMatchInProgressError) {
      return { ok: false, message: tLive("noMatchInProgress") };
    }
    throw error;
  }
}
