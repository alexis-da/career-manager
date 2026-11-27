import type { AssistantPolicy } from "../engine/assistant-policy";
import { youthTargets } from "../engine/lineup";
import { seasonStartYear } from "../engine/world";
import { prisma } from "./client";
import { assistantYouthOf, lineupByAssistantOf } from "./lineup";
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
 * « Il lancera : X, Y » under « Lancer les jeunes » (docs/design/effectif-adjoint.md § 9): the young players his eleven
 * brings on at the hour in the league when they do not start, the ones his manager marked « Le lancer » (`byMarks`) or
 * his own choice; none while the player makes the line-up himself (`byPlayer`).
 */
export type YouthLaunchPlan =
  | { kind: "byPlayer" }
  | { kind: "targets"; byMarks: boolean; players: { playerKey: string; firstName: string; lastName: string }[] };

/**
 * The young players « Lancer les jeunes » brings on, as the club's next league match would read them (youthTargets on
 * assistantYouthOf, the matchday's): available or not, an injured or suspended one left out on the day. Null under
 * « Meilleur onze »: nothing to say, nothing read.
 */
export async function getYouthLaunchPlan(
  saveId: string,
  settings: Pick<AssistantSettings, "policy" | "lineupByAssistant">,
): Promise<YouthLaunchPlan | null> {
  if (settings.policy !== "YOUTH") {
    return null;
  }
  if (!settings.lineupByAssistant) {
    return { kind: "byPlayer" };
  }
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, youthLaunches: true } });
  const club = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, competitionId: true } });
  const players = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: club.id },
    select: { id: true, playerKey: true, firstName: true, lastName: true, position: true, overall: true, potential: true, birthDate: true },
  });
  const youth = await assistantYouthOf(
    prisma,
    saveId,
    { competitionId: club.competitionId, startYear: seasonStartYear(save.currentDate) },
    "YOUTH",
    players.map((player) => ({
      id: player.playerKey,
      playerSaveId: player.id,
      overall: player.overall,
      potential: player.potential,
      birthDate: player.birthDate,
    })),
    save.youthLaunches,
  );
  const targets =
    youth === null
      ? []
      : youthTargets(
          players.map((player) => ({ id: player.playerKey, position: player.position, overall: player.overall, injured: false })),
          youth,
        );
  const byKey = new Map(players.map((player) => [player.playerKey, player]));
  return {
    kind: "targets",
    byMarks: targets.some((key) => youth?.marked?.includes(key) === true),
    players: targets.flatMap((key) => {
      const player = byKey.get(key);
      return player === undefined ? [] : [{ playerKey: key, firstName: player.firstName, lastName: player.lastName }];
    }),
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
