import * as z from "zod";
import { cache } from "react";
import { DEFAULT_FORMATION_NAME, FORMATION_NAMES, formationPositions, type FormationName } from "../engine/formations";
import type { AttributeName } from "../engine/generation";
import { DEFAULT_INSTRUCTION, INSTRUCTIONS, type Instruction } from "../engine/instructions";
import { FULL_FITNESS } from "../engine/balance";
import {
  BENCH_SIZE,
  isAvailable,
  managedLineup,
  selectAssistantLineup,
  selectLineup,
  youthCandidate,
  type Lineup,
  type LineupCandidate,
  type SavedLineup,
  type YouthStarter,
} from "../engine/lineup";
import { assistantObjective, OPTIONAL_OBJECTIVES, type OptionalObjective } from "../engine/objectives";
import { competitionTier, type CompetitionTier } from "../engine/tiers";
import { seasonStartDate, seasonStartYear } from "../engine/world";
import { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";
import { DISCIPLINE_SELECT, disciplineStatus, type DisciplineStatus } from "./discipline-view";
import { fitnessAtKickOff } from "./fitness-view";
import { managedMatchesAhead } from "./players";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

type Db = Prisma.TransactionClient | typeof prisma;

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

/**
 * What the editor sending a line-up believes is saved (docs/design/effectif-adjoint.md § 1.5): the formation, the
 * saved line-up as it read it, and for a club who made it then. The save compares it with what is saved, so that a line-up
 * changed in another tab is never overwritten unseen.
 */
export const expectedLineupSchema = z.object({
  formation: formationSchema,
  lineup: savedLineupSchema.nullable(),
  byAssistant: z.boolean().optional(),
});

export type ExpectedLineup = z.output<typeof expectedLineupSchema>;

/**
 * A lineup sent by the manager: the stored shape, all 11 slots filled, each slot and each player once; with what the
 * editor believes saved, the save is refused when it is not (`conflict`).
 */
export const lineupInputSchema = z
  .object({ formation: formationSchema, lineup: savedLineupSchema, expected: expectedLineupSchema.optional() })
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

/**
 * Who makes the managed club's line-up (docs/design/simplification.md § 3.3): the career's setting once it has one
 * (Save.lineupByAssistant: true at a new career's creation, or the player's choice); for a career from before it, the
 * player while his club has a line-up saved with its starters, the assistant otherwise: a line-up he saved stays his.
 */
export function lineupByAssistantOf(setting: boolean | null, savedLineup: unknown): boolean {
  if (setting !== null) {
    return setting;
  }
  const saved = parseSavedLineup(savedLineup);
  return saved === null || saved.starters.length === 0;
}

/** A league season of the managed club: by its id, or by its competition and first year. */
export type LeagueSeasonRef = { id: string } | { competitionId: string; startYear: number };

const isOptional = (kind: string): kind is OptionalObjective => (OPTIONAL_OBJECTIVES as readonly string[]).includes(kind);

/**
 * The Jeunesse objective's young player of a league match of the managed club (docs/design/simplification.md § 3.5): the
 * candidate given (youthCandidate, among its players), with his league starts of the season so far, when that season's
 * optional objective is Jeunesse: the one chosen, or before the season's first match, while none is, the one its
 * assistant will choose then (assistantObjective, ensureObjectiveChosen), so that the screens show the eleven the match
 * plays; null otherwise. One read, the season's optional objectives and his starts together.
 */
export async function readYouthStarter(
  db: Db,
  saveId: string,
  season: LeagueSeasonRef,
  candidate: { id: string; playerSaveId: string },
): Promise<YouthStarter | null> {
  const seasonId =
    "id" in season
      ? Prisma.sql`${season.id}`
      : Prisma.sql`(SELECT "id" FROM "Season"
          WHERE "saveId" = ${saveId} AND "competitionId" = ${season.competitionId} AND "startYear" = ${season.startYear})`;
  const rows = await db.$queryRaw<{ kind: string; chosen: boolean; starts: number }[]>`
    SELECT o."kind"::text AS "kind", o."chosen", COALESCE(s."starts", 0)::int AS "starts"
    FROM "SeasonObjective" o
    LEFT JOIN "PlayerSeasonStats" s
      ON s."saveId" = o."saveId" AND s."seasonId" = o."seasonId" AND s."playerSaveId" = ${candidate.playerSaveId}
    WHERE o."saveId" = ${saveId} AND o."seasonId" = ${seasonId} AND NOT o."imposed"`;
  const proposed = rows.flatMap(({ kind }) => (isOptional(kind) ? [kind] : []));
  if (proposed.length === 0) {
    return null; // a save from before the objectives
  }
  const objective = rows.find((row) => row.chosen)?.kind ?? assistantObjective(proposed);
  return objective === "YOUTH" ? { id: candidate.id, leagueStarts: rows[0].starts } : null;
}

/**
 * The Jeunesse objective's young player for a league match of the managed club whose assistant makes the line-up, from
 * its players (their key, PlayerSave.id, rating and birth date): youthCandidate on their age on 1 July of the season,
 * then readYouthStarter. Nothing read without a player young enough.
 */
export async function youthStarterOf(
  db: Db,
  saveId: string,
  season: LeagueSeasonRef & { startYear: number },
  players: readonly { id: string; playerSaveId: string; overall: number; birthDate: Date }[],
): Promise<YouthStarter | null> {
  const firstDay = seasonStartDate(season.startYear);
  const candidate = youthCandidate(players.map((player) => ({ ...player, seasonAge: ageInYears(player.birthDate, firstDay) })));
  return candidate === null ? null : readYouthStarter(db, saveId, season, candidate);
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
  // A club's (docs/design/simplification.md § 3): whether its assistant makes its line-up before each match, the saved
  // one then unread; and, when he does, the Jeunesse objective's young player his eleven of the next match starts (§ 3.5),
  // null without. A nation's editor has neither: its coach's line-up is his own, saved, or his assistant's while none is.
  byAssistant?: boolean;
  youth?: YouthStarter | null;
};

export type ManagedLineup = {
  formation: FormationName;
  byAssistant: boolean; // its assistant makes its line-up (§ 3.1)
  // The eleven it fields in its next match: its assistant's (managedLineup), or its player's saved one, completed.
  lineup: Lineup<ClubLineupPlayer>;
  // The player's saved starters who will miss the next match, injured or suspended (each says which): still of the eleven
  // they come back to. None when the assistant makes the line-up: he replaces or rests them himself.
  missingStarters: ClubLineupPlayer[];
  // The eleven the market's weak spot is read on (§ 3.4): the player's line-up as it is fielded; the assistant's way, the
  // best available player at each slot, as without a saved line-up before him (selectLineup: nobody rested, no Jeunesse).
  weakSpotLineup: Lineup<ClubLineupPlayer>;
  // The players kept off the sales list (getMarketSales), by key: the player's eleven, his saved starters out of the next
  // match included; the assistant's way, his eleven with the whole squad available and fresh (§ 3.4), an injured starter
  // with it, and the Jeunesse objective's young player who starts (§ 3.5), the starter he replaces then on the bench.
  keptOffSales: string[];
};

const managedClub = (saveId: string) =>
  prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: {
      id: true,
      competitionId: true,
      formation: true,
      lineup: true,
      club: { select: { primaryColor: true, secondaryColor: true } },
      competition: { select: { tier: true } },
    },
  });

/**
 * Everything the lineup page needs: formation, saved lineup, and the squad with injuries and fitness on the next match day,
 * suspensions for its competition; who makes the line-up, and the Jeunesse objective's young player of its assistant's
 * eleven when the next match is a league one.
 */
export async function getLineupEditor(saveId: string): Promise<LineupEditor> {
  const [save, club] = await Promise.all([
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, lineupByAssistant: true } }),
    managedClub(saveId),
  ]);
  const [ahead, rows] = await Promise.all([
    managedMatchesAhead(saveId, club.id),
    prisma.playerSave.findMany({
      where: { saveId, clubSaveId: club.id },
      orderBy: { playerKey: "asc" },
      select: {
        id: true,
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
  const byAssistant = lineupByAssistantOf(save.lineupByAssistant, club.lineup);
  // The assistant's eleven of a league match: the Jeunesse objective's young player, as the matchday reads him.
  const youth =
    byAssistant && ahead.next?.competition === "LEAGUE"
      ? await youthStarterOf(
          prisma,
          saveId,
          { competitionId: club.competitionId, startYear: seasonStartYear(ahead.next.date) },
          rows.map((row) => ({ id: row.playerKey, playerSaveId: row.id, overall: row.overall, birthDate: row.birthDate })),
        )
      : null;

  return {
    formation: parseFormation(club.formation),
    saved,
    instruction: saved?.instruction ?? DEFAULT_INSTRUCTION,
    matchDate,
    clubColors: clubColorsOf(club.club),
    tier: competitionTier(club.competition.tier),
    byAssistant,
    youth,
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
 * The lineup the managed club will field in its next match (managedLineup: its assistant's eleven, or its player's saved
 * line-up), the saved starters it has to do without, and the elevens its weak spot and its sales are read on. Read once
 * per request (React's cache: the market's buy tab asks for it twice, its sales and its proposals); outside a server
 * render, in tests and scripts, every call reads.
 */
export const getManagedLineup = cache(async (saveId: string): Promise<ManagedLineup> => {
  const editor = await getLineupEditor(saveId);
  const byAssistant = editor.byAssistant === true;
  const lineup = managedLineup(editor.formation, editor.saved, editor.players, byAssistant ? { youth: editor.youth ?? null } : null);
  if (byAssistant) {
    const positions = formationPositions(editor.formation);
    const everyone = editor.players.map((player) => ({ ...player, injured: false, suspended: false, fitness: FULL_FITNESS }));
    return {
      formation: editor.formation,
      byAssistant,
      lineup,
      missingStarters: [],
      weakSpotLineup: selectLineup(editor.players, positions),
      keptOffSales: selectAssistantLineup(everyone, positions, editor.youth ?? null).starters.map(({ player }) => player.id),
    };
  }
  const byKey = new Map(editor.players.map((player) => [player.id, player]));
  const missingStarters = (editor.saved?.starters ?? []).flatMap(({ playerKey }) => {
    const player = byKey.get(playerKey);
    return player !== undefined && !isAvailable(player) ? [player] : [];
  });
  return {
    formation: editor.formation,
    byAssistant,
    lineup,
    missingStarters,
    weakSpotLineup: lineup,
    // A saved starter out injured or suspended is in the eleven he comes back to.
    keptOffSales: [...lineup.starters.map(({ player }) => player), ...missingStarters].map((player) => player.id),
  };
});

export class LineupPlayerNotInSquadError extends Error {
  constructor(playerKey: string) {
    super(`Player ${playerKey} is not in the managed club's squad`);
  }
}

/**
 * A line-up save refused while a match of the club waits live (docs/design/effectif-adjoint.md § 1.7): the paused match
 * keeps its own team, and the line-up screen is read only until its final whistle.
 */
export class LineupLiveError extends Error {
  constructor() {
    super("A match of the managed club waits live: its line-up is not saved");
    this.name = "LineupLiveError";
  }
}

/**
 * What a line-up save did (docs/design/effectif-adjoint.md § 1.5): `saved`; `unchanged`, the line-up sent already the
 * saved one (a save sent again after a lost answer); `conflict`, the saved line-up no longer the one the editor read
 * (another tab), nothing written.
 */
export type LineupSaveOutcome = "saved" | "unchanged" | "conflict";

/**
 * What a line-up save action answers its editor: the save done (or already done), or why not, worded for the manager. A
 * `conflict` or a player gone (`not-in-squad`) has the editor start again from what is saved; `live`, a match waiting,
 * makes the screen read only.
 */
export type LineupSaveResult =
  | { ok: true; outcome: "saved" | "unchanged" }
  | { ok: false; reason: "invalid" | "conflict" | "not-in-squad" | "live"; message: string };

/**
 * What a formation or starting instruction saved at once answers, while the assistant makes the line-up: the line-up now
 * saved, which the editor sends as what it expects with its next save; or why not.
 */
export type LineupPlanResult = { ok: true; saved: SavedLineup } | { ok: false; reason: "invalid" | "player" | "live"; message: string };

/**
 * The matches waiting live, if one does: the club's (Save.liveFixtureId) and the national coach's
 * (Save.liveInternationalId). The line-up screen of the one waiting is read only until its final whistle.
 */
export async function liveMatchesOf(saveId: string): Promise<{ fixtureId: string | null; internationalId: string | null }> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, liveInternationalId: true } });
  return { fixtureId: save.liveFixtureId, internationalId: save.liveInternationalId };
}

/**
 * As long as a matchday's transaction may run (TRANSACTION_TIMEOUT_MS, src/db/matchday.ts, not imported: it imports this
 * module): a line-up save waits behind a date being played instead of failing.
 */
const LINEUP_SAVE_TIMEOUT_MS = 60_000;

/** The options of the line-up's writes, which wait for the save's lock: a connection, then a matchday. */
export const LINEUP_TRANSACTION = { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: LINEUP_SAVE_TIMEOUT_MS };

/** A saved line-up as it is compared: its starters by slot, its bench in order, Équilibré when it has no instruction. */
function lineupKey(lineup: SavedLineup | null): string {
  if (lineup === null) {
    return "null";
  }
  return JSON.stringify({
    starters: [...lineup.starters].sort((a, b) => a.slot - b.slot).map(({ slot, playerKey }) => [slot, playerKey]),
    bench: lineup.benchOrder,
    instruction: lineup.instruction ?? DEFAULT_INSTRUCTION,
  });
}

/** Whether two saved line-ups field the same eleven, bench and starting instruction. */
export function sameSavedLineup(a: SavedLineup | null, b: SavedLineup | null): boolean {
  return lineupKey(a) === lineupKey(b);
}

/** What is saved of a line-up, as an editor compares it with what it read (ExpectedLineup). */
export type CurrentLineup = { formation: FormationName; lineup: SavedLineup | null; byAssistant?: boolean };

/** Whether the editor read what is saved: formation and line-up, and who makes it when the editor tells. */
export function sameAsExpected(expected: ExpectedLineup, current: CurrentLineup): boolean {
  return (
    expected.formation === current.formation &&
    sameSavedLineup(expected.lineup, current.lineup) &&
    (expected.byAssistant === undefined || expected.byAssistant === current.byAssistant)
  );
}

/** Locks the save's row until the transaction ends, as a matchday does (lockSave): a write and a kick-off never cross. */
async function lockSaveRow(tx: Prisma.TransactionClient, saveId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Save" WHERE "id" = ${saveId} FOR UPDATE`;
}

/**
 * Saves the managed club's formation and lineup, every player of its squad, and takes the line-up from the assistant
 * (docs/design/simplification.md § 3.3): from then on, the match plays it. Each gesture of the editor sends one
 * (docs/design/effectif-adjoint.md § 1): in one transaction, the save locked, it is refused while a match waits live
 * (LineupLiveError), says `unchanged` for the line-up already saved, `conflict` when the editor's `expected` is no longer
 * what is saved, and checks the players against the squad (LineupPlayerNotInSquadError) before writing.
 */
export async function saveManagedLineup(saveId: string, input: LineupInput): Promise<LineupSaveOutcome> {
  return prisma.$transaction(async (tx) => {
    await lockSaveRow(tx, saveId);
    const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { lineupByAssistant: true, liveFixtureId: true } });
    if (save.liveFixtureId !== null) {
      throw new LineupLiveError();
    }
    const club = await tx.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, formation: true, lineup: true } });
    const current: CurrentLineup = {
      formation: parseFormation(club.formation),
      lineup: parseSavedLineup(club.lineup),
      byAssistant: lineupByAssistantOf(save.lineupByAssistant, club.lineup),
    };
    if (!current.byAssistant && current.formation === input.formation && sameSavedLineup(current.lineup, input.lineup)) {
      return "unchanged";
    }
    if (input.expected !== undefined && !sameAsExpected(input.expected, current)) {
      return "conflict";
    }
    const squad = await tx.playerSave.findMany({ where: { saveId, clubSaveId: club.id }, select: { playerKey: true } });
    const keys = new Set(squad.map((player) => player.playerKey));
    for (const playerKey of [...input.lineup.starters.map((starter) => starter.playerKey), ...input.lineup.benchOrder]) {
      if (!keys.has(playerKey)) {
        throw new LineupPlayerNotInSquadError(playerKey);
      }
    }
    const lineup: SavedLineup = { starters: input.lineup.starters, benchOrder: input.lineup.benchOrder, instruction: input.lineup.instruction };
    await tx.clubSave.updateMany({ where: { id: club.id, saveId }, data: { formation: input.formation, lineup } });
    if (save.lineupByAssistant !== false) {
      await tx.save.update({ where: { id: saveId }, data: { lineupByAssistant: false }, select: { id: true } });
    }
    return "saved";
  }, LINEUP_TRANSACTION);
}

/** What the assistant's way of the line-up lets the player choose (§ 3.2): his formation and his starting instruction. */
export const lineupPlanSchema = z.object({ formation: formationSchema, instruction: z.enum(INSTRUCTIONS) });

export type LineupPlan = z.output<typeof lineupPlanSchema>;

/** Refusal of a plan for a club whose player makes the line-up: his saved eleven goes with its formation. */
export class LineupPlanError extends Error {
  constructor(readonly reason: "player") {
    super(`Line-up plan refused: ${reason}`);
    this.name = "LineupPlanError";
  }
}

/**
 * Saves at once the formation and the starting instruction of a club whose assistant makes the line-up
 * (docs/design/simplification.md § 3.2): ClubSave.formation, and the instruction in ClubSave.lineup, whose starters and
 * bench, saved before if they were, are kept as they are, unread. The assistant keeps the line-up. Refused once the
 * player makes it (LineupPlanError), and while a match waits live (LineupLiveError). Gives what is now saved, which the
 * editor sends as what it expects with its next save (docs/design/effectif-adjoint.md § 1.5).
 */
export async function saveLineupPlan(saveId: string, plan: LineupPlan): Promise<SavedLineup> {
  return prisma.$transaction(async (tx) => {
    await lockSaveRow(tx, saveId);
    const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { lineupByAssistant: true, liveFixtureId: true } });
    if (save.liveFixtureId !== null) {
      throw new LineupLiveError();
    }
    const club = await tx.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, formation: true, lineup: true } });
    if (!lineupByAssistantOf(save.lineupByAssistant, club.lineup)) {
      throw new LineupPlanError("player");
    }
    const saved = parseSavedLineup(club.lineup);
    const lineup: SavedLineup = { starters: saved?.starters ?? [], benchOrder: saved?.benchOrder ?? [], instruction: plan.instruction };
    await tx.clubSave.updateMany({ where: { id: club.id, saveId }, data: { formation: plan.formation, lineup } });
    return lineup;
  }, LINEUP_TRANSACTION);
}
