import * as z from "zod";
import {
  CONTRACT_CHOICES,
  contractForecasts,
  importantPlayers,
  type ContractChoice,
  type ContractForecast,
  type ManagedRosterPlayer,
} from "../engine/assistant-contracts";
import { SQUAD_LIMIT, SQUAD_ROLES } from "../engine/balance";
import type { Formation } from "../engine/lineup";
import { POSITIONS, type Position } from "../engine/positions";
import { roleIndex } from "../engine/squad-ai";
import { seasonEndDate, seasonStartDate, seasonStartYear } from "../engine/world";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

// The managed club's contracts ending on 30 June (docs/design/simplification.md § 2): its player's choice for each, what
// the season's turn will do with them as the screens tell it ahead, and what the turn did, kept for the season's start.

type Db = PrismaClient | Prisma.TransactionClient;

const TRANSACTION = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: 10_000 };

export const contractChoiceSchema = z.enum(CONTRACT_CHOICES);

/** A stored choice (PlayerSave.contractChoice), validated: anything else reads as none, the rule's. */
export function contractChoiceOf(value: string | null): ContractChoice | null {
  const parsed = contractChoiceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ------------------------------------------------------------------ The player's choice

export const contractChoiceInputSchema = z.object({
  saveId: z.string().min(1),
  playerSaveId: z.string().min(1),
  choice: contractChoiceSchema.nullable(), // null: his assistant decides, or, when his player keeps the contracts, he leaves free
});

export type ContractChoiceInput = z.input<typeof contractChoiceInputSchema>;

/** A choice written, with who decides the contracts without one (Save.contractsByAssistant); or refused. */
export type ContractChoiceOutcome = { ok: true; byAssistant: boolean } | { ok: false };

/**
 * The player's choice for a contract of his club ending with the season in progress (§ 2.3), applied at the season's turn
 * (src/db/preseason.ts): RENEW, LEAVE, or null to leave it to the rule. At any date, transfer window open or closed, in a
 * small transaction of its own, the save locked as a matchday locks it. Refused for anyone but a player of the managed
 * club whose contract ends on the coming 30 June.
 */
export async function setContractChoice(input: ContractChoiceInput): Promise<ContractChoiceOutcome> {
  const { saveId, playerSaveId, choice } = contractChoiceInputSchema.parse(input);
  return prisma.$transaction(async (tx): Promise<ContractChoiceOutcome> => {
    // The save's row locked until the transaction ends (lockSave, src/db/matchday.ts): a choice and a turn never cross.
    await tx.$queryRaw`SELECT "id" FROM "Save" WHERE "id" = ${saveId} FOR UPDATE`;
    const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, contractsByAssistant: true } });
    const club = await tx.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    const lastContractDay = seasonEndDate(seasonStartYear(save.currentDate));
    const { count } = await tx.playerSave.updateMany({
      where: { id: playerSaveId, saveId, clubSaveId: club.id, contractUntil: { lte: lastContractDay } },
      data: { contractChoice: choice },
    });
    return count === 1 ? { ok: true, byAssistant: save.contractsByAssistant } : { ok: false };
  }, TRANSACTION);
}

// ------------------------------------------------------------------ What the turn will do

/** What the rule reads of a player of the managed club. */
export const CONTRACT_RULE_SELECT = {
  playerKey: true,
  position: true,
  birthDate: true,
  overall: true,
  potential: true,
  wage: true,
  contractUntil: true,
  contractChoice: true,
} as const;

export type ContractRuleRow = {
  playerKey: string;
  position: Position;
  birthDate: Date;
  overall: number;
  potential: number;
  wage: number;
  contractUntil: Date | null;
  contractChoice: string | null;
};

/** The save's free agents by squad role, in SQUAD_ROLES' order: who could replace a player let go. */
export async function freeAgentsByRole(db: Db, saveId: string): Promise<number[]> {
  const rows = await db.playerSave.groupBy({
    by: ["position"],
    where: { saveId, clubSaveId: null, retired: false },
    _count: { _all: true },
  });
  const counts = SQUAD_ROLES.map(() => 0);
  for (const row of rows) {
    counts[roleIndex(row.position)] += row._count._all;
  }
  return counts;
}

/**
 * The managed club's players as its next turn will weigh them, by player key: their age on its day, the next 1 July, their
 * contracts ending on the coming 30 June, their player's choices. Their ratings are today's: the turn's come after a season
 * of progress, which no screen knows ahead.
 */
function rosterOf(rows: readonly ContractRuleRow[], startYear: number): ManagedRosterPlayer[] {
  const turn = seasonStartDate(startYear + 1);
  const lastContractDay = seasonEndDate(startYear);
  return rows.map((row) => ({
    id: row.playerKey,
    position: row.position,
    age: ageInYears(row.birthDate, turn),
    overall: row.overall,
    potential: row.potential,
    wage: row.wage,
    contractExpiring: row.contractUntil !== null && row.contractUntil <= lastContractDay,
    choice: contractChoiceOf(row.contractChoice),
  }));
}

/**
 * What the next turn will do with each contract of the managed club ending on 30 June, by player key (contractForecasts),
 * from its whole squad (`rows`) and the free agents of today; none read without such a contract.
 */
export async function forecastContracts(
  db: Db,
  saveId: string,
  rows: readonly ContractRuleRow[],
  { startYear, byAssistant }: { startYear: number; byAssistant: boolean },
): Promise<Map<string, ContractForecast>> {
  const roster = rosterOf(rows, startYear);
  if (!roster.some((player) => player.contractExpiring)) {
    return new Map();
  }
  return contractForecasts(roster, await freeAgentsByRole(db, saveId), byAssistant);
}

/** forecastContracts on the managed club's squad, read here: a player's sheet, which shows one of them. */
export async function managedContractForecasts(
  saveId: string,
  options: { startYear: number; byAssistant: boolean },
): Promise<Map<string, ContractForecast>> {
  const club = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const rows = await prisma.playerSave.findMany({ where: { saveId, clubSaveId: club.id }, select: CONTRACT_RULE_SELECT });
  return forecastContracts(prisma, saveId, rows, options);
}

/**
 * The important players (importantPlayers, in the club's formation) whose contract ends on the coming 30 June and whom the
 * assistant means to let go (§ 2.2, point 5 of § 13): his rule does not keep them, and their player chose nothing. By
 * player key; none when the player keeps the contracts.
 */
export async function importantDepartures(
  saveId: string,
  rows: readonly ContractRuleRow[],
  { startYear, formation }: { startYear: number; formation: Formation },
): Promise<Set<string>> {
  const forecasts = await forecastContracts(prisma, saveId, rows, { startYear, byAssistant: true });
  const leaving = [...forecasts].flatMap(([key, { outcome }]) => (outcome.intention === "leave" && outcome.by === "assistant" ? [key] : []));
  if (leaving.length === 0) {
    return new Set();
  }
  const important = importantPlayers(
    rows.map((row) => ({ id: row.playerKey, position: row.position, overall: row.overall })),
    formation,
  );
  return new Set(leaving.filter((key) => important.has(key)));
}

// ------------------------------------------------------------------ What the turn did

const movedPlayerSchema = z.object({ id: z.string().min(1), firstName: z.string(), lastName: z.string() });

/**
 * What a season's turn did to the managed club's squad (SeasonBudget.contractMoves, on the season it opens): the contracts
 * renewed, with their new end and who decided, the players gone free and who decided, the free agents its assistant
 * signed and their bonuses, the young players come from its academy, and the squad it left. byAssistant: whether its
 * assistant took care of the contracts then.
 */
export const contractMovesSchema = z.object({
  byAssistant: z.boolean(),
  renewed: z.array(movedPlayerSchema.extend({ until: z.iso.datetime(), by: z.enum(["player", "assistant"]) })),
  left: z.array(movedPlayerSchema.extend({ by: z.enum(["player", "assistant", "default"]) })),
  signed: z.array(movedPlayerSchema.extend({ position: z.enum(POSITIONS), bonus: z.number().int().min(0) })),
  youths: z.number().int().min(0),
  squad: z.number().int().min(0),
});

export type ContractMoves = z.infer<typeof contractMovesSchema>;

/** A season's moves as stored, validated: null for a season opened without them (a save's first, one from before them). */
export function parseContractMoves(value: unknown): ContractMoves | null {
  const parsed = contractMovesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Keeps a turn's moves on the season it opens, its dotation's row (recordDotation, written just before). */
export async function recordContractMoves(tx: Prisma.TransactionClient, saveId: string, seasonId: string, moves: ContractMoves): Promise<void> {
  await tx.seasonBudget.updateMany({ where: { saveId, seasonId }, data: { contractMoves: moves } });
}

/** « K. Morel »: a player of the turn's moves as the season's start names him. */
const shortName = ({ firstName, lastName }: { firstName: string; lastName: string }): string => `${firstName.charAt(0)}. ${lastName}`;

/** What the season's start shows of the turn that opened the season: its moves, in the order they were decided. */
export type ContractMovesView = {
  byAssistant: boolean;
  renewed: { name: string; until: Date }[];
  left: { name: string }[];
  signed: { name: string; position: Position; bonus: number }[]; // bonus: euros, paid out of the budget
  youths: number;
  squad: number; // players under contract once the turn was over
  limit: number; // SQUAD_LIMIT
};

/** The moves of the turn that opened the save's season in progress; null for a save's first season, or one from before them. */
export async function getSeasonContractMoves(saveId: string): Promise<ContractMovesView | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const row = await prisma.seasonBudget.findFirst({
    where: { saveId, season: { startYear: seasonStartYear(save.currentDate) } },
    select: { contractMoves: true },
  });
  const moves = parseContractMoves(row?.contractMoves ?? null);
  if (moves === null) {
    return null;
  }
  return {
    byAssistant: moves.byAssistant,
    renewed: moves.renewed.map((player) => ({ name: shortName(player), until: new Date(player.until) })),
    left: moves.left.map((player) => ({ name: shortName(player) })),
    signed: moves.signed.map((player) => ({ name: shortName(player), position: player.position, bonus: player.bonus })),
    youths: moves.youths,
    squad: moves.squad,
    limit: SQUAD_LIMIT,
  };
}
