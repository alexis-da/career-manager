import * as z from "zod";
import { YOUTH_ENTRY_MAX_TARGETS } from "../engine/balance";
import { seasonStartDate, seasonStartYear } from "../engine/world";
import { canBeLaunched, keptYouthLaunches, type LaunchCandidate } from "../engine/youth-launches";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { lockSave } from "./matchday";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

// The young players the manager marks « Le lancer » (Save.youthLaunches, docs/design/effectif-adjoint.md § 9): written by
// his sheet and the squad's « Jeunes » view, read by « Lancer les jeunes » (assistantYouthOf), and the marks that no
// longer hold dropped: at a sale or a release, at the season's turn, and whenever the list is written.

type Db = PrismaClient | Prisma.TransactionClient;

const TRANSACTION = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: 10_000 };

/** A player of the managed club as the marks read him: PlayerSave.id, position, age on 1 July of the season. */
type LaunchSquadPlayer = LaunchCandidate & { playerSaveId: string };

/** The managed club's players, by key, as the marks read them on 1 July of a season. */
async function launchSquad(db: Db, saveId: string, startYear: number): Promise<Map<string, LaunchSquadPlayer>> {
  const club = await db.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const players = await db.playerSave.findMany({
    where: { saveId, clubSaveId: club.id },
    select: { id: true, playerKey: true, position: true, birthDate: true },
  });
  const firstDay = seasonStartDate(startYear);
  return new Map(
    players.map((player) => [
      player.playerKey,
      { playerSaveId: player.id, position: player.position, seasonAge: ageInYears(player.birthDate, firstDay) },
    ]),
  );
}

/** Whether two lists of marks are the same, in the same order. */
const sameMarks = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((key, index) => key === b[index]);

/**
 * The marks of a save as they hold on its current date (keptYouthLaunches against its squad and season): what the screens
 * show and the assistant reads; nothing written.
 */
export async function readYouthLaunches(db: Db, saveId: string): Promise<string[]> {
  const save = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, youthLaunches: true } });
  if (save.youthLaunches.length === 0) {
    return [];
  }
  return keptYouthLaunches(save.youthLaunches, await launchSquad(db, saveId, seasonStartYear(save.currentDate)));
}

/**
 * At the season's turn (runPreseasonInTransaction, its squad settled): the marks of players gone, or past the age on the
 * new season's 1 July, drop out of the list. One read without any mark.
 */
export async function keepValidYouthLaunches(tx: Prisma.TransactionClient, saveId: string, startYear: number): Promise<void> {
  const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { youthLaunches: true } });
  if (save.youthLaunches.length === 0) {
    return;
  }
  const kept = keptYouthLaunches(save.youthLaunches, await launchSquad(tx, saveId, startYear));
  if (!sameMarks(kept, save.youthLaunches)) {
    await tx.save.update({ where: { id: saveId }, data: { youthLaunches: kept } });
  }
}

/** A player leaving the managed club, sold or released: his mark goes, in one statement, none written without it. */
export async function forgetYouthLaunch(tx: Prisma.TransactionClient, saveId: string, playerKey: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Save" SET "youthLaunches" = array_remove("youthLaunches", ${playerKey})
    WHERE "id" = ${saveId} AND ${playerKey} = ANY("youthLaunches")`;
}

export const youthLaunchInputSchema = z.object({
  saveId: z.string().min(1),
  playerSaveId: z.string().min(1),
  launch: z.boolean(), // « Le lancer », or « Ne plus le lancer »
});

export type YouthLaunchInput = z.input<typeof youthLaunchInputSchema>;

/** The marks once written (the player's included or not), or why not: a player who cannot be marked, or three already. */
export type YouthLaunchOutcome = { ok: true; launches: string[] } | { ok: false; reason: "not-eligible" | "full" };

/**
 * « Le lancer » / « Ne plus le lancer » on a player of the managed club: at any date, in a small transaction of its own,
 * the save locked as a matchday locks it, the list cleaned of the marks that no longer hold (keptYouthLaunches) as it is
 * written. Marking is refused for a player who cannot be (canBeLaunched: an outfield player of the club, 21 or younger on
 * 1 July) and beyond YOUTH_ENTRY_MAX_TARGETS; a mark taken off is never refused.
 */
export async function setYouthLaunch(input: YouthLaunchInput): Promise<YouthLaunchOutcome> {
  const { saveId, playerSaveId, launch } = youthLaunchInputSchema.parse(input);
  return prisma.$transaction(async (tx): Promise<YouthLaunchOutcome> => {
    // The save locked until the transaction ends, as a matchday locks it: a mark and a matchday never cross.
    await lockSave(tx, saveId);
    const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, youthLaunches: true } });
    const squad = await launchSquad(tx, saveId, seasonStartYear(save.currentDate));
    const kept = keptYouthLaunches(save.youthLaunches, squad);
    const key = [...squad].find(([, player]) => player.playerSaveId === playerSaveId)?.[0];
    let launches = kept.filter((mark) => mark !== key);
    if (launch) {
      const player = key === undefined ? undefined : squad.get(key);
      if (key === undefined || player === undefined || !canBeLaunched(player)) {
        return { ok: false, reason: "not-eligible" };
      }
      if (!kept.includes(key)) {
        if (kept.length >= YOUTH_ENTRY_MAX_TARGETS) {
          return { ok: false, reason: "full" };
        }
        launches = [...kept, key];
      } else {
        launches = kept;
      }
    }
    if (!sameMarks(launches, save.youthLaunches)) {
      await tx.save.update({ where: { id: saveId }, data: { youthLaunches: launches } });
    }
    return { ok: true, launches };
  }, TRANSACTION);
}
