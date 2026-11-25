import type { AssistantPolicy } from "../engine/assistant-policy";
import { prisma } from "./client";
import { lineupByAssistantOf } from "./lineup";
import { liveMatchOf, lockSave } from "./matchday";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

const TRANSACTION = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: 10_000 };

/**
 * What the assistant takes care of in a career (docs/design/simplification.md § 2.3, § 3.3 and § 7): the line-up before
 * each match, the contracts at the season's turn, the policy he follows in them (docs/design/effectif-adjoint.md § 2),
 * and whether the career was told so.
 */
export type AssistantSettings = {
  lineupByAssistant: boolean; // the assistant fields his rested eleven in the player's formation before each match
  contractsByAssistant: boolean; // the assistant renews the useful players and lets the others go
  policy: AssistantPolicy; // « Meilleur onze » or « Lancer les jeunes », for what he takes care of
  noticeOpen: boolean; // the dashboard still announces the change: a career from before it, never a challenge one
};

export class AssistantSettingsError extends Error {
  constructor(readonly reason: "live") {
    super(`Assistant settings refused: ${reason}`);
    this.name = "AssistantSettingsError";
  }
}

/** The assistant's settings of a career, its club's saved line-up read only for a career from before the setting. */
export async function getAssistantSettings(saveId: string): Promise<AssistantSettings> {
  const save = await prisma.save.findUniqueOrThrow({
    where: { id: saveId },
    select: { lineupByAssistant: true, contractsByAssistant: true, assistantPolicy: true, assistantNoticeAt: true, challengeId: true },
  });
  const savedLineup =
    save.lineupByAssistant === null
      ? (await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { lineup: true } })).lineup
      : null;
  return {
    lineupByAssistant: lineupByAssistantOf(save.lineupByAssistant, savedLineup),
    contractsByAssistant: save.contractsByAssistant,
    policy: save.assistantPolicy,
    noticeOpen: save.assistantNoticeAt === null && save.challengeId === null,
  };
}

/**
 * Turns one of the assistant's settings, the save locked, refused while a match waits live: its state holds the line-up
 * it kicked off with, and a contract is never decided in the middle of one.
 */
async function setSetting(
  saveId: string,
  data: { lineupByAssistant: boolean } | { contractsByAssistant: boolean } | { assistantPolicy: AssistantPolicy },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockSave(tx, saveId);
    const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, liveInternationalId: true } });
    if (liveMatchOf(save) !== null) {
      throw new AssistantSettingsError("live");
    }
    await tx.save.update({ where: { id: saveId }, data });
  }, TRANSACTION);
}

/** « Composition » of Club → Réglages, or « Rendre la main à l'adjoint » on the line-up (true). */
export async function setLineupByAssistant(saveId: string, byAssistant: boolean): Promise<void> {
  await setSetting(saveId, { lineupByAssistant: byAssistant });
}

/** « Contrats » of Club → Réglages. */
export async function setContractsByAssistant(saveId: string, byAssistant: boolean): Promise<void> {
  await setSetting(saveId, { contractsByAssistant: byAssistant });
}

/**
 * « Sa consigne » of Club → Réglages (docs/design/effectif-adjoint.md § 2.1): the assistant's policy, for the line-up and
 * the contracts he takes care of. Kept while he takes care of neither: it waits for one of them.
 */
export async function setAssistantPolicy(saveId: string, policy: AssistantPolicy): Promise<void> {
  await setSetting(saveId, { assistantPolicy: policy });
}

/** « Compris » on the announcement: closed for good in this career, at the database's clock. */
export async function closeAssistantNotice(saveId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "Save" SET "assistantNoticeAt" = now() WHERE "id" = ${saveId} AND "assistantNoticeAt" IS NULL`;
}
