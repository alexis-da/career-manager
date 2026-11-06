import * as z from "zod";
import { cache } from "react";
import { DEFAULT_FORMATION_NAME, FORMATION_NAMES, type FormationName } from "../engine/formations";
import type { AttributeName } from "../engine/generation";
import { DEFAULT_INSTRUCTION, INSTRUCTIONS, type Instruction } from "../engine/instructions";
import { BENCH_SIZE, isAvailable, resolveLineup, type Lineup, type LineupCandidate, type SavedLineup } from "../engine/lineup";
import { competitionTier, type CompetitionTier } from "../engine/tiers";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { DISCIPLINE_SELECT, disciplineStatus, type DisciplineStatus } from "./discipline-view";
import { fitnessAtKickOff } from "./fitness-view";
import { managedMatchesAhead } from "./players";

export const formationSchema = z.enum(FORMATION_NAMES);

const SLOT_COUNT = 11;

/**
 * Shape of ClubSave.lineup. On read, a player saved twice is left to resolveLineup, which keeps the first slot;
 * anything else malformed counts as no saved lineup. The starting instruction is absent from a lineup saved before it
 * was asked: Équilibré.
 */
export const savedLineupSchema = z.object({
  starters: z
    .array(z.object({ slot: z.number().int().min(0).max(SLOT_COUNT - 1), playerKey: z.string().min(1).max(100) }))
    .max(SLOT_COUNT),
  benchOrder: z.array(z.string().min(1).max(100)).max(BENCH_SIZE),
  instruction: z.enum(INSTRUCTIONS).optional(),
});

/** Why a well-formed lineup is refused: the message of its Zod issue, a code the action words for the manager. */
export const LINEUP_ISSUES = ["incomplete", "duplicate-slot", "duplicate-player"] as const;

export type LineupIssue = (typeof LINEUP_ISSUES)[number];

/** A lineup sent by the manager: the stored shape, all 11 slots filled, each slot and each player once. */
export const lineupInputSchema = z
  .object({ formation: formationSchema, lineup: savedLineupSchema })
  .refine(({ lineup }) => lineup.starters.length === SLOT_COUNT, { message: "incomplete" satisfies LineupIssue })
  .refine(({ lineup }) => new Set(lineup.starters.map((starter) => starter.slot)).size === lineup.starters.length, {
    message: "duplicate-slot" satisfies LineupIssue,
  })
  .refine(
    ({ lineup }) => {
      const keys = [...lineup.starters.map((starter) => starter.playerKey), ...lineup.benchOrder];
      return new Set(keys).size === keys.length;
    },
    { message: "duplicate-player" satisfies LineupIssue },
  );

export type LineupInput = z.output<typeof lineupInputSchema>;

/** The first issue of a refused lineup, null when it is malformed rather than one of LINEUP_ISSUES. */
export function lineupIssueOf(error: z.ZodError): LineupIssue | null {
  const message = error.issues[0]?.message;
  return LINEUP_ISSUES.find((issue) => issue === message) ?? null;
}

export function parseFormation(value: string): FormationName {
  const parsed = formationSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_FORMATION_NAME;
}

export function parseSavedLineup(value: unknown): SavedLineup | null {
  const parsed = savedLineupSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A player on a pitch: the managed club's before its next match or at a break, or an opponent's. */
export type LineupPlayer = LineupCandidate & {
  firstName: string;
  lastName: string;
  age: number; // at the save's current date
  injuredUntil: Date | null;
  fitness: number; // 0–100 at the match's kick-off, as injuries are judged on its day: today's, rested until then
  form: number; // 1–99, 50 neutral
  // His suspensions and yellow cards at risk: a player of the managed club's before its next match only, none at a break
  // or for an opponent. `suspended` (LineupCandidate) is its own, the one the lineups read.
  discipline?: DisciplineStatus;
};

/** A player of the managed club before its next match: out of it when injured or suspended for it (isAvailable). */
export type ClubLineupPlayer = LineupPlayer & {
  suspended: boolean; // for the next match, whose competition decides: discipline.suspended
  discipline: DisciplineStatus;
};

/**
 * A player of the managed club in its lineup editor, with what the engine weighs him by: his attributes, form, morale and
 * fitness. The screen computes its eleven's strength with the engine's own functions (src/engine/strength.ts).
 */
export type EditorPlayer = ClubLineupPlayer & Record<AttributeName, number> & { morale: number };

export type LineupEditor = {
  formation: FormationName;
  saved: SavedLineup | null;
  instruction: Instruction; // the starting instruction saved with the lineup, Équilibré without one
  matchDate: Date; // the next match of the managed club, or the current date: injuries are judged on that day
  clubColors: ClubColors;
  tier: CompetitionTier; // its division: the formations are ranked for its squad against that division's average opponent
  players: EditorPlayer[];
};

export type ManagedLineup = {
  formation: FormationName;
  lineup: Lineup<ClubLineupPlayer>;
  // Saved starters who will miss the next match, injured or suspended (each says which): still of the eleven they come
  // back to.
  missingStarters: ClubLineupPlayer[];
};

const managedClub = (saveId: string) =>
  prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: {
      id: true,
      formation: true,
      lineup: true,
      club: { select: { primaryColor: true, secondaryColor: true } },
      competition: { select: { tier: true } },
    },
  });

/**
 * Everything the lineup page needs: formation, saved lineup, and the squad with injuries and fitness on the next match day,
 * suspensions for its competition.
 */
export async function getLineupEditor(saveId: string): Promise<LineupEditor> {
  const [save, club] = await Promise.all([
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
    managedClub(saveId),
  ]);
  const [ahead, rows] = await Promise.all([
    managedMatchesAhead(saveId, club.id),
    prisma.playerSave.findMany({
      where: { saveId, clubSaveId: club.id },
      orderBy: { playerKey: "asc" },
      select: {
        playerKey: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        position: true,
        overall: true,
        pace: true,
        shooting: true,
        passing: true,
        dribbling: true,
        defending: true,
        physical: true,
        goalkeeping: true,
        form: true,
        morale: true,
        injuredUntil: true,
        fitness: true,
        ...DISCIPLINE_SELECT,
      },
    }),
  ]);
  const matchDate = ahead.next?.date ?? save.currentDate;
  const saved = parseSavedLineup(club.lineup);

  return {
    formation: parseFormation(club.formation),
    saved,
    instruction: saved?.instruction ?? DEFAULT_INSTRUCTION,
    matchDate,
    clubColors: clubColorsOf(club.club),
    tier: competitionTier(club.competition.tier),
    players: rows.map((row) => {
      const discipline = disciplineStatus(row, ahead);
      return {
        id: row.playerKey,
        firstName: row.firstName,
        lastName: row.lastName,
        position: row.position,
        overall: row.overall,
        pace: row.pace,
        shooting: row.shooting,
        passing: row.passing,
        dribbling: row.dribbling,
        defending: row.defending,
        physical: row.physical,
        goalkeeping: row.goalkeeping,
        form: row.form,
        morale: row.morale,
        injuredUntil: row.injuredUntil,
        age: ageInYears(row.birthDate, save.currentDate),
        // Same rule as the matchday: a player is out while his injury runs past the match day.
        injured: row.injuredUntil !== null && row.injuredUntil > matchDate,
        // And while suspended for the match's competition (withSuspensions): out of the lineups, as an injured player.
        suspended: discipline.suspended,
        // What he will start the match with: the days until then are rest.
        fitness: fitnessAtKickOff(row.fitness, save.currentDate, matchDate),
        discipline,
      };
    }),
  };
}

/**
 * The lineup the managed club will field in its next match, and the saved starters it has to do without. Read once per
 * request (React's cache: the market's buy tab asks for it twice, its sales and its proposals); outside a server render,
 * in tests and scripts, every call reads.
 */
export const getManagedLineup = cache(async (saveId: string): Promise<ManagedLineup> => {
  const editor = await getLineupEditor(saveId);
  const byKey = new Map(editor.players.map((player) => [player.id, player]));
  return {
    formation: editor.formation,
    lineup: resolveLineup(editor.formation, editor.saved, editor.players),
    missingStarters: (editor.saved?.starters ?? []).flatMap(({ playerKey }) => {
      const player = byKey.get(playerKey);
      return player !== undefined && !isAvailable(player) ? [player] : [];
    }),
  };
});

export class LineupPlayerNotInSquadError extends Error {
  constructor(playerKey: string) {
    super(`Player ${playerKey} is not in the managed club's squad`);
  }
}

/** Saves the managed club's formation and lineup; every player must belong to its squad. */
export async function saveManagedLineup(saveId: string, input: LineupInput): Promise<void> {
  const club = await managedClub(saveId);
  const squad = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: club.id },
    select: { playerKey: true },
  });
  const keys = new Set(squad.map((player) => player.playerKey));
  for (const playerKey of [...input.lineup.starters.map((starter) => starter.playerKey), ...input.lineup.benchOrder]) {
    if (!keys.has(playerKey)) {
      throw new LineupPlayerNotInSquadError(playerKey);
    }
  }
  await prisma.clubSave.updateMany({
    where: { id: club.id, saveId },
    data: { formation: input.formation, lineup: input.lineup },
  });
}
