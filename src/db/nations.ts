import * as z from "zod";
import { FITNESS_RECOVERY_PER_DAY, FULL_FITNESS } from "../engine/balance";
import { recoveredFitness } from "../engine/fitness";
import { rankFormations } from "../engine/formation-choice";
import {
  internationalMatchRngSeed,
  internationalSession,
  type InternationalSession,
  type LightMatch,
  type PlayerRun,
} from "../engine/international";
import type { SquadPlayer } from "../engine/lineup";
import { EXTRA_TIME_GOAL_OFFSET } from "../engine/match";
import { NAME_BANK } from "../engine/names";
import {
  callUp,
  generateReserve,
  isNationCode,
  nationByCode,
  NATIONS,
  NATIONS_ENABLED,
  nationOfNationality,
  reserveAfterSeason,
  type NationCode,
  type ReservePlayer,
} from "../engine/nations";
import { POSITIONS, type Position } from "../engine/positions";
import { breakWindows } from "../engine/schedule";
import {
  cycleOf,
  CYCLES_ENABLED,
  drawTournament,
  FRIENDLY,
  friendlyHistory,
  internationalTable,
  HEMISPHERES_CUP,
  playTournament,
  QUALIFIER_EUROPE,
  QUALIFIER_WORLD,
  seasonInternationalMatches,
  titleKey,
  tournamentDates,
  tournamentEnding,
  zoneNations,
  type InternationalResult,
  type TournamentCode,
  type TournamentGroups,
} from "../engine/tournaments";
import { Prisma, type PrismaClient } from "../generated/prisma/client";

// The national teams of a save (docs/design/selections.md): its nations and their reserves; the international matches of
// its breaks, qualifiers of its cycles and friendlies around them, created at each season's opening; a break played in
// one step, light, between two dates of the clubs; and the summer tournament that ends a cycle, played light at the
// start of the season's transition.

type Transaction = Prisma.TransactionClient;
type Db = PrismaClient | Transaction;

const DAY_MS = 86_400_000;

/** The competitions a break plays: never a tournament, whose matches are only written once played, in June. */
const BREAK_COMPETITIONS = [FRIENDLY, QUALIFIER_EUROPE, QUALIFIER_WORLD];

/** Whether the season starting in startYear of a save has breaks: from its first season with nations (Save.breaksFrom). */
export function seasonHasBreaks(breaksFrom: number | null, startYear: number): boolean {
  return breaksFrom !== null && startYear >= breaksFrom;
}

/**
 * Whether a save has national teams from its next season: a worldVersion 2 save, never a challenge's, while the game
 * gives them (NATIONS_ENABLED), or one that already has them.
 */
export function nationsFor(save: { worldVersion: number; challengeId: string | null; breaksFrom: number | null }): boolean {
  return save.worldVersion === 2 && save.challengeId === null && (NATIONS_ENABLED || save.breaksFrom !== null);
}

/**
 * The first season of a save's first cycle, for the season starting in startYear that it opens: the one it already has,
 * or, with nations and while the game gives cycles (CYCLES_ENABLED), this one. A save that had breaks before the cycles
 * gets its first at its next season (docs/design/selections.md § 3.5).
 */
export function cyclesFromFor(save: { cyclesFrom: number | null }, breaksFrom: number | null, startYear: number): number | null {
  if (save.cyclesFrom !== null) {
    return save.cyclesFrom;
  }
  return CYCLES_ENABLED && seasonHasBreaks(breaksFrom, startYear) ? startYear : null;
}

const rating = z.number().int().min(1).max(99);
const reservePlayerSchema = z.object({
  key: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  position: z.enum(POSITIONS),
  overall: rating,
  potential: rating,
  pace: rating,
  shooting: rating,
  passing: rating,
  dribbling: rating,
  defending: rating,
  physical: rating,
  goalkeeping: rating,
});

/** A nation's reserve as NationSave.reserve holds it. */
export const nationReserveSchema = z.array(reservePlayerSchema);

export function parseReserve(value: unknown): ReservePlayer[] {
  return nationReserveSchema.parse(value);
}

const zeros = (count: number): number[] => Array.from({ length: count }, () => 0);

/** Strength in thousandths of a point expected, as NationSave.strength keeps it. */
const STRENGTH_SCALE = 1000;

/** The nations' strengths at the opening of the save's cycle in progress (NationSave.strength), 0 before the first. */
export async function readStrengths(db: Db, saveId: string): Promise<Map<NationCode, number>> {
  const rows = await db.nationSave.findMany({ where: { saveId }, select: { code: true, strength: true } });
  return new Map(rows.flatMap((row) => (isNationCode(row.code) ? [[row.code, row.strength ?? 0] as const] : [])));
}

/**
 * The national teams of a season about to start (startYear) in a save with nations: its nations and their reserves the
 * first time (generateReserve), a season older afterwards (reserveAfterSeason: a retired reserve player's caps start
 * again from 0 with the one who takes his place); at a cycle's opening, each nation's strength (its 23 of the first break
 * as an AI club would field them, rankFormations); then the season's international matches (seasonInternationalMatches):
 * the qualifiers of its cycle and friendlies between the nations left, paired on the save's history. Returns the matches
 * written.
 */
export async function openNations(
  tx: Transaction,
  input: { saveId: string; saveSeed: string; cyclesFrom: number | null; startYear: number; currentDate: Date },
): Promise<number> {
  const { saveId, saveSeed, cyclesFrom, startYear, currentDate } = input;
  const existing = await tx.nationSave.findMany({
    where: { saveId },
    select: { id: true, code: true, reserve: true, reserveCaps: true, reserveGoals: true },
  });
  if (existing.length === 0) {
    await tx.nationSave.createMany({
      data: NATIONS.map((nation) => {
        const reserve = generateReserve(nation, NAME_BANK, saveSeed, startYear);
        return { saveId, code: nation.code, reserve, reserveCaps: zeros(reserve.length), reserveGoals: zeros(reserve.length) };
      }),
    });
  } else {
    for (const row of existing) {
      if (!isNationCode(row.code)) {
        throw new Error(`Unknown nation ${row.code} in save ${saveId}`);
      }
      const reserve = parseReserve(row.reserve);
      const aged = reserveAfterSeason(nationByCode(row.code), reserve, NAME_BANK, saveSeed, startYear);
      const kept = (index: number): boolean => aged[index].key === reserve[index]?.key;
      await tx.nationSave.update({
        where: { id: row.id, saveId },
        data: {
          reserve: aged,
          reserveCaps: aged.map((_, index) => (kept(index) ? (row.reserveCaps[index] ?? 0) : 0)),
          reserveGoals: aged.map((_, index) => (kept(index) ? (row.reserveGoals[index] ?? 0) : 0)),
        },
      });
    }
  }

  const cycle = cycleOf(cyclesFrom, startYear);
  if (cycle !== null && cycle.season === 0) {
    const called = await readCallUps(tx, saveId, breakWindows(startYear)[0].dates[0], currentDate);
    const strengths = [...called].map(([code, players]) => ({ code, strength: Math.round((rankFormations(players, 1)[0]?.points ?? 0) * STRENGTH_SCALE) }));
    await tx.$executeRaw`
      UPDATE "NationSave" AS n SET "strength" = v."strength"
      FROM (VALUES ${Prisma.join(strengths.map((row) => Prisma.sql`(${row.code}::text, ${row.strength}::int)`))}) AS v("code", "strength")
      WHERE n."saveId" = ${saveId} AND n."code" = v."code"`;
  }
  const strengths = await readStrengths(tx, saveId);
  const past = await tx.internationalMatch.findMany({ where: { saveId }, select: { home: true, away: true, scheduledAt: true, neutral: true } });
  const history = friendlyHistory(
    past.flatMap((match) =>
      isNationCode(match.home) && isNationCode(match.away) ? [{ home: match.home, away: match.away, date: match.scheduledAt, neutral: match.neutral }] : [],
    ),
  );
  const matches = seasonInternationalMatches({ saveSeed, startYear, cycle, history, strengths }).map((match) => ({
    saveId,
    startYear,
    competition: match.competition,
    round: match.round,
    scheduledAt: match.date,
    home: match.home,
    away: match.away,
  }));
  await tx.internationalMatch.createMany({ data: matches });
  return matches.length;
}

// ------------------------------------------------------------------ Call-ups

/** A player a nation may call, of our clubs or of its reserve, as he is on a date. */
export type NationPlayer = SquadPlayer & {
  nation: NationCode;
  firstName: string;
  lastName: string;
  caps: number; // before the break
  goals: number;
  playerSaveId: string | null; // null for a reserve player
  clubSaveId: string | null;
  reserveIndex: number | null; // his place in his nation's reserve
};

type CandidateRow = {
  id: string;
  playerKey: string;
  firstName: string;
  lastName: string;
  caps: number;
  internationalGoals: number;
  nationality: string;
  position: Position;
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  goalkeeping: number;
  form: number;
  morale: number;
  fitness: number;
  clubSaveId: string;
};

/** Candidates read by line: the best of each, enough for the call-up's lines and its last two places. */
const CANDIDATES_PER_LINE = 10;

/**
 * The players of our clubs the nations may call on a date: of a nation's nationality, at a club, neither retired nor
 * injured then, the CANDIDATES_PER_LINE best of each line of each nationality, in one query (the base ranks them).
 */
async function readCandidates(db: Db, saveId: string, date: Date): Promise<CandidateRow[]> {
  const nationalities = NATIONS.map((nation) => nation.nationality);
  return db.$queryRaw<CandidateRow[]>`
    SELECT "id", "playerKey", "firstName", "lastName", "caps", "internationalGoals", "nationality", "position", "overall",
      "pace", "shooting", "passing", "dribbling", "defending", "physical", "goalkeeping", "form", "morale", "fitness",
      "clubSaveId"
    FROM (
      SELECT p."id", p."playerKey", p."firstName", p."lastName", p."caps", p."internationalGoals", p."nationality",
        p."position", p."overall", p."pace", p."shooting", p."passing", p."dribbling", p."defending", p."physical",
        p."goalkeeping", p."form", p."morale", p."fitness", p."clubSaveId",
        ROW_NUMBER() OVER (
          PARTITION BY p."nationality",
            CASE WHEN p."position" = 'GK' THEN 0
              WHEN p."position" IN ('RB', 'CB', 'LB') THEN 1
              WHEN p."position" IN ('RW', 'LW', 'ST') THEN 3
              ELSE 2 END
          ORDER BY p."overall" DESC, p."playerKey"
        ) AS "line"
      FROM "PlayerSave" p
      WHERE p."saveId" = ${saveId} AND p."clubSaveId" IS NOT NULL AND NOT p."retired"
        AND p."nationality" IN (${Prisma.join(nationalities)})
        AND (p."injuredUntil" IS NULL OR p."injuredUntil" <= ${date.toISOString()}::timestamp(3))
    ) AS ranked
    WHERE "line" <= ${CANDIDATES_PER_LINE}`;
}

/** A nation's reserve and its counters, as its row holds them. */
export type ReserveRow = { id: string; code: NationCode; reserve: ReservePlayer[]; caps: number[]; goals: number[] };

export async function readReserves(db: Db, saveId: string): Promise<ReserveRow[]> {
  const rows = await db.nationSave.findMany({
    where: { saveId },
    orderBy: { code: "asc" },
    select: { id: true, code: true, reserve: true, reserveCaps: true, reserveGoals: true },
  });
  return rows.map((row) => {
    if (!isNationCode(row.code)) {
      throw new Error(`Unknown nation ${row.code} in save ${saveId}`);
    }
    return { id: row.id, code: row.code, reserve: parseReserve(row.reserve), caps: row.reserveCaps, goals: row.reserveGoals };
  });
}

/**
 * Each nation's 23 for a break whose first date is `date` (callUp), of the save as it is at `currentDate`: the players of
 * our clubs at their fitness then (recovered over the days in between), the reserve players rested, every one in form
 * and morale as his row holds them (50 for a reserve player). The same call-up for the preview of the dashboard and for
 * the break itself: nothing a call-up reads changes between the clubs' last date before a break and the break.
 */
export async function readCallUps(db: Db, saveId: string, date: Date, currentDate: Date): Promise<Map<NationCode, NationPlayer[]>> {
  return (await readCallUpsAndReserves(db, saveId, date, currentDate)).called;
}

/** readCallUps, and the reserves it read: a break counts its reserve players' caps on them. */
async function readCallUpsAndReserves(
  db: Db,
  saveId: string,
  date: Date,
  currentDate: Date,
): Promise<{ called: Map<NationCode, NationPlayer[]>; reserves: ReserveRow[] }> {
  // One query at a time: `db` may be a transaction's client.
  const candidates = await readCandidates(db, saveId, date);
  const reserves = await readReserves(db, saveId);
  const restDays = Math.max(0, Math.round((date.getTime() - currentDate.getTime()) / DAY_MS));
  const byNation = new Map<NationCode, NationPlayer[]>();
  for (const row of candidates) {
    const nation = nationOfNationality(row.nationality);
    if (nation === undefined) {
      continue;
    }
    const players = byNation.get(nation.code) ?? [];
    players.push({
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
      fitness: recoveredFitness(row.fitness, restDays),
      nation: nation.code,
      firstName: row.firstName,
      lastName: row.lastName,
      caps: row.caps,
      goals: row.internationalGoals,
      playerSaveId: row.id,
      clubSaveId: row.clubSaveId,
      reserveIndex: null,
    });
    byNation.set(nation.code, players);
  }
  const called = new Map<NationCode, NationPlayer[]>();
  for (const row of reserves) {
    const reserve = row.reserve.map(
      (player, index): NationPlayer => ({
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
        fitness: FULL_FITNESS,
        nation: row.code,
        firstName: player.firstName,
        lastName: player.lastName,
        caps: row.caps[index] ?? 0,
        goals: row.goals[index] ?? 0,
        playerSaveId: null,
        clubSaveId: null,
        reserveIndex: index,
      }),
    );
    const inLeague = byNation.get(row.code) ?? [];
    called.set(
      row.code,
      callUp([...inLeague.map((player) => ({ ...player, reserve: false })), ...reserve.map((player) => ({ ...player, reserve: true }))]),
    );
  }
  return { called, reserves };
}

// ------------------------------------------------------------------ Writing what a session played

/** What a break did to one of the managed club's players, for the screens. */
export type ManagedInternational = {
  playerKey: string;
  nation: NationCode;
  matches: number; // matches he played in (called but unused: 0)
  goals: number;
  injuryDays: number | null;
  injuredOn: Date | null;
};

export type BreakSummary = {
  from: Date;
  to: Date;
  matches: number;
  managed: ManagedInternational[]; // the managed club's players the nations called
};

/** One of the managed club's players in a match, as InternationalMatch.managedPlayers keeps him. */
const managedPlayerSchema = z.object({
  playerKey: z.string(),
  side: z.enum(["home", "away"]),
  minutes: z.number().int().min(0),
  goals: z.number().int().min(0),
  injuryDays: z.number().int().positive().nullable(),
});
export const managedPlayersSchema = z.array(managedPlayerSchema);
export type ManagedPlayer = z.infer<typeof managedPlayerSchema>;

const daysBetween = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));

/** A match a session played: its row's id when it has one (a break's), its date and nations. */
type SessionResult = { id: string | null; date: Date; home: string; away: string; match: LightMatch };

/** The managed club's players in a match, called by either side: the screens tell the break from them. */
function managedLinesOf(session: InternationalSession<NationPlayer>, result: SessionResult, managedId: string): ManagedPlayer[] {
  return (["home", "away"] as const).flatMap((side) =>
    session
      .teamOn(side === "home" ? result.home : result.away, result.date)
      .players.filter((player) => player.clubSaveId === managedId)
      .map((player) => {
        const spells = result.match.appearances.filter((entry) => entry.side === side && entry.playerId === player.id);
        return {
          playerKey: player.id,
          side,
          minutes: spells.reduce((sum, entry) => sum + entry.to - entry.from, 0),
          goals: result.match.goals.filter((goal) => goal.side === side && goal.playerId === player.id).length,
          injuryDays: spells.find((entry) => entry.injuryDays !== null)?.injuryDays ?? null,
        };
      }),
  );
}

/** A match's goals as InternationalMatch.goalTimes keeps them: the minute, + 1000 in extra time, negative away. */
const goalTimesOfMatch = (match: LightMatch): number[] =>
  match.goals.map((goal) => {
    const time = goal.minute > 90 ? goal.minute + EXTRA_TIME_GOAL_OFFSET : goal.minute;
    return goal.side === "home" ? time : -time;
  });

/** The players called whose session it was, with their run: those who played at least once. */
type CalledRun = { player: NationPlayer; run: PlayerRun };

function playedRuns(session: InternationalSession<NationPlayer>, called: ReadonlyMap<string, readonly NationPlayer[]>): CalledRun[] {
  return [...called.values()].flat().flatMap((player) => {
    const run = session.runs.get(player.id);
    return run !== undefined && run.caps > 0 ? [{ player, run }] : [];
  });
}

/** The reserve players' caps and goals of a session, every nation in one statement. */
async function writeReserveCounters(tx: Transaction, saveId: string, reserves: readonly ReserveRow[], runs: readonly CalledRun[]): Promise<void> {
  const counters = reserves.flatMap((row) => {
    const played = runs.filter(({ player }) => player.nation === row.code && player.reserveIndex !== null);
    if (played.length === 0) {
      return [];
    }
    const caps = row.reserve.map((_, index) => row.caps[index] ?? 0);
    const goals = row.reserve.map((_, index) => row.goals[index] ?? 0);
    for (const { player, run } of played) {
      const index = player.reserveIndex ?? -1;
      caps[index] += run.caps;
      goals[index] += run.goals;
    }
    return [{ id: row.id, caps, goals }];
  });
  if (counters.length > 0) {
    await tx.$executeRaw`
      UPDATE "NationSave" AS n
      SET "reserveCaps" = v."caps", "reserveGoals" = v."goals"
      FROM (VALUES ${Prisma.join(counters.map((row) => Prisma.sql`(${row.id}::text, ${row.caps}::int[], ${row.goals}::int[])`))}) AS v("id", "caps", "goals")
      WHERE n."id" = v."id" AND n."saveId" = ${saveId}`;
  }
}

/** The managed club's players a session called, with what it did to them. */
function managedSummary(session: InternationalSession<NationPlayer>, called: ReadonlyMap<string, readonly NationPlayer[]>, managedId: string): ManagedInternational[] {
  return [...called.values()]
    .flat()
    .filter((player) => player.clubSaveId === managedId)
    .map((player) => {
      const run = session.runs.get(player.id);
      return {
        playerKey: player.id,
        nation: player.nation,
        matches: run?.caps ?? 0,
        goals: run?.goals ?? 0,
        injuryDays: run?.injuryDays ?? null,
        injuredOn: run?.injuredOn ?? null,
      };
    });
}

// ------------------------------------------------------------------ A break, played

/**
 * Plays a break: every unplayed match of the save's breaks before `before` (the next date of the clubs; null once none is
 * left), in date order, as one step of the save. Each nation calls its 23 on the break's first date (readCallUps) and
 * keeps its formation for the break; each match is played light (playLightMatch, its own seed), its players' fitness recovering day by day between the dates and lost on the
 * pitch, an injury out from its date. Then, in a few statements: the matches' results, the recovery of every other player
 * of the save up to the break's last date (as a matchday does), the rows of the players of our clubs who played (fitness
 * at that date, injury, caps and goals added), the reserves' counters, and the save's date, the break's last. Returns
 * null without a match.
 */
export async function playInternationalBreak(
  tx: Transaction,
  save: { id: string; seed: string; currentDate: Date },
  before: Date | null,
): Promise<BreakSummary | null> {
  const saveId = save.id;
  const matches = await tx.internationalMatch.findMany({
    where: { saveId, played: false, competition: { in: BREAK_COMPETITIONS }, ...(before === null ? {} : { scheduledAt: { lt: before } }) },
    orderBy: [{ scheduledAt: "asc" }, { round: "asc" }, { home: "asc" }],
    select: { id: true, competition: true, scheduledAt: true, home: true, away: true, neutral: true },
  });
  if (matches.length === 0) {
    return null;
  }
  const first = matches[0].scheduledAt;
  const last = matches[matches.length - 1].scheduledAt;
  const managed = await tx.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });

  const { called, reserves } = await readCallUpsAndReserves(tx, saveId, first, save.currentDate);
  const session = internationalSession(called, first);
  const results: SessionResult[] = matches.map((fixture) => ({
    id: fixture.id,
    date: fixture.scheduledAt,
    home: fixture.home,
    away: fixture.away,
    match: session.play(fixture.home, fixture.away, fixture.scheduledAt, internationalMatchRngSeed(save.seed, fixture.scheduledAt, fixture.home, fixture.away), {
      neutral: fixture.neutral,
      knockout: false,
    }),
  }));

  await tx.$executeRaw`
    UPDATE "InternationalMatch" AS m
    SET "played" = true, "homeGoals" = v."homeGoals", "awayGoals" = v."awayGoals", "goalTimes" = v."goalTimes",
      "scorers" = v."scorers", "managedPlayers" = v."managedPlayers"
    FROM (VALUES ${Prisma.join(
      results.map(
        (result) => Prisma.sql`(${result.id}::text, ${result.match.homeGoals}::int, ${result.match.awayGoals}::int,
          ${goalTimesOfMatch(result.match)}::int[], ${result.match.goals.map((goal) => goal.playerId)}::text[],
          ${JSON.stringify(managedLinesOf(session, result, managed.id))}::jsonb)`,
      ),
    )}) AS v("id", "homeGoals", "awayGoals", "goalTimes", "scorers", "managedPlayers")
    WHERE m."id" = v."id" AND m."saveId" = ${saveId}`;

  // Every player who played gets his row written at the break's last date; the others recover as on a matchday.
  const runs = playedRuns(session, called);
  const playedInLeague = runs.filter(({ player }) => player.playerSaveId !== null);
  const restDays = daysBetween(save.currentDate, last);
  if (restDays > 0) {
    const others =
      playedInLeague.length === 0
        ? Prisma.empty
        : Prisma.sql`AND "id" NOT IN (${Prisma.join(playedInLeague.map(({ player }) => player.playerSaveId ?? ""))})`;
    await tx.$executeRaw`
      UPDATE "PlayerSave"
      SET "fitness" = LEAST(${FULL_FITNESS}, "fitness" + ${FITNESS_RECOVERY_PER_DAY * restDays})
      WHERE "saveId" = ${saveId} AND "fitness" < ${FULL_FITNESS} ${others}`;
  }
  // Dates go through ISO strings: a Date parameter would be sent in the server's local time zone.
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
      WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
  }
  await writeReserveCounters(tx, saveId, reserves, runs);
  await tx.save.update({ where: { id: saveId }, data: { currentDate: last } });

  return { from: first, to: last, matches: results.length, managed: managedSummary(session, called, managed.id) };
}

// ------------------------------------------------------------------ The summer tournament (§ 3.3)

/** The final tables of a cycle's qualifiers, of each zone: Europe always, the World zone in a Hemispheres cycle. */
export type QualifierTables = { europe: ReturnType<typeof internationalTable>; world: ReturnType<typeof internationalTable> };

/** A cycle's qualifiers' results so far, of the seasons starting from cycleStartYear, played only. */
export async function readQualifierTables(
  db: Db,
  saveId: string,
  cycle: { startYear: number; tournament: TournamentCode },
  strengths: ReadonlyMap<NationCode, number>,
): Promise<QualifierTables & { played: number }> {
  const rows = await db.internationalMatch.findMany({
    where: {
      saveId,
      played: true,
      competition: { in: [QUALIFIER_EUROPE, QUALIFIER_WORLD] },
      startYear: { in: [cycle.startYear, cycle.startYear + 1] },
    },
    select: { competition: true, home: true, away: true, homeGoals: true, awayGoals: true },
  });
  const results = (competition: string): InternationalResult[] =>
    rows.flatMap((row) =>
      row.competition === competition && isNationCode(row.home) && isNationCode(row.away)
        ? [{ home: row.home, away: row.away, homeGoals: row.homeGoals ?? 0, awayGoals: row.awayGoals ?? 0 }]
        : [],
    );
  return {
    europe: internationalTable(zoneNations("EUROPE"), results(QUALIFIER_EUROPE), strengths),
    world: cycle.tournament === HEMISPHERES_CUP ? internationalTable(zoneNations("WORLD"), results(QUALIFIER_WORLD), strengths) : [],
    played: rows.length,
  };
}

/** A summer tournament, played: for the transition's screens and the season's highlights. */
export type TournamentSummary = {
  tournament: TournamentCode;
  year: number;
  groups: TournamentGroups;
  winner: NationCode;
  runnerUp: NationCode;
  matches: number;
  managed: ManagedInternational[]; // the managed club's players the qualified nations called
  managedTitles: { playerKey: string; name: string; nation: NationCode }[]; // of them, the winner's who played in it
};

/**
 * The summer tournament that ends the cycle of the season closing (completedStartYear), if it ends one, played light at
 * the start of the season's transition (docs/design/selections.md § 3.3): the final tables of the cycle's qualifiers, the
 * draw (drawTournament), the qualified nations' 23 called on its first date, its fifteen or nine matches (playTournament);
 * then, in a few statements, its matches written, played (InternationalMatch, the season closing's), the caps and goals
 * of the players of our clubs who played, the title of the winner's players of our clubs who played in it (PlayerSave.internationalTitles),
 * and the reserves' counters. Their fitness and injuries are not written: the transition gives every player back his full
 * fitness and heals him (advanceToNextSeason), the tournament's as the others. null when the season ends no cycle.
 */
export async function playSummerTournament(
  tx: Transaction,
  save: { id: string; seed: string; currentDate: Date; cyclesFrom: number | null },
  completedStartYear: number,
): Promise<TournamentSummary | null> {
  const cycle = tournamentEnding(save.cyclesFrom, completedStartYear);
  if (cycle === null) {
    return null;
  }
  const saveId = save.id;
  const strengths = await readStrengths(tx, saveId);
  const tables = await readQualifierTables(tx, saveId, cycle, strengths);
  const groups = drawTournament({ tournament: cycle.tournament, ...tables, strengths, saveSeed: save.seed, year: cycle.tournamentYear });
  const dates = tournamentDates(cycle.tournamentYear);
  const qualified = new Set<string>(groups.flat());
  const { called: all, reserves } = await readCallUpsAndReserves(tx, saveId, dates[0], save.currentDate);
  const called = new Map([...all].filter(([code]) => qualified.has(code)));
  const session = internationalSession(called, dates[0]);
  const played = playTournament({
    session,
    groups,
    dates,
    strengths,
    seedOf: (date, home, away) => internationalMatchRngSeed(save.seed, date, home, away),
  });
  const managed = await tx.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });

  await tx.internationalMatch.createMany({
    data: played.matches.map(({ round, pool, date, home, away, match }) => {
      const knockout = match.winner !== null;
      return {
        saveId,
        startYear: completedStartYear,
        competition: cycle.tournament,
        round,
        pool,
        scheduledAt: date,
        home,
        away,
        neutral: true,
        played: true,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        decidedBy: knockout ? match.decidedBy : null,
        homePenalties: match.penalties?.home ?? null,
        awayPenalties: match.penalties?.away ?? null,
        winner: knockout ? (match.winner === "home" ? home : away) : null,
        goalTimes: goalTimesOfMatch(match),
        scorers: match.goals.map((goal) => goal.playerId),
        managedPlayers: managedLinesOf(session, { id: null, date, home, away, match }, managed.id),
      };
    }),
  });

  const runs = playedRuns(session, called);
  const playedInLeague = runs.filter(({ player }) => player.playerSaveId !== null);
  if (playedInLeague.length > 0) {
    await tx.$executeRaw`
      UPDATE "PlayerSave" AS p
      SET "caps" = p."caps" + v."caps", "internationalGoals" = p."internationalGoals" + v."goals"
      FROM (VALUES ${Prisma.join(playedInLeague.map(({ player, run }) => Prisma.sql`(${player.playerSaveId}::text, ${run.caps}::int, ${run.goals}::int)`))})
        AS v("id", "caps", "goals")
      WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
  }
  // The champions: the winner's players of our clubs who played in it, a minute at least.
  const champions = (called.get(played.winner) ?? []).filter((player) => player.playerSaveId !== null && (session.runs.get(player.id)?.caps ?? 0) > 0);
  if (champions.length > 0) {
    await tx.$executeRaw`
      UPDATE "PlayerSave"
      SET "internationalTitles" = array_append("internationalTitles", ${titleKey(cycle.tournament, cycle.tournamentYear)})
      WHERE "saveId" = ${saveId} AND "id" IN (${Prisma.join(champions.map((player) => player.playerSaveId ?? ""))})`;
  }
  await writeReserveCounters(tx, saveId, reserves, runs);

  return {
    tournament: cycle.tournament,
    year: cycle.tournamentYear,
    groups,
    winner: played.winner,
    runnerUp: played.runnerUp,
    matches: played.matches.length,
    managed: managedSummary(session, called, managed.id),
    managedTitles: champions
      .filter((player) => player.clubSaveId === managed.id)
      .map((player) => ({ playerKey: player.id, name: `${player.firstName} ${player.lastName}`, nation: player.nation })),
  };
}

