"use server";

import { getTranslations } from "next-intl/server";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import {
  lineupInputSchema,
  lineupIssueOf,
  LineupLiveError,
  lineupPlanSchema,
  LineupPlanError,
  LineupPlayerNotInSquadError,
  saveLineupPlan,
  saveManagedLineup,
  type LineupPlanResult,
  type LineupSaveResult,
} from "@/src/db/lineup";

const saveIdSchema = z.string().min(1);

/**
 * The player's own line-up, which takes it from the assistant (docs/design/simplification.md § 3.3), sent by the editor
 * after each gesture (docs/design/effectif-adjoint.md § 1): neither a toast nor a page read again (no revalidatePath), the
 * editor's status line says it; a conflict with another tab, a player gone or a match waiting live is told to the editor.
 * The mission « Enregistre ta composition », of weight 0 since the simplification, is no longer counted.
 */
export async function saveLineupAction(saveId: string, input: unknown): Promise<LineupSaveResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("actions.lineup");
  const parsed = lineupInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = lineupIssueOf(parsed.error);
    return { ok: false, reason: "invalid", message: issue === null ? t("invalid") : t(`issues.${issue}`) };
  }
  try {
    const outcome = await saveManagedLineup(id, parsed.data);
    return outcome === "conflict" ? { ok: false, reason: "conflict", message: t("conflict") } : { ok: true, outcome };
  } catch (error) {
    if (error instanceof LineupPlayerNotInSquadError) {
      return { ok: false, reason: "not-in-squad", message: t("notInSquad") };
    }
    if (error instanceof LineupLiveError) {
      return { ok: false, reason: "live", message: t("live") };
    }
    throw error;
  }
}

/**
 * The formation or the starting instruction of a club whose assistant makes the line-up, saved at once, the assistant
 * keeping it (docs/design/simplification.md § 3.2): his eleven of each match in that formation, kicking off with it. The
 * line-up now saved goes back to the editor, what it expects with its next save.
 */
export async function saveLineupPlanAction(saveId: string, input: unknown): Promise<LineupPlanResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("lineup.assistant");
  const parsed = lineupPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: t("refusals.invalid") };
  }
  try {
    return { ok: true, saved: await saveLineupPlan(id, parsed.data) };
  } catch (error) {
    if (error instanceof LineupPlanError) {
      return { ok: false, reason: "player", message: t("refusals.player") };
    }
    if (error instanceof LineupLiveError) {
      return { ok: false, reason: "live", message: (await getTranslations("actions.lineup"))("live") };
    }
    throw error;
  }
}
