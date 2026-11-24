"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { prisma } from "@/src/db/client";
import {
  lineupInputSchema,
  lineupIssueOf,
  lineupPlanSchema,
  LineupPlanError,
  LineupPlayerNotInSquadError,
  saveLineupPlan,
  saveManagedLineup,
} from "@/src/db/lineup";
import { recordMissionMoves } from "@/src/db/missions";
import type { ActionResult } from "../_lib/action-result";

const saveIdSchema = z.string().min(1);

/** « Enregistrer »: the player's own line-up, which takes it from the assistant (docs/design/simplification.md § 3.3). */
export async function saveLineupAction(saveId: string, input: unknown): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("actions.lineup");
  const parsed = lineupInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = lineupIssueOf(parsed.error);
    return { ok: false, message: issue === null ? t("invalid") : t(`issues.${issue}`) };
  }
  try {
    await saveManagedLineup(id, parsed.data);
  } catch (error) {
    if (error instanceof LineupPlayerNotInSquadError) {
      return { ok: false, message: t("notInSquad") };
    }
    throw error;
  }
  // The day's missions (SAVE_LINEUP), once the line-up is written.
  await recordMissionMoves(prisma, id, { lineup: true });
  revalidatePath(`/saves/${id}`, "layout");
  const tFormations = await getTranslations("formations");
  return { ok: true, message: t("saved", { formation: tFormations(`label.${parsed.data.formation}`) }) };
}

/**
 * The formation or the starting instruction of a club whose assistant makes the line-up, saved at once, the assistant
 * keeping it (docs/design/simplification.md § 3.2): his eleven of each match in that formation, kicking off with it.
 */
export async function saveLineupPlanAction(saveId: string, input: unknown): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const t = await getTranslations("lineup.assistant");
  const parsed = lineupPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("refusals.invalid") };
  }
  let changed: { formation: boolean; instruction: boolean };
  try {
    changed = await saveLineupPlan(id, parsed.data);
  } catch (error) {
    if (error instanceof LineupPlanError) {
      return { ok: false, message: t("refusals.player") };
    }
    throw error;
  }
  // The day's missions (SAVE_LINEUP): his line-up's choices are saved, as « Enregistrer » saves them.
  await recordMissionMoves(prisma, id, { lineup: true });
  // The line-up, the dashboard's hero, the opponent's sheet: every screen of the save.
  revalidatePath(`/saves/${id}`, "layout");
  if (changed.instruction && !changed.formation) {
    const tInstruction = await getTranslations("halfTime.instruction");
    return { ok: true, message: t("instructionSaved", { instruction: tInstruction(parsed.data.instruction) }) };
  }
  const tFormations = await getTranslations("formations");
  return { ok: true, message: t("formationSaved", { formation: tFormations(`label.${parsed.data.formation}`) }) };
}
