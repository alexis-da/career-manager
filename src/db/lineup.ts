import * as z from "zod";
import { DEFAULT_FORMATION_NAME, FORMATION_NAMES, type FormationName } from "../engine/formations";
import { BENCH_SIZE, resolveLineup, type Lineup, type LineupCandidate, type SavedLineup } from "../engine/lineup";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { fitnessAtKickOff } from "./fitness-view";

export const formationSchema = z.enum(FORMATION_NAMES);

const SLOT_COUNT = 11;

/**
 * Shape of ClubSave.lineup. On read, a player saved twice is left to resolveLineup, which keeps the first slot;
 * anything else malformed counts as no saved lineup.
 */
export const savedLineupSchema = z.object({
  starters: z
    .array(z.object({ slot: z.number().int().min(0).max(SLOT_COUNT - 1), playerKey: z.string().min(1).max(100) }))
    .max(SLOT_COUNT),
  benchOrder: z.array(z.string().min(1).max(100)).max(BENCH_SIZE),
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

export type LineupPlayer = LineupCandidate & {
  firstName: string;
  lastName: string;
  age: number; // at the save's current date
  injuredUntil: Date | null;
  fitness: number; // 0–100 at the match's kick-off, as injuries are judged on its day: today's, rested until then
};

export type LineupEditor = {
  formation: FormationName;
  saved: SavedLineup | null;
  matchDate: Date; // the next match of the managed club, or the current date: injuries are judged on that day
  clubColors: ClubColors;
  players: LineupPlayer[];
};

export type ManagedLineup = {
  formation: FormationName;
  lineup: Lineup<LineupPlayer>;
  injuredStarters: LineupPlayer[]; // saved starters who will miss the next match
};

const managedClub = (saveId: string) =>
  prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: {
      id: true,
      formation: true,
      lineup: true,
      club: { select: { primaryColor: true, secondaryColor: true } },
    },
  });

/** Everything the lineup page needs: formation, saved lineup, and the squad with injuries and fitness on the next match day. */
export async function getLineupEditor(saveId: string): Promise<LineupEditor> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const club = await managedClub(saveId);
  const next = await prisma.fixture.findFirst({
    where: { saveId, played: false, OR: [{ homeClubSaveId: club.id }, { awayClubSaveId: club.id }] },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });
  const matchDate = next?.scheduledAt ?? save.currentDate;
  const rows = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: club.id },
    orderBy: { playerKey: "asc" },
    select: {
      playerKey: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      position: true,
      overall: true,
      injuredUntil: true,
      fitness: true,
    },
  });

  return {
    formation: parseFormation(club.formation),
    saved: parseSavedLineup(club.lineup),
    matchDate,
    clubColors: clubColorsOf(club.club),
    players: rows.map(({ playerKey, birthDate, fitness, ...row }) => ({
      ...row,
      id: playerKey,
      age: ageInYears(birthDate, save.currentDate),
      // Same rule as the matchday: a player is out while his injury runs past the match day.
      injured: row.injuredUntil !== null && row.injuredUntil > matchDate,
      // What he will start the match with: the days until then are rest.
      fitness: fitnessAtKickOff(fitness, save.currentDate, matchDate),
    })),
  };
}

/** The lineup the managed club will field in its next match, and the saved starters it has to do without. */
export async function getManagedLineup(saveId: string): Promise<ManagedLineup> {
  const editor = await getLineupEditor(saveId);
  const byKey = new Map(editor.players.map((player) => [player.id, player]));
  return {
    formation: editor.formation,
    lineup: resolveLineup(editor.formation, editor.saved, editor.players),
    injuredStarters: (editor.saved?.starters ?? []).flatMap(({ playerKey }) => {
      const player = byKey.get(playerKey);
      return player?.injured === true ? [player] : [];
    }),
  };
}

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
