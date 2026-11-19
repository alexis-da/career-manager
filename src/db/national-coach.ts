import { CALL_UP_BY_GROUP, CALL_UP_SIZE } from "../engine/balance";
import { isNationCode, nationByCode, type NationCode } from "../engine/nations";
import { seasonStartYear } from "../engine/world";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";
import { lockSave, TRANSACTION_MAX_WAIT_MS, TRANSACTION_TIMEOUT_MS } from "./matchday";
import { endSpell, objectiveFor, offersStillOpen } from "./national-missions";
import { readReserves } from "./nations";
import { callUpOpen, coachSaveOf, COACH_SAVE_SELECT, currentNationalSession, nationPool, type CoachLineup } from "./national-team";

// The national coach's own moves (docs/design/selections.md § 5): accepting or declining a federation's offer, leaving
// his post between two breaks, leaving the friendlies to his assistant, his list of 23 and his lineup. Each locks the save.

/** Refusal of a move of the national coach, with what the screens say. */
export class NationalCoachError extends Error {
  constructor(
    readonly reason: "no-offer" | "expired" | "already-coach" | "not-coach" | "session" | "live" | "call-up" | "lineup",
  ) {
    super(`National coach: ${reason}`);
    this.name = "NationalCoachError";
  }
}

type Transaction = Prisma.TransactionClient;

const TRANSACTION = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS };

/**
 * The player accepts a federation's offer (« Accepter le poste »): an offer of the season, still open, while he coaches
 * no nation. His mission starts this season, with the objective of its cycle; his assistant plays the friendlies; the
 * other offers go.
 */
export async function acceptCoachOffer(saveId: string, code: NationCode): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await lockSave(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { nationCode: true, currentDate: true, cyclesFrom: true } });
      if (save.nationCode !== null) {
        throw new NationalCoachError("already-coach");
      }
      const startYear = seasonStartYear(save.currentDate);
      const offer = await tx.nationSave.findUnique({ where: { saveId_code: { saveId, code } }, select: { offeredIn: true } });
      if (offer === null || offer.offeredIn !== startYear) {
        throw new NationalCoachError("no-offer");
      }
      if (!(await offersStillOpen(tx, saveId, startYear))) {
        throw new NationalCoachError("expired");
      }
      const objective = await objectiveFor(tx, saveId, code, save.cyclesFrom, startYear);
      await tx.coachSpell.create({ data: { saveId, code, fromYear: startYear, ...objective } });
      await tx.nationSave.updateMany({ where: { saveId, offeredIn: { not: null } }, data: { offeredIn: null } });
      await tx.save.update({ where: { id: saveId }, data: { nationCode: code, nationFriendlies: true } });
    },
    TRANSACTION,
  );
}

/** « Pas maintenant »: a federation's offer withdrawn for this season; others may come at a later transition. */
export async function declineCoachOffer(saveId: string, code: NationCode): Promise<void> {
  await prisma.nationSave.updateMany({ where: { saveId, code, offeredIn: { not: null } }, data: { offeredIn: null } });
}

/** Whether the coach may leave now: no match of his waiting live, no break or tournament of his under way. */
async function assertBetweenSessions(tx: Transaction, saveId: string): Promise<void> {
  const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { ...COACH_SAVE_SELECT, liveInternationalId: true } });
  if (save.liveInternationalId !== null) {
    throw new NationalCoachError("live");
  }
  const coach = coachSaveOf(save);
  if (coach === null) {
    throw new NationalCoachError("not-coach");
  }
  const session = await currentNationalSession(tx, coach);
  if (session !== null && !callUpOpen(session)) {
    throw new NationalCoachError("session");
  }
}

/** « Quitter la sélection »: his mission ends now, between two breaks; his club goes on. */
export async function resignNationalTeam(saveId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await lockSave(tx, saveId);
      await assertBetweenSessions(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
      await endSpell(tx, saveId, seasonStartYear(save.currentDate), "RESIGNED");
    },
    TRANSACTION,
  );
}

/** « L'adjoint joue les amicaux »: his assistant plays his nation's friendlies, without a stop, or he plays them himself. */
export async function setNationFriendlies(saveId: string, delegated: boolean): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await lockSave(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { nationCode: true, liveInternationalId: true } });
      if (save.nationCode === null) {
        throw new NationalCoachError("not-coach");
      }
      if (save.liveInternationalId !== null) {
        throw new NationalCoachError("live");
      }
      await tx.save.update({ where: { id: saveId }, data: { nationFriendlies: delegated } });
    },
    TRANSACTION,
  );
}


/** Saves the coach's lineup for his nation (« Enregistrer »), refused while his match waits live. */
export async function saveCoachLineup(saveId: string, lineup: CoachLineup): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await lockSave(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { nationCode: true, liveInternationalId: true } });
      if (save.nationCode === null || !isNationCode(save.nationCode)) {
        throw new NationalCoachError("not-coach");
      }
      if (save.liveInternationalId !== null) {
        throw new NationalCoachError("live");
      }
      // Players of his nation only, of our clubs or of its reserve: a key of anyone else is refused, as the club refuses
      // a player who is not of its squad.
      const nation = nationByCode(save.nationCode);
      const pool = new Set((await nationPool(tx, saveId, nation.nationality)).map((row) => row.playerKey));
      const reserve = (await readReserves(tx, saveId)).find((row) => row.code === save.nationCode);
      for (const player of reserve?.reserve ?? []) {
        pool.add(player.key);
      }
      const keys = [...lineup.lineup.starters.map((starter) => starter.playerKey), ...lineup.lineup.benchOrder];
      if (keys.some((key) => !pool.has(key))) {
        throw new NationalCoachError("lineup");
      }
      await tx.nationSave.update({
        where: { saveId_code: { saveId, code: save.nationCode } },
        data: { lineup: JSON.parse(JSON.stringify(lineup)) as Prisma.InputJsonValue },
      });
    },
    TRANSACTION,
  );
}


/**
 * The coach's list of 23 for his next break or tournament (« Enregistrer la liste »), before its first match: 23 different
 * players of his nation, of our clubs or of its reserve, three goalkeepers at least, none injured on its first date. His
 * assistant's list goes without it, and a player of his gone by then is replaced from it (completeCallUp).
 */
export async function saveCoachCallUp(saveId: string, keys: readonly string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockSave(tx, saveId);
    const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: COACH_SAVE_SELECT });
    const coach = coachSaveOf(save);
    if (coach === null) {
      throw new NationalCoachError("not-coach");
    }
    const session = await currentNationalSession(tx, coach);
    if (session === null || !callUpOpen(session)) {
      throw new NationalCoachError("session");
    }
    const nation = nationByCode(coach.nationCode);
    const pool = await nationPool(tx, saveId, nation.nationality);
    const reserve = (await readReserves(tx, saveId)).find((row) => row.code === coach.nationCode);
    const positions = new Map([
      ...pool
        .filter((row) => row.injuredUntil === null || row.injuredUntil <= session.first)
        .map((row) => [row.playerKey, row.position] as const),
      ...(reserve?.reserve ?? []).map((player) => [player.key, player.position] as const),
    ]);
    const unique = new Set(keys);
    const goalkeepers = keys.filter((key) => positions.get(key) === "GK").length;
    if (keys.length !== CALL_UP_SIZE || unique.size !== CALL_UP_SIZE || keys.some((key) => !positions.has(key)) || goalkeepers < CALL_UP_BY_GROUP.GK) {
      throw new NationalCoachError("call-up");
    }
    await tx.nationSave.update({
      where: { saveId_code: { saveId, code: coach.nationCode } },
      data: { callUp: { date: session.first.toISOString().slice(0, 10), keys: [...keys] } },
    });
  }, TRANSACTION);
}

