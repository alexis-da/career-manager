import * as z from "zod";
import { FITNESS_RECOVERY_PER_DAY, FULL_FITNESS } from "../engine/balance";
import { recoveredFitness } from "../engine/fitness";
import {
  internationalMatchRngSeed,
  nationFormation,
  playLightFriendly,
  type LightMatch,
  type NationTeam,
} from "../engine/international";
import type { SquadPlayer } from "../engine/lineup";
import { NAME_BANK } from "../engine/names";
import {
  callUp,
  friendliesOfRound,
  friendlyRoundOf,
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
import { Prisma, type PrismaClient } from "../generated/prisma/client";

// The national teams of a save (docs/design/selections.md, N1 and N2): its nations and their reserves, the friendlies of
// its breaks, created at each season's opening, and a break played in one step, light, between two dates of the clubs.

type Transaction = Prisma.TransactionClient;
type Db = PrismaClient | Transaction;

const DAY_MS = 86_400_000;

/** The friendlies' competition code: the qualifiers and the tournaments come with N3. */
export const FRIENDLY = "int.friendly";

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

/**
 * The national teams of a season about to start (startYear) in a save with nations: its nations and their reserves the
 * first time (generateReserve), a season older afterwards (reserveAfterSeason: a retired reserve player's caps start
 * again from 0 with the one who takes his place), then the season's friendlies, a round of the save's round-robin at
 * each international date of its breaks (friendliesOfRound). Returns the matches written.
 */
export async function openNations(
  tx: Transaction,
  input: { saveId: string; saveSeed: string; breaksFrom: number; startYear: number },
): Promise<number> {
  const { saveId, saveSeed, breaksFrom, startYear } = input;
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

  const matches = breakWindows(startYear).flatMap((window) =>
    window.dates.flatMap((date, inWindow) => {
      const dateIndex = window.index * window.dates.length + inWindow;
      return friendliesOfRound(saveSeed, friendlyRoundOf(breaksFrom, startYear, dateIndex)).map((pair) => ({
        saveId,
        startYear,
        competition: FRIENDLY,
        round: dateIndex + 1,
        scheduledAt: date,
        home: pair.home,
        away: pair.away,
      }));
    }),
  );
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

// ------------------------------------------------------------------ A break, played

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

/** A player as a break changes him: his fitness and the day it is for, his injury, his caps and goals of the break. */
type BreakState = {
  player: NationPlayer;
  fitness: number;
  asOf: Date;
  injuredUntil: Date | null;
  injuryDays: number | null;
  injuredOn: Date | null;
  caps: number;
  goals: number;
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

/**
 * Plays a break: every unplayed international match of the save before `before` (the next date of the clubs; null once
 * none is left), in date order, as one step of the save. Each nation calls its 23 on the break's first date
 * (readCallUps) and keeps its formation for the break (nationFormation); each match is played light (playLightFriendly,
 * its own seed), its players' fitness recovering day by day between the dates and lost on the pitch, an injury out from
 * its date. Then, in a few statements: the matches' results, the recovery of every other player of the save up to the
 * break's last date (as a matchday does), the rows of the players of our clubs who played (fitness at that date, injury,
 * caps and goals added), the reserves' counters, and the save's date, the break's last. Returns null without a match.
 */
export async function playInternationalBreak(
  tx: Transaction,
  save: { id: string; seed: string; currentDate: Date },
  before: Date | null,
): Promise<BreakSummary | null> {
  const saveId = save.id;
  const matches = await tx.internationalMatch.findMany({
    where: { saveId, played: false, ...(before === null ? {} : { scheduledAt: { lt: before } }) },
    orderBy: [{ scheduledAt: "asc" }, { round: "asc" }, { home: "asc" }],
    select: { id: true, scheduledAt: true, home: true, away: true, neutral: true },
  });
  if (matches.length === 0) {
    return null;
  }
  const first = matches[0].scheduledAt;
  const last = matches[matches.length - 1].scheduledAt;
  const managed = await tx.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });

  const { called, reserves } = await readCallUpsAndReserves(tx, saveId, first, save.currentDate);
  const states = new Map<string, BreakState>();
  const teams = new Map<string, NationTeam<NationPlayer>>();
  for (const [code, players] of called) {
    for (const player of players) {
      states.set(player.id, {
        player,
        fitness: player.fitness,
        asOf: first,
        injuredUntil: null,
        injuryDays: null,
        injuredOn: null,
        caps: 0,
        goals: 0,
      });
    }
    teams.set(code, { code, players, formation: nationFormation(players) });
  }

  /** A nation's team on a date: its players at their fitness then, the injured out. */
  const teamOn = (code: string, date: Date): NationTeam<NationPlayer> => {
    const team = teams.get(code);
    if (team === undefined) {
      throw new Error(`Nation ${code} has no call-up in save ${saveId}`);
    }
    return {
      ...team,
      players: team.players.map((player) => {
        const state = states.get(player.id);
        if (state === undefined) {
          return player;
        }
        return {
          ...player,
          fitness: recoveredFitness(state.fitness, daysBetween(state.asOf, date)),
          injured: state.injuredUntil !== null && state.injuredUntil > date,
        };
      }),
    };
  };

  const results: { id: string; date: Date; home: string; away: string; match: LightMatch }[] = [];
  for (const fixture of matches) {
    const home = teamOn(fixture.home, fixture.scheduledAt);
    const away = teamOn(fixture.away, fixture.scheduledAt);
    const match = playLightFriendly(home, away, internationalMatchRngSeed(save.seed, fixture.scheduledAt, fixture.home, fixture.away), {
      neutral: fixture.neutral,
    });
    for (const appearance of match.appearances) {
      const state = states.get(appearance.playerId);
      if (state === undefined) {
        continue;
      }
      state.fitness = appearance.fitness;
      state.asOf = fixture.scheduledAt;
      state.caps++;
      if (appearance.injuryDays !== null) {
        state.injuryDays = appearance.injuryDays;
        state.injuredOn = fixture.scheduledAt;
        state.injuredUntil = new Date(fixture.scheduledAt.getTime() + appearance.injuryDays * DAY_MS);
      }
    }
    for (const goal of match.goals) {
      const state = states.get(goal.playerId);
      if (state !== undefined) {
        state.goals++;
      }
    }
    results.push({ id: fixture.id, date: fixture.scheduledAt, home: fixture.home, away: fixture.away, match });
  }

  // The managed club's players in each match, called by either side: the screens tell the break from them.
  const managedOf = (result: (typeof results)[number]): ManagedPlayer[] =>
    (["home", "away"] as const).flatMap((side) =>
      teamOn(side === "home" ? result.home : result.away, result.date)
        .players.filter((player) => player.clubSaveId === managed.id)
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

  await tx.$executeRaw`
    UPDATE "InternationalMatch" AS m
    SET "played" = true, "homeGoals" = v."homeGoals", "awayGoals" = v."awayGoals", "goalTimes" = v."goalTimes",
      "scorers" = v."scorers", "managedPlayers" = v."managedPlayers"
    FROM (VALUES ${Prisma.join(
      results.map(
        (result) => Prisma.sql`(${result.id}::text, ${result.match.homeGoals}::int, ${result.match.awayGoals}::int,
          ${result.match.goals.map((goal) => (goal.side === "home" ? goal.minute : -goal.minute))}::int[],
          ${result.match.goals.map((goal) => goal.playerId)}::text[],
          ${JSON.stringify(managedOf(result))}::jsonb)`,
      ),
    )}) AS v("id", "homeGoals", "awayGoals", "goalTimes", "scorers", "managedPlayers")
    WHERE m."id" = v."id" AND m."saveId" = ${saveId}`;

  // Every player who played gets his row written at the break's last date; the others recover as on a matchday.
  const playedInLeague = [...states.values()].filter((state) => state.caps > 0 && state.player.playerSaveId !== null);
  const restDays = daysBetween(save.currentDate, last);
  if (restDays > 0) {
    const others =
      playedInLeague.length === 0
        ? Prisma.empty
        : Prisma.sql`AND "id" NOT IN (${Prisma.join(playedInLeague.map((state) => state.player.playerSaveId ?? ""))})`;
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
          (state) => Prisma.sql`(${state.player.playerSaveId}::text,
            ${Math.round(recoveredFitness(state.fitness, daysBetween(state.asOf, last)))}::int,
            ${state.injuredUntil?.toISOString() ?? null}::timestamp(3), ${state.caps}::int, ${state.goals}::int)`,
        ),
      )}) AS v("id", "fitness", "injuredUntil", "caps", "goals")
      WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
  }

  // The reserve players' caps and goals, every nation in one statement.
  const counters = reserves.flatMap((row) => {
    const played = [...states.values()].filter((state) => state.player.nation === row.code && state.player.reserveIndex !== null && state.caps > 0);
    if (played.length === 0) {
      return [];
    }
    const caps = row.reserve.map((_, index) => row.caps[index] ?? 0);
    const goals = row.reserve.map((_, index) => row.goals[index] ?? 0);
    for (const state of played) {
      const index = state.player.reserveIndex ?? -1;
      caps[index] += state.caps;
      goals[index] += state.goals;
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

  await tx.save.update({ where: { id: saveId }, data: { currentDate: last } });

  return {
    from: first,
    to: last,
    matches: results.length,
    managed: [...states.values()]
      .filter((state) => state.player.clubSaveId === managed.id)
      .map((state) => ({
        playerKey: state.player.id,
        nation: state.player.nation,
        matches: state.caps,
        goals: state.goals,
        injuryDays: state.injuryDays,
        injuredOn: state.injuredOn,
      })),
  };
}
