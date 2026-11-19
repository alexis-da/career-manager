import * as z from "zod";
import { CALL_UP_BY_GROUP, CALL_UP_SIZE, FITNESS_RECOVERY_PER_DAY, FULL_FITNESS } from "../engine/balance";
import { assistantChoices, withChoices } from "../engine/choices";
import { chooseFormation } from "../engine/formation-choice";
import { FORMATION_NAMES, type FormationName } from "../engine/formations";
import { INSTRUCTIONS } from "../engine/instructions";
import { recoveredFitness } from "../engine/fitness";
import {
  internationalMatchRngSeed,
  internationalSession,
  lightMatchOf,
  runBreak,
  type InternationalSession,
  type LightMatch,
  type SessionPlay,
} from "../engine/international";
import { playOn } from "../engine/live";
import { BENCH_SIZE, resolveLineup, type Lineup, type SavedLineup } from "../engine/lineup";
import type { MatchDecision } from "../engine/choices";
import { goalTimesOf, simulateMatch, startMatch, type MatchEvent, type MatchResult, type MatchState, type Side } from "../engine/match";
import { isNationCode, type NationCode } from "../engine/nations";
import { POSITIONS } from "../engine/positions";
import { breakWindows } from "../engine/schedule";
import {
  drawTournament,
  FINAL_ROUND,
  FRIENDLY,
  nextTournamentMatch,
  QUALIFIER_EUROPE,
  QUALIFIER_WORLD,
  runTournament,
  titleKey,
  tournamentDates,
  tournamentEnding,
  type Cycle,
  type TournamentGroups,
  type TournamentStep,
} from "../engine/tournaments";
import { seasonStartYear } from "../engine/world";
import { Prisma } from "../generated/prisma/client";
import { serializeLiveState } from "./live-state";
import {
  BREAK_COMPETITIONS,
  goalTimesOfMatch,
  managedLinesOf,
  managedSummary,
  playedRuns,
  readCallUpsAndReserves,
  readQualifierTables,
  readReserves,
  readStrengths,
  writeReserveCounters,
  type BreakSummary,
  type CandidateRow,
  type ManagedPlayer,
  type NationPlayer,
  type ReserveRow,
} from "./nations";

// The national coach's breaks and tournaments (docs/design/selections.md § 5.2, N4 and N4b). In a save whose player
// coaches a nation (Save.nationCode), a break or a summer tournament is played in steps, each one up to his nation's next
// match at stake (a qualifier, a tournament match, a friendly he did not leave to his assistant), which he plays live or
// simulates. Each step plays the session again from its start (runBreak, runTournament): every nation's 23 and their
// fitness on its first date, kept at its first step (NationSave.squad), the other nations' matches light again (the
// same seeds, the same matches), his nation's as they were played by the full engine (InternationalMatch.outcome). The
// rows of the players who played are written once, at the session's end, as a break of another save writes them.

type Transaction = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);
const daysBetween = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));

/** A save whose player coaches a nation, as his steps read it. */
export type CoachSave = {
  id: string;
  seed: string;
  currentDate: Date;
  nationCode: NationCode;
  nationFriendlies: boolean; // his assistant plays the friendlies, without a stop
  cyclesFrom: number | null;
};

/** The save's national coach, or null when its player coaches no nation. */
export function coachSaveOf(save: {
  id: string;
  seed: string;
  currentDate: Date;
  nationCode: string | null;
  nationFriendlies: boolean;
  cyclesFrom: number | null;
}): CoachSave | null {
  if (save.nationCode === null || !isNationCode(save.nationCode)) {
    return null;
  }
  return { ...save, nationCode: save.nationCode };
}

export const COACH_SAVE_SELECT = {
  id: true,
  seed: true,
  currentDate: true,
  nationCode: true,
  nationFriendlies: true,
  cyclesFrom: true,
} as const;

// ------------------------------------------------------------------ What the rows keep

const side = z.enum(["home", "away"]);

/** A full-engine match as its session applies it (InternationalMatch.outcome): LightMatch. */
const outcomeSchema = z.object({
  homeGoals: z.number().int().min(0),
  awayGoals: z.number().int().min(0),
  goals: z.array(z.object({ side, minute: z.number().int().min(0), playerId: z.string() })),
  appearances: z.array(
    z.object({
      side,
      playerId: z.string(),
      slot: z.enum(POSITIONS),
      from: z.number().int().min(0),
      to: z.number().int().min(0),
      fitness: z.number().min(0).max(FULL_FITNESS),
      injuryDays: z.number().int().positive().nullable(),
    }),
  ),
  decidedBy: z.enum(["REGULATION", "EXTRA_TIME", "PENALTIES"]).nullable(),
  penalties: z.object({ home: z.number().int().min(0), away: z.number().int().min(0) }).nullable(),
  winner: side.nullable(),
});

export function parseOutcome(value: unknown): LightMatch {
  return outcomeSchema.parse(value);
}

/** A session's 23 of a nation and their fitness on its first date (NationSave.squad). */
const squadSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  players: z.array(z.object({ key: z.string().min(1), fitness: z.number().min(0).max(FULL_FITNESS) })).max(CALL_UP_SIZE),
});

/** The coach's own list for a session, by its first date (NationSave.callUp). */
const callUpSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  keys: z.array(z.string().min(1)).length(CALL_UP_SIZE),
});

export type CoachCallUp = z.infer<typeof callUpSchema>;

export function parseCallUp(value: unknown): CoachCallUp | null {
  const parsed = callUpSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The coach's lineup for his nation (NationSave.lineup): a formation and his eleven, bench and starting instruction, as
 * a club's lineup is kept (savedLineupSchema of ./lineup, which this module does not import: ./lineup reaches the
 * matchday's module, which imports this one).
 */
const coachLineupSchema = z.object({
  formation: z.enum(FORMATION_NAMES),
  lineup: z.object({
    starters: z.array(z.object({ slot: z.number().int().min(0).max(10), playerKey: z.string().min(1).max(100) })).max(11),
    benchOrder: z.array(z.string().min(1).max(100)).max(BENCH_SIZE),
    instruction: z.enum(INSTRUCTIONS).optional(),
  }),
});

export type CoachLineup = { formation: FormationName; lineup: SavedLineup };

export function parseCoachLineup(value: unknown): CoachLineup | null {
  const parsed = coachLineupSchema.safeParse(value);
  return parsed.success ? { formation: parsed.data.formation, lineup: parsed.data.lineup } : null;
}

/** A match's events and the coach's decisions, as his nation's row keeps them (engine values, by player key). */
const eventsSchema = z.array(
  z.object({
    minute: z.number().int().min(0),
    side,
    type: z.enum(["GOAL", "YELLOW_CARD", "RED_CARD", "INJURY", "SUBSTITUTION", "SHOOTOUT_GOAL", "SHOOTOUT_MISS"]),
    playerId: z.string(),
    relatedPlayerId: z.string().optional(),
    period: z.enum(["EXTRA_TIME", "SHOOTOUT"]).optional(),
  }),
);

export function parseEvents(value: unknown): MatchEvent[] {
  const parsed = eventsSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

const decisionsSchema = z.array(
  z.object({
    sequence: z.number().int().min(1),
    minute: z.number().int().min(0),
    kind: z.string(),
    option: z.string(),
    playerId: z.string().optional(),
    assistant: z.boolean(),
  }),
);

export function parseDecisions(value: unknown): MatchDecision[] {
  const parsed = decisionsSchema.safeParse(value ?? []);
  return parsed.success ? (parsed.data as MatchDecision[]) : [];
}

const json = (value: unknown): string => JSON.stringify(value);

// ------------------------------------------------------------------ The session in progress

/** A match of the coach's session, with its row when it has one (a tournament's are written once played or started). */
export type SessionMatch = {
  id: string | null;
  competition: string;
  startYear: number;
  round: number;
  pool: 0 | 1 | null;
  date: Date;
  home: NationCode;
  away: NationCode;
  neutral: boolean;
  knockout: boolean;
  played: boolean;
  live: boolean; // started live, waiting on its row (Save.liveInternationalId)
  homeGoals: number | null; // played
  awayGoals: number | null;
  decidedBy: "REGULATION" | "EXTRA_TIME" | "PENALTIES" | null; // a knockout match's, played
  homePenalties: number | null;
  awayPenalties: number | null;
  winner: NationCode | null; // a knockout match's, played
  outcome: LightMatch | null; // the coach's nation's, played
};

export type NationalSession =
  | { kind: "break"; startYear: number; first: Date; last: Date; next: Date; matches: SessionMatch[] }
  | {
      kind: "tournament";
      startYear: number; // the season it ends
      cycle: Cycle;
      groups: TournamentGroups;
      dates: Date[];
      first: Date;
      last: Date;
      next: Date;
      matches: SessionMatch[]; // its rows
      strengths: Map<NationCode, number>;
    };

const MATCH_SELECT = {
  id: true,
  competition: true,
  startYear: true,
  round: true,
  pool: true,
  scheduledAt: true,
  home: true,
  away: true,
  neutral: true,
  played: true,
  liveState: true,
  outcome: true,
  homeGoals: true,
  awayGoals: true,
  decidedBy: true,
  homePenalties: true,
  awayPenalties: true,
  winner: true,
} as const;

type MatchRow = Prisma.InternationalMatchGetPayload<{ select: typeof MATCH_SELECT }>;

function sessionMatchOf(row: MatchRow, knockout: boolean): SessionMatch | null {
  if (!isNationCode(row.home) || !isNationCode(row.away)) {
    return null;
  }
  return {
    id: row.id,
    competition: row.competition,
    startYear: row.startYear,
    round: row.round,
    pool: row.pool === 0 ? 0 : row.pool === 1 ? 1 : null,
    date: row.scheduledAt,
    home: row.home,
    away: row.away,
    neutral: row.neutral,
    knockout,
    played: row.played,
    live: !row.played && row.liveState !== null,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    decidedBy: row.decidedBy,
    homePenalties: row.homePenalties,
    awayPenalties: row.awayPenalties,
    winner: row.winner !== null && isNationCode(row.winner) ? row.winner : null,
    outcome: row.played && row.outcome !== null ? parseOutcome(row.outcome) : null,
  };
}

/**
 * The summer tournament the coach's nation plays in the June of the save's season, while it is not over: the season ends
 * a cycle, its qualifiers are all played, the draw (the one the screens show) puts his nation in it, and its final is not
 * played. Its matches are written as they are played (or started live).
 */
async function pendingTournament(db: Transaction, save: CoachSave): Promise<NationalSession | null> {
  const startYear = seasonStartYear(save.currentDate);
  const cycle = tournamentEnding(save.cyclesFrom, startYear);
  if (cycle === null) {
    return null;
  }
  const unplayed = await db.internationalMatch.count({
    where: { saveId: save.id, played: false, competition: { in: [QUALIFIER_EUROPE, QUALIFIER_WORLD] } },
  });
  if (unplayed > 0) {
    return null;
  }
  const strengths = await readStrengths(db, save.id);
  const tables = await readQualifierTables(db, save.id, cycle, strengths);
  if (tables.played === 0) {
    return null;
  }
  const groups = drawTournament({ tournament: cycle.tournament, ...tables, strengths, saveSeed: save.seed, year: cycle.tournamentYear });
  if (!groups.some((group) => group.includes(save.nationCode))) {
    return null;
  }
  const rows = await db.internationalMatch.findMany({
    where: { saveId: save.id, competition: cycle.tournament, startYear },
    orderBy: [{ scheduledAt: "asc" }, { round: "asc" }, { pool: "asc" }],
    select: MATCH_SELECT,
  });
  if (rows.some((row) => row.round === FINAL_ROUND && row.played)) {
    return null;
  }
  const matches = rows.flatMap((row) => sessionMatchOf(row, row.round > 3) ?? []);
  const dates = tournamentDates(cycle.tournamentYear);
  const playedDates = new Set(matches.filter((match) => match.played).map((match) => match.date.getTime()));
  const next = dates.find((date) => !playedDates.has(date.getTime())) ?? dates[dates.length - 1];
  return { kind: "tournament", startYear, cycle, groups, dates, first: dates[0], last: dates[dates.length - 1], next, matches, strengths };
}

/**
 * The coach's session in progress or next: the break of the save's first international match still to play (its two
 * dates, all its matches), or, its breaks all played, his nation's summer tournament while it is not over; null without.
 */
export async function currentNationalSession(db: Transaction, save: CoachSave): Promise<NationalSession | null> {
  const next = await db.internationalMatch.findFirst({
    where: { saveId: save.id, played: false, competition: { in: BREAK_COMPETITIONS } },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true, startYear: true },
  });
  if (next === null) {
    return pendingTournament(db, save);
  }
  const window = breakWindows(next.startYear).find((entry) => entry.dates.some((date) => date.getTime() === next.scheduledAt.getTime()));
  const dates = window === undefined ? [next.scheduledAt] : [...window.dates];
  const rows = await db.internationalMatch.findMany({
    where: { saveId: save.id, competition: { in: BREAK_COMPETITIONS }, scheduledAt: { in: dates } },
    orderBy: [{ scheduledAt: "asc" }, { round: "asc" }, { home: "asc" }],
    select: MATCH_SELECT,
  });
  return {
    kind: "break",
    startYear: next.startYear,
    first: dates[0],
    last: dates[dates.length - 1],
    next: next.scheduledAt,
    matches: rows.flatMap((row) => sessionMatchOf(row, false) ?? []),
  };
}

/** Whether a match is one of the coach's nation's, and on which side. */
const managedSideOf = (match: { home: string; away: string }, code: NationCode): Side | null =>
  match.home === code ? "home" : match.away === code ? "away" : null;

/** Whether the game stops before a match of the coach's nation: a match at stake, or a friendly he plays himself. */
export const isStop = (match: { competition: string }, save: Pick<CoachSave, "nationFriendlies">): boolean =>
  match.competition !== FRIENDLY || !save.nationFriendlies;

/** The coach's nation's next match the game stops before, in his session in progress or next; null without. */
export type NationalStop = {
  session: NationalSession;
  competition: string;
  round: number;
  pool: 0 | 1 | null;
  date: Date;
  home: NationCode;
  away: NationCode;
  neutral: boolean;
  knockout: boolean;
};

export async function nextNationalStop(db: Transaction, save: CoachSave, session?: NationalSession | null): Promise<NationalStop | null> {
  const current = session === undefined ? await currentNationalSession(db, save) : session;
  if (current === null) {
    return null;
  }
  if (current.kind === "break") {
    const match = current.matches.find((entry) => !entry.played && managedSideOf(entry, save.nationCode) !== null && isStop(entry, save));
    return match === undefined ? null : { session: current, ...match };
  }
  const next = nextTournamentMatch({
    code: save.nationCode,
    groups: current.groups,
    dates: current.dates,
    played: current.matches.flatMap((match) =>
      match.played ? [{ round: match.round, home: match.home, away: match.away, homeGoals: match.homeGoals ?? 0, awayGoals: match.awayGoals ?? 0, winner: match.winner }] : [],
    ),
    strengths: current.strengths,
  });
  return next === null ? null : { session: current, competition: current.cycle.tournament, ...next };
}

const winnerOf = (match: { home: NationCode; away: NationCode }, played: LightMatch): NationCode | null =>
  played.winner === null ? null : played.winner === "home" ? match.home : match.away;

// ------------------------------------------------------------------ The 23 of a session

/** A player of our clubs as a session reads him: what a call-up needs, and whether he can still play. */
type LeagueRow = CandidateRow & { injuredUntil: Date | null; retired: boolean };

const LEAGUE_SELECT = Prisma.sql`"id", "playerKey", "firstName", "lastName", "caps", "internationalGoals", "nationality",
  "position", "overall", "pace", "shooting", "passing", "dribbling", "defending", "physical", "goalkeeping", "form",
  "morale", "fitness", "clubSaveId", "injuredUntil", "retired"`;

/** Our players of some keys, by key. */
async function leagueRowsByKey(db: Transaction, saveId: string, keys: readonly string[]): Promise<Map<string, LeagueRow>> {
  if (keys.length === 0) {
    return new Map();
  }
  const rows = await db.$queryRaw<LeagueRow[]>`
    SELECT ${LEAGUE_SELECT} FROM "PlayerSave" WHERE "saveId" = ${saveId} AND "playerKey" IN (${Prisma.join([...keys])})`;
  return new Map(rows.map((row) => [row.playerKey, row]));
}

/** Every player of our clubs of a nationality, neither retired nor free: a coach's choice for his list. */
export async function nationPool(db: Transaction, saveId: string, nationality: string): Promise<LeagueRow[]> {
  return db.$queryRaw<LeagueRow[]>`
    SELECT ${LEAGUE_SELECT} FROM "PlayerSave"
    WHERE "saveId" = ${saveId} AND "nationality" = ${nationality} AND "clubSaveId" IS NOT NULL AND NOT "retired"
    ORDER BY "overall" DESC, "playerKey"`;
}

function leaguePlayer(row: LeagueRow, code: NationCode, fitness: number): NationPlayer {
  return {
    id: row.playerKey,
    position: row.position,
    overall: row.overall,
    injured: false,
    pace: row.pace,
    shooting: row.shooting,
    passing: row.passing,
    dribbling: row.dribbling,
    defending: row.defending,
    physical: row.physical,
    goalkeeping: row.goalkeeping,
    form: row.form,
    morale: row.morale,
    fitness,
    nation: code,
    firstName: row.firstName,
    lastName: row.lastName,
    caps: row.caps,
    goals: row.internationalGoals,
    playerSaveId: row.id,
    clubSaveId: row.clubSaveId,
    reserveIndex: null,
  };
}

function reservePlayer(row: ReserveRow, index: number, fitness: number): NationPlayer {
  const player = row.reserve[index];
  return {
    id: player.key,
    position: player.position,
    overall: player.overall,
    injured: false,
    pace: player.pace,
    shooting: player.shooting,
    passing: player.passing,
    dribbling: player.dribbling,
    defending: player.defending,
    physical: player.physical,
    goalkeeping: player.goalkeeping,
    form: 50,
    morale: 50,
    fitness,
    nation: row.code,
    firstName: player.firstName,
    lastName: player.lastName,
    caps: row.caps[index] ?? 0,
    goals: row.goals[index] ?? 0,
    playerSaveId: null,
    clubSaveId: null,
    reserveIndex: index,
  };
}

/**
 * The coach's own list as it stands on its first date: his players still available then (neither injured on that date,
 * nor retired, nor free), completed from his assistant's list in its order when one has gone (at least three
 * goalkeepers, then up to 23).
 */
export function completeCallUp(chosen: readonly NationPlayer[], assistant: readonly NationPlayer[]): NationPlayer[] {
  const called = [...chosen];
  const has = (player: NationPlayer): boolean => called.some((entry) => entry.id === player.id);
  const goalkeepers = (): number => called.filter((player) => player.position === "GK").length;
  for (const player of assistant) {
    if (goalkeepers() >= CALL_UP_BY_GROUP.GK) {
      break;
    }
    if (player.position === "GK" && !has(player)) {
      called.push(player);
    }
  }
  for (const player of assistant) {
    if (called.length >= CALL_UP_SIZE) {
      break;
    }
    if (!has(player)) {
      called.push(player);
    }
  }
  return called.slice(0, CALL_UP_SIZE);
}

/** The coach's list as players on a date, from its keys: our players at their fitness then, his reserve rested. */
async function coachCallUpPlayers(
  tx: Transaction,
  save: CoachSave,
  keys: readonly string[],
  reserve: ReserveRow | undefined,
  date: Date,
): Promise<NationPlayer[]> {
  const rows = await leagueRowsByKey(tx, save.id, keys);
  const restDays = daysBetween(save.currentDate, date);
  return keys.flatMap((key) => {
    const row = rows.get(key);
    if (row !== undefined) {
      const available = row.clubSaveId !== null && !row.retired && (row.injuredUntil === null || row.injuredUntil <= date);
      return available ? [leaguePlayer(row, save.nationCode, recoveredFitness(row.fitness, restDays))] : [];
    }
    const index = reserve?.reserve.findIndex((player) => player.key === key) ?? -1;
    return reserve !== undefined && index >= 0 ? [reservePlayer(reserve, index, FULL_FITNESS)] : [];
  });
}

/**
 * A session's 23 of each nation, their fitness on its first date: kept at its first step (NationSave.squad), each nation's
 * as its assistant calls them (readCallUps), the coach's nation's his own list when he saved one for this session
 * (completeCallUp); read back at its later steps. With the reserves, whose counters its end writes.
 */
async function sessionSquads(
  tx: Transaction,
  save: CoachSave,
  session: NationalSession,
  store: boolean = true,
): Promise<{ called: Map<NationCode, NationPlayer[]>; reserves: ReserveRow[] }> {
  const rows = await tx.nationSave.findMany({ where: { saveId: save.id }, select: { code: true, squad: true, callUp: true } });
  const from = isoDay(session.first);
  const squads = new Map(
    rows.flatMap((row) => {
      const parsed = squadSchema.safeParse(row.squad);
      return parsed.success && parsed.data.from === from && isNationCode(row.code) ? [[row.code, parsed.data.players] as const] : [];
    }),
  );
  const reserves = await readReserves(tx, save.id);
  const reserveOf = new Map(reserves.map((row) => [row.code, row]));

  // Read back once the session has started: the 23 kept, our players as their rows are (nothing they hold changes during
  // a session). Before its first match, the coach's list may still change: read again.
  if (!callUpOpen(session) && squads.size === reserves.length && squads.size > 0) {
    const league = await leagueRowsByKey(
      tx,
      save.id,
      [...squads.values()].flat().map((entry) => entry.key),
    );
    const called = new Map<NationCode, NationPlayer[]>();
    for (const [code, entries] of squads) {
      const reserve = reserveOf.get(code);
      called.set(
        code,
        entries.flatMap((entry) => {
          const row = league.get(entry.key);
          if (row !== undefined) {
            return [leaguePlayer(row, code, entry.fitness)];
          }
          const index = reserve?.reserve.findIndex((player) => player.key === entry.key) ?? -1;
          return reserve !== undefined && index >= 0 ? [reservePlayer(reserve, index, entry.fitness)] : [];
        }),
      );
    }
    return { called, reserves };
  }

  // The first step: each assistant's 23, the coach's own list, kept for the steps after it.
  const { called } = await readCallUpsAndReserves(tx, save.id, session.first, save.currentDate);
  const own = parseCallUp(rows.find((row) => row.code === save.nationCode)?.callUp);
  if (own !== null && own.date === from) {
    const chosen = await coachCallUpPlayers(tx, save, own.keys, reserveOf.get(save.nationCode), session.first);
    called.set(save.nationCode, completeCallUp(chosen, called.get(save.nationCode) ?? []));
  }
  if (!store) {
    return { called, reserves };
  }
  const kept = [...called].map(([code, players]) => ({
    code,
    squad: { from, players: players.map((player) => ({ key: player.id, fitness: player.fitness })) },
  }));
  await tx.$executeRaw`
    UPDATE "NationSave" AS n SET "squad" = v."squad"
    FROM (VALUES ${Prisma.join(kept.map((row) => Prisma.sql`(${row.code}::text, ${json(row.squad)}::jsonb)`))}) AS v("code", "squad")
    WHERE n."saveId" = ${save.id} AND n."code" = v."code"`;
  return { called, reserves };
}

// ------------------------------------------------------------------ The coach's matches, by the full engine

/** The lineups of a match of the coach's nation: his own (his saved lineup, or his assistant's), the other one's as an AI club picks. */
export type CoachMatchTeams = {
  lineups: Record<Side, Lineup>;
  formations: Record<Side, FormationName>;
  kickOff: Map<string, number>; // each player's fitness at kick-off, as the engine has it
};

export function coachMatchTeams(
  session: InternationalSession<NationPlayer>,
  match: { home: NationCode; away: NationCode; date: Date },
  managedSide: Side,
  lineup: CoachLineup | null,
): CoachMatchTeams {
  const kickOff = new Map<string, number>();
  const sideTeam = (code: NationCode, own: boolean): { lineup: Lineup; formation: FormationName } => {
    // The engine plays whole points of fitness, as a club's rows hold them.
    const players = session.teamOn(code, match.date).players.map((player) => ({ ...player, fitness: Math.round(player.fitness) }));
    for (const player of players) {
      kickOff.set(player.id, player.fitness);
    }
    if (own && lineup !== null) {
      return { lineup: resolveLineup(lineup.formation, lineup.lineup, players), formation: lineup.formation };
    }
    return chooseFormation(players, 1);
  };
  const home = sideTeam(match.home, managedSide === "home");
  const away = sideTeam(match.away, managedSide === "away");
  return { lineups: { home: home.lineup, away: away.lineup }, formations: { home: home.formation, away: away.formation }, kickOff };
}

/** The seed of a match of the coach's nation: the one a light match of these nations that day would have. */
export const coachMatchSeed = (save: { seed: string }, match: { date: Date; home: string; away: string }): string =>
  internationalMatchRngSeed(save.seed, match.date, match.home, match.away);

/** The coach's lineup for his nation, if he saved one. */
export async function readCoachLineup(db: Transaction, saveId: string, code: NationCode): Promise<CoachLineup | null> {
  const row = await db.nationSave.findUnique({ where: { saveId_code: { saveId, code } }, select: { lineup: true } });
  return row === null ? null : parseCoachLineup(row.lineup);
}

// ------------------------------------------------------------------ A step

/**
 * How a step plays the coach's next match at stake: live (its first segment, then step by step: advanceNationalLiveMatch),
 * simulated (his assistant's decisions, as a simulated match of his club), or not at all (the step stops before its date).
 */
export type NationalStepMode = "live" | "simulate" | "until-stop";

/** What a step did. */
export type NationalStep = {
  date: Date; // the save's date after it
  played: number; // matches played by it, his own included
  coachMatch: { id: string; live: boolean } | null; // his match at stake played, or started live
  completed: BreakSummary | null; // the session it ended
  stopNext: boolean; // it stopped before the date of his next match at stake
  session: NationalSession; // as it stood before the step
};

/** His match played live, just over: the step records it where it stands, then goes on. */
export type FinishedLiveMatch = { id: string; result: MatchResult; managedSide: Side };

/** A match of a session as a step plays it, a break's or a tournament's, with its row when it has one. */
type CoachFixture = {
  id: string | null;
  competition: string;
  round: number;
  pool: 0 | 1 | null;
  date: Date;
  home: NationCode;
  away: NationCode;
  neutral: boolean;
  knockout: boolean;
};

type FreshCoachMatch = { fixture: CoachFixture; result: MatchResult; outcome: LightMatch; managedSide: Side };

type LiveStart = { fixture: CoachFixture; state: MatchState; managedSide: Side };

const keyOf = (match: { date: Date; home: string; away: string }): string => `${isoDay(match.date)}:${match.home}:${match.away}`;

/** The coach's nation's players of our managed club in a match, from its result: the screens tell the break from them. */
export function managedLinesOfOutcome(
  session: InternationalSession<NationPlayer>,
  match: { date: Date; home: string; away: string },
  outcome: LightMatch,
  managedClubId: string,
): ManagedPlayer[] {
  return managedLinesOf(session, { id: null, date: match.date, home: match.home, away: match.away, match: outcome }, managedClubId);
}

/**
 * Plays the coach's session in progress (currentNationalSession) one step on, in the transaction of the save's move: the
 * session run from its start (its 23 kept at its first step), whole dates, each date the light matches of the other
 * nations and his nation's match, up to the date of his next match at stake: played live (its first segment: the save
 * waits for it, Save.liveInternationalId, the other matches of its date played) or simulated (then on to his next match
 * at stake, the step stopping before its date) as `mode` says, or left for him (until-stop: the step stops before its
 * date). His friendlies left to his assistant are simulated on the way. Writes the matches it played (a tournament's rows
 * then), the save's date and every player's recovery up to it; at the session's end, as a break of another save, the
 * rows of the players who played, the reserves' counters, a tournament's titles. Returns null without a session.
 */
export async function playNationalStep(
  tx: Transaction,
  save: CoachSave,
  mode: NationalStepMode,
  known?: NationalSession | null,
  finishedLive: FinishedLiveMatch | null = null,
): Promise<NationalStep | null> {
  const session = known === undefined ? await currentNationalSession(tx, save) : known;
  if (session === null) {
    return null;
  }
  if (session.matches.some((match) => match.live && match.id !== finishedLive?.id)) {
    throw new Error(`Save ${save.id} has a match of its national team waiting live`);
  }
  const { called, reserves } = await sessionSquads(tx, save, session);
  const state = internationalSession(called, session.first);
  const lineup = await readCoachLineup(tx, save.id, save.nationCode);
  const managedClub = await tx.clubSave.findFirstOrThrow({ where: { saveId: save.id, isManaged: true }, select: { id: true } });

  const rows = new Map(session.matches.map((match) => [keyOf(match), match]));
  const fresh = new Map<string, FreshCoachMatch>();
  let live: LiveStart | null = null;
  let opened = false;
  let stopNext = false;

  const isFinishedLive = (fixture: CoachFixture): boolean => finishedLive !== null && rows.get(keyOf(fixture))?.id === finishedLive.id;
  const isUnplayedStop = (fixture: CoachFixture): boolean =>
    managedSideOf(fixture, save.nationCode) !== null &&
    rows.get(keyOf(fixture))?.played !== true &&
    !isFinishedLive(fixture) &&
    isStop(fixture, save);
  const openDate = (fixtures: readonly CoachFixture[]): boolean => {
    if (!fixtures.some(isUnplayedStop)) {
      return true;
    }
    if (mode === "until-stop" || opened) {
      stopNext = true;
      return false;
    }
    opened = true;
    return true;
  };
  const playOf = (fixture: CoachFixture): SessionPlay => {
    const managedSide = managedSideOf(fixture, save.nationCode);
    if (managedSide === null) {
      return { kind: "light" };
    }
    const row = rows.get(keyOf(fixture));
    if (row?.played === true) {
      if (row.outcome === null) {
        throw new Error(`The national team's match ${row.id ?? keyOf(fixture)} has no outcome`);
      }
      return { kind: "recorded", match: row.outcome };
    }
    const teams = coachMatchTeams(state, fixture, managedSide, lineup);
    if (finishedLive !== null && isFinishedLive(fixture)) {
      const outcome = lightMatchOf(finishedLive.result, teams.kickOff);
      fresh.set(keyOf(fixture), { fixture, result: finishedLive.result, outcome, managedSide });
      return { kind: "recorded", match: outcome };
    }
    const seed = coachMatchSeed(save, fixture);
    if (mode === "live" && isStop(fixture, save)) {
      const kickOff = withChoices(startMatch(teams.lineups.home, teams.lineups.away, teams.formations, fixture.knockout, fixture.neutral), managedSide, seed);
      live = { fixture, state: playOn(kickOff, managedSide, seed, {}, "segment"), managedSide };
      return { kind: "pending" };
    }
    const result = simulateMatch(
      teams.lineups.home,
      teams.lineups.away,
      seed,
      teams.formations,
      fixture.knockout,
      {},
      assistantChoices(managedSide, seed),
      fixture.neutral,
    );
    const outcome = lightMatchOf(result, teams.kickOff);
    fresh.set(keyOf(fixture), { fixture, result, outcome, managedSide });
    return { kind: "recorded", match: outcome };
  };

  let complete: boolean;
  let winner: NationCode | null = null;
  let played: { fixture: CoachFixture; match: LightMatch }[];
  if (session.kind === "break") {
    const run = runBreak({
      session: state,
      fixtures: session.matches,
      seedOf: (match) => internationalMatchRngSeed(save.seed, match.date, match.home, match.away),
      openDate,
      playOf,
    });
    complete = run.stoppedBefore === null && run.pending === null;
    played = run.played;
  } else {
    const competition = session.cycle.tournament;
    const asFixture = (step: TournamentStep): CoachFixture => ({ ...step, competition, id: rows.get(keyOf(step))?.id ?? null });
    const run = runTournament({
      session: state,
      groups: session.groups,
      dates: session.dates,
      strengths: session.strengths,
      seedOf: (date, home, away) => internationalMatchRngSeed(save.seed, date, home, away),
      openDate: (fixtures) => openDate(fixtures.map(asFixture)),
      playOf: (step) => playOf(asFixture(step)),
    });
    complete = run.result !== null;
    winner = run.result?.winner ?? null;
    played = run.played.map(({ fixture, match }) => ({ fixture: asFixture(fixture), match }));
  }

  // The matches this step played: those whose row was not played yet.
  const newlyPlayed = played.filter(({ fixture }) => rows.get(keyOf(fixture))?.played !== true);
  const ownId = await writePlayedMatches(tx, save, session, newlyPlayed, fresh, state, managedClub.id);
  const started = live as LiveStart | null;
  const coachMatch: NationalStep["coachMatch"] =
    started !== null ? { id: await startLiveRow(tx, save, session, started), live: true } : ownId === null ? null : { id: ownId, live: false };

  if (complete) {
    const summary = await finishSession(tx, save, session, state, called, reserves, managedClub.id, winner);
    return { date: summary.to, played: newlyPlayed.length, coachMatch, completed: summary, stopNext: false, session };
  }
  const dates = [...newlyPlayed.map(({ fixture }) => fixture.date), ...(started === null ? [] : [started.fixture.date])];
  const lastDate = dates.reduce((latest, date) => (date > latest ? date : latest), save.currentDate);
  if (lastDate > save.currentDate) {
    await recoverUntil(tx, save.id, save.currentDate, lastDate, []);
    await tx.save.update({ where: { id: save.id }, data: { currentDate: lastDate } });
  }
  return { date: lastDate, played: newlyPlayed.length, coachMatch, completed: null, stopNext, session };
}

/** Every player recovers from one date to another, up to full fitness, but those left out (their rows written apart). */
async function recoverUntil(tx: Transaction, saveId: string, from: Date, to: Date, except: readonly string[]): Promise<void> {
  const days = daysBetween(from, to);
  if (days <= 0) {
    return;
  }
  const others = except.length === 0 ? Prisma.empty : Prisma.sql`AND "id" NOT IN (${Prisma.join([...except])})`;
  await tx.$executeRaw`
    UPDATE "PlayerSave"
    SET "fitness" = LEAST(${FULL_FITNESS}, "fitness" + ${FITNESS_RECOVERY_PER_DAY * days})
    WHERE "saveId" = ${saveId} AND "fitness" < ${FULL_FITNESS} ${others}`;
}

/** The goals of a full-engine match as InternationalMatch keeps them, and its scorers in the same order. */
const engineGoals = (result: MatchResult): { goalTimes: number[]; scorers: string[] } => ({
  goalTimes: goalTimesOf(result.events),
  scorers: result.events.filter((event) => event.type === "GOAL").map((event) => event.playerId),
});

const asJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** The columns of a match played: its score, goals and scorers; the coach's own, its events, decisions and outcome. */
export function playedColumns(fixture: { knockout: boolean; home: NationCode; away: NationCode }, match: LightMatch, fresh: { result: MatchResult; outcome: LightMatch; managedSide: Side } | undefined, managedPlayers: ManagedPlayer[]) {
  const goals = fresh === undefined ? { goalTimes: goalTimesOfMatch(match), scorers: match.goals.map((goal) => goal.playerId) } : engineGoals(fresh.result);
  return {
    played: true,
    homeGoals: match.homeGoals,
    awayGoals: match.awayGoals,
    decidedBy: fixture.knockout ? match.decidedBy : null,
    homePenalties: fixture.knockout ? (match.penalties?.home ?? null) : null,
    awayPenalties: fixture.knockout ? (match.penalties?.away ?? null) : null,
    winner: fixture.knockout ? winnerOf(fixture, match) : null,
    goalTimes: goals.goalTimes,
    scorers: goals.scorers,
    managedPlayers: asJson(managedPlayers),
    ...(fresh === undefined
      ? {}
      : {
          events: asJson(fresh.result.events),
          decisions: asJson(fresh.result.decisions ?? []),
          instructions: asJson(fresh.result.instructions?.[fresh.managedSide] ?? []),
          outcome: asJson(fresh.outcome),
        }),
  };
}

/**
 * Writes the matches a step played: a break's rows updated, a tournament's created, the coach's own on its own. Returns
 * the coach's match at stake the step played, simulated, if any.
 */
async function writePlayedMatches(
  tx: Transaction,
  save: CoachSave,
  session: NationalSession,
  entries: readonly { fixture: CoachFixture; match: LightMatch }[],
  fresh: ReadonlyMap<string, FreshCoachMatch>,
  state: InternationalSession<NationPlayer>,
  managedClubId: string,
): Promise<string | null> {
  const creates: Prisma.InternationalMatchCreateManyInput[] = [];
  let ownId: string | null = null;
  for (const { fixture, match } of entries) {
    const own = fresh.get(keyOf(fixture));
    const columns = playedColumns(fixture, match, own, managedLinesOfOutcome(state, fixture, match, managedClubId));
    const stake = own !== undefined && isStop(fixture, save);
    if (fixture.id !== null) {
      await tx.internationalMatch.update({ where: { id: fixture.id, saveId: save.id }, data: { ...columns, liveState: Prisma.DbNull } });
      ownId = stake ? fixture.id : ownId;
      continue;
    }
    const data = {
      saveId: save.id,
      startYear: session.startYear,
      competition: fixture.competition,
      round: fixture.round,
      pool: fixture.pool,
      scheduledAt: fixture.date,
      home: fixture.home,
      away: fixture.away,
      neutral: fixture.neutral,
      ...columns,
    };
    if (own !== undefined) {
      const created = await tx.internationalMatch.create({ data, select: { id: true } });
      ownId = stake ? created.id : ownId;
    } else {
      creates.push(data);
    }
  }
  if (creates.length > 0) {
    await tx.internationalMatch.createMany({ data: creates });
  }
  return ownId;
}

/** The coach's match started live: its row waits at its first pause, and the save with it, on its date. Returns its id. */
async function startLiveRow(tx: Transaction, save: CoachSave, session: NationalSession, live: LiveStart): Promise<string> {
  const data = {
    liveState: serializeLiveState({ managedSide: live.managedSide, state: live.state }),
    events: asJson(live.state.events),
  };
  let id: string;
  if (live.fixture.id !== null) {
    const updated = await tx.internationalMatch.updateMany({ where: { id: live.fixture.id, saveId: save.id, played: false }, data });
    if (updated.count !== 1) {
      throw new Error(`International match ${live.fixture.id} could not be started live`);
    }
    id = live.fixture.id;
  } else {
    const created = await tx.internationalMatch.create({
      data: {
        saveId: save.id,
        startYear: session.startYear,
        competition: live.fixture.competition,
        round: live.fixture.round,
        pool: live.fixture.pool,
        scheduledAt: live.fixture.date,
        home: live.fixture.home,
        away: live.fixture.away,
        neutral: live.fixture.neutral,
        ...data,
      },
      select: { id: true },
    });
    id = created.id;
  }
  await tx.save.update({ where: { id: save.id }, data: { liveInternationalId: id } });
  return id;
}

/**
 * The end of a session, once its last match is played: as a break of another save (playInternationalBreak), the rows of
 * our players who played (fitness on its last date, injury, caps and goals), the others' recovery up to it, the reserves'
 * counters; a tournament's title to the winner's players of our clubs who played in it; the save's date, its last.
 */
async function finishSession(
  tx: Transaction,
  save: CoachSave,
  session: NationalSession,
  state: InternationalSession<NationPlayer>,
  called: ReadonlyMap<NationCode, readonly NationPlayer[]>,
  reserves: readonly ReserveRow[],
  managedClubId: string,
  winner: NationCode | null,
): Promise<BreakSummary> {
  const last = session.last;
  const runs = playedRuns(state, called);
  const playedInLeague = runs.filter(({ player }) => player.playerSaveId !== null);
  await recoverUntil(
    tx,
    save.id,
    save.currentDate,
    last,
    playedInLeague.map(({ player }) => player.playerSaveId ?? ""),
  );
  if (playedInLeague.length > 0) {
    await tx.$executeRaw`
      UPDATE "PlayerSave" AS p
      SET "fitness" = v."fitness", "injuredUntil" = COALESCE(v."injuredUntil", p."injuredUntil"),
        "caps" = p."caps" + v."caps", "internationalGoals" = p."internationalGoals" + v."goals"
      FROM (VALUES ${Prisma.join(
        playedInLeague.map(
          ({ player, run }) => Prisma.sql`(${player.playerSaveId}::text,
            ${Math.round(recoveredFitness(run.fitness, daysBetween(run.asOf, last)))}::int,
            ${run.injuredUntil?.toISOString() ?? null}::timestamp(3), ${run.caps}::int, ${run.goals}::int)`,
        ),
      )}) AS v("id", "fitness", "injuredUntil", "caps", "goals")
      WHERE p."id" = v."id" AND p."saveId" = ${save.id}`;
  }
  await writeReserveCounters(tx, save.id, reserves, runs);
  if (session.kind === "tournament" && winner !== null) {
    const champions = (called.get(winner) ?? []).filter((player) => player.playerSaveId !== null && (state.runs.get(player.id)?.caps ?? 0) > 0);
    if (champions.length > 0) {
      await tx.$executeRaw`
        UPDATE "PlayerSave"
        SET "internationalTitles" = array_append("internationalTitles", ${titleKey(session.cycle.tournament, session.cycle.tournamentYear)})
        WHERE "saveId" = ${save.id} AND "id" IN (${Prisma.join(champions.map((player) => player.playerSaveId ?? ""))})`;
    }
  }
  await tx.save.update({ where: { id: save.id }, data: { currentDate: last } });
  const matches = await tx.internationalMatch.count({
    where:
      session.kind === "break"
        ? { saveId: save.id, competition: { in: BREAK_COMPETITIONS }, scheduledAt: { gte: session.first, lte: last } }
        : { saveId: save.id, competition: session.cycle.tournament, startYear: session.startYear },
  });
  return { from: session.first, to: last, matches, managed: managedSummary(state, called, managedClubId) };
}

/**
 * The coach's session as it stands before a date, read only (his screens): every nation's 23 (kept, or as they would be
 * called now), the matches before that date played again, his own as they were played. Nothing is written.
 */
export async function sessionBefore(
  db: Transaction,
  save: CoachSave,
  session: NationalSession,
  date: Date,
): Promise<{ state: InternationalSession<NationPlayer>; called: Map<NationCode, NationPlayer[]> }> {
  const { called } = await sessionSquads(db, save, session, false);
  const state = internationalSession(called, session.first);
  const rows = new Map(session.matches.map((match) => [keyOf(match), match]));
  const openDate = (fixtures: readonly { date: Date }[]): boolean => fixtures[0].date < date;
  const playOf = (fixture: { date: Date; home: NationCode; away: NationCode }): SessionPlay => {
    const row = rows.get(keyOf(fixture));
    return row?.played === true && row.outcome !== null ? { kind: "recorded", match: row.outcome } : { kind: "light" };
  };
  const seedOf = (match: { date: Date; home: string; away: string }): string => internationalMatchRngSeed(save.seed, match.date, match.home, match.away);
  if (session.kind === "break") {
    runBreak({ session: state, fixtures: session.matches, seedOf, openDate, playOf });
  } else {
    runTournament({
      session: state,
      groups: session.groups,
      dates: session.dates,
      strengths: session.strengths,
      seedOf: (when, home, away) => seedOf({ date: when, home, away }),
      openDate,
      playOf,
    });
  }
  return { state, called };
}

// ------------------------------------------------------------------ Reading the coach's list before a session

/** Whether the coach's list may still change: his session has not started (no match of it played). */
export function callUpOpen(session: NationalSession): boolean {
  return !session.matches.some((match) => match.played || match.live);
}

