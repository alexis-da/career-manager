import { DEFAULT_FORMATION_NAME, type FormationName } from "../engine/formations";
import { autoFilledSlots, resolveLineup, selectLineup, type Lineup, type SquadPlayer } from "../engine/lineup";
import {
  eventsToPersist,
  halfRngSeed,
  matchRngSeed,
  nextForm,
  outcomeFor,
  playerMatchStats,
  simulateHalf,
  simulateMatch,
  startMatch,
  type MatchEvent,
  type MatchResult,
  type PlayerMatchStats,
  type Side,
} from "../engine/match";
import { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";
import { serializeLiveState } from "./live-state";
import { parseFormation, parseSavedLineup } from "./lineup";

// A matchday writes a few thousand rows, in a handful of bulk statements.
// Re-exported for live-match.ts, which shares the matchday transaction settings.
export { TRANSACTION_MAX_WAIT_MS };
export const TRANSACTION_TIMEOUT_MS = 60_000;

const DAY_MS = 86_400_000;

type Transaction = Prisma.TransactionClient;

/** Refusal of anything that moves the save forward while the managed club's match waits at half-time. */
export class MatchInProgressError extends Error {
  constructor(readonly fixtureId: string) {
    super(`The managed club's match ${fixtureId} is paused at half-time`);
    this.name = "MatchInProgressError";
  }
}

/** Throws MatchInProgressError while the save has a match paused at half-time. */
export async function assertNoMatchInProgress(db: Transaction | typeof prisma, saveId: string): Promise<void> {
  const save = await db.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true } });
  if (save.liveFixtureId !== null) {
    throw new MatchInProgressError(save.liveFixtureId);
  }
}

export type MatchdaySummary = {
  date: Date;
  fixtures: number; // fixtures played or started that day
  goals: number; // in the matches played in full
  // The managed club's match that day, with how many of its starters were picked automatically in place of the
  // saved ones, and whether it waits at half-time; null when it did not play.
  managed: { fixtureId: string; autoFilledSlots: number; halfTime: boolean } | null;
};

export type PlayNextMatchdayOptions = {
  // Stop the managed club's match at half-time, for the manager's changes (resumeLiveMatch plays the rest).
  // Without it, as in the quick simulation, every match is played in full.
  pauseManagedMatch?: boolean;
};

/** What the database knows of a player of the match: his row, and his injury before it. */
export type PlayerState = {
  playerSaveId: string;
  injuredUntil: Date | null;
};

const TEAM_SELECT = { isManaged: true, formation: true, lineup: true, club: { select: { slug: true } } } as const;

export const PLAYER_SELECT = {
  id: true,
  playerKey: true,
  position: true,
  clubSaveId: true,
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
} as const;

type PlayerRow = Prisma.PlayerSaveGetPayload<{ select: typeof PLAYER_SELECT }>;

type Team = { isManaged: boolean; formation: string; lineup: unknown };

type TeamLineup = { lineup: Lineup; formation: FormationName; autoFilledSlots: number };

/** The managed club plays its saved lineup, completed automatically; AI clubs pick their 4-3-3 automatically. */
function lineupOf(team: Team, squad: readonly SquadPlayer[]): TeamLineup {
  if (!team.isManaged) {
    return { lineup: selectLineup(squad), formation: DEFAULT_FORMATION_NAME, autoFilledSlots: 0 };
  }
  const saved = parseSavedLineup(team.lineup);
  const formation = parseFormation(team.formation);
  const lineup = resolveLineup(formation, saved, squad);
  return { lineup, formation, autoFilledSlots: autoFilledSlots(saved, lineup) };
}

/**
 * Players of the match's clubs by club, keyed by playerKey in the engine (stable across databases, unlike
 * PlayerSave.id), with their state in the database.
 */
export function squadsOf(rows: readonly PlayerRow[], matchDate: Date): {
  squads: Map<string, SquadPlayer[]>;
  stateByKey: Map<string, PlayerState>;
} {
  const squads = new Map<string, SquadPlayer[]>();
  const stateByKey = new Map<string, PlayerState>();
  for (const row of rows) {
    const { playerKey, position, clubSaveId, id: playerSaveId, injuredUntil, ...ratings } = row;
    stateByKey.set(playerKey, { playerSaveId, injuredUntil });
    if (clubSaveId === null) {
      continue; // free agents do not play; a player who left during a paused match is only needed for his events
    }
    const squad = squads.get(clubSaveId) ?? [];
    squad.push({ ...ratings, id: playerKey, position, injured: injuredUntil !== null && injuredUntil > matchDate });
    squads.set(clubSaveId, squad);
  }
  return { squads, stateByKey };
}

/** The seed of a fixture's match: save seed, season, matchday and club slugs. */
export function fixtureMatchSeed(
  saveSeed: string,
  fixture: { round: number; season: { startYear: number }; homeClubSave: { club: { slug: string } }; awayClubSave: { club: { slug: string } } },
): string {
  return matchRngSeed(saveSeed, fixture.season.startYear, fixture.round, fixture.homeClubSave.club.slug, fixture.awayClubSave.club.slug);
}

export function matchEventRows(
  fixtureId: string,
  events: readonly MatchEvent[],
  stateByKey: ReadonlyMap<string, PlayerState>,
): Prisma.MatchEventCreateManyInput[] {
  const playerSaveIdOf = (key: string): string => getOrThrow(stateByKey, key, "player").playerSaveId;
  return events.map((event) => ({
    fixtureId,
    minute: event.minute,
    type: event.type,
    side: event.side === "home" ? "HOME" : "AWAY",
    playerSaveId: playerSaveIdOf(event.playerId),
    relatedPlayerSaveId: event.relatedPlayerId === undefined ? null : playerSaveIdOf(event.relatedPlayerId),
  }));
}

/** A match played to the end, ready to be written. */
export type FinishedMatch = {
  fixtureId: string;
  seasonId: string;
  result: MatchResult;
  newEvents: readonly MatchEvent[]; // the events not written yet: all of them, or the second half's after a pause
  involvesManagedClub: boolean; // a match of the managed club keeps all its events, another one its goals only
  squads: Readonly<Record<Side, readonly SquadPlayer[]>>; // the clubs' players, whose form and injuries change
};

type SeasonStats = {
  seasonId: string;
  playerSaveId: string;
  stats: PlayerMatchStats;
};

const seasonStatsKey = (seasonId: string, playerSaveId: string): string => `${seasonId}#${playerSaveId}`;

/**
 * Writes finished matches in bulk: final and half-time scores (the live state cleared), events not written yet (all
 * of them for the managed club's match, the goals only for the others: eventsToPersist), season stats, form and
 * injuries of both clubs' players, these three from the whole match.
 */
export async function recordFinishedMatches(
  tx: Transaction,
  saveId: string,
  matchDate: Date,
  matches: readonly FinishedMatch[],
  stateByKey: ReadonlyMap<string, PlayerState>,
): Promise<void> {
  if (matches.length === 0) {
    return;
  }
  const playerSaveIdOf = (key: string): string => getOrThrow(stateByKey, key, "player").playerSaveId;
  const events: Prisma.MatchEventCreateManyInput[] = [];
  const seasonStats: SeasonStats[] = [];
  const playerUpdates: { playerSaveId: string; form: number; injuredUntil: Date | null }[] = [];

  for (const { fixtureId, seasonId, result, newEvents, involvesManagedClub, squads } of matches) {
    // Only the writing is filtered: the stats and injuries below come from the whole match in memory.
    events.push(...matchEventRows(fixtureId, eventsToPersist(newEvents, involvesManagedClub), stateByKey));

    const statsByKey = new Map(playerMatchStats(result).map((stats) => [stats.playerId, stats]));
    for (const stats of statsByKey.values()) {
      seasonStats.push({ seasonId, playerSaveId: playerSaveIdOf(stats.playerId), stats });
    }

    const injuryDays = new Map(result.injuries.map((injury) => [injury.playerId, injury.days]));
    for (const side of ["home", "away"] as const) {
      const outcome = outcomeFor(result, side);
      for (const player of squads[side]) {
        const state = getOrThrow(stateByKey, player.id, "player");
        const days = injuryDays.get(player.id);
        playerUpdates.push({
          playerSaveId: state.playerSaveId,
          form: nextForm(player.form, statsByKey.get(player.id), outcome),
          injuredUntil: days === undefined ? state.injuredUntil : new Date(matchDate.getTime() + days * DAY_MS),
        });
      }
    }
  }

  await tx.$executeRaw`
    UPDATE "Fixture" AS f
    SET "played" = true, "status" = 'PLAYED'::"FixtureStatus", "liveState" = NULL,
        "homeGoals" = v."homeGoals", "awayGoals" = v."awayGoals",
        "homeHalfTimeGoals" = v."homeHalfTimeGoals", "awayHalfTimeGoals" = v."awayHalfTimeGoals"
    FROM (VALUES ${Prisma.join(
      matches.map(
        ({ fixtureId, result }) =>
          Prisma.sql`(${fixtureId}::text, ${result.homeGoals}::int, ${result.awayGoals}::int,
            ${result.homeHalfTimeGoals}::int, ${result.awayHalfTimeGoals}::int)`,
      ),
    )}) AS v("id", "homeGoals", "awayGoals", "homeHalfTimeGoals", "awayHalfTimeGoals")
    WHERE f."id" = v."id" AND f."saveId" = ${saveId}`;

  if (events.length > 0) {
    await tx.matchEvent.createMany({ data: events });
  }

  // Season stats: create the rows of first appearances, add this match to the existing ones.
  const existingStats = await tx.playerSeasonStats.findMany({
    where: {
      saveId,
      seasonId: { in: [...new Set(seasonStats.map((row) => row.seasonId))] },
      playerSaveId: { in: seasonStats.map((row) => row.playerSaveId) },
    },
    select: { id: true, seasonId: true, playerSaveId: true },
  });
  const statsIdByKey = new Map(existingStats.map((row) => [seasonStatsKey(row.seasonId, row.playerSaveId), row.id]));
  const firstAppearances = seasonStats.filter((row) => !statsIdByKey.has(seasonStatsKey(row.seasonId, row.playerSaveId)));
  const furtherAppearances = seasonStats.filter((row) => statsIdByKey.has(seasonStatsKey(row.seasonId, row.playerSaveId)));

  if (firstAppearances.length > 0) {
    await tx.playerSeasonStats.createMany({
      data: firstAppearances.map(({ seasonId, playerSaveId, stats }) => ({
        saveId,
        seasonId,
        playerSaveId,
        appearances: 1,
        minutes: stats.minutes,
        goals: stats.goals,
        assists: stats.assists,
        yellowCards: stats.yellowCards,
        redCards: stats.redCards,
      })),
    });
  }
  if (furtherAppearances.length > 0) {
    await tx.$executeRaw`
      UPDATE "PlayerSeasonStats" AS s
      SET "appearances" = s."appearances" + 1,
          "minutes" = s."minutes" + v."minutes",
          "goals" = s."goals" + v."goals",
          "assists" = s."assists" + v."assists",
          "yellowCards" = s."yellowCards" + v."yellowCards",
          "redCards" = s."redCards" + v."redCards"
      FROM (VALUES ${Prisma.join(
        furtherAppearances.map(
          ({ seasonId, playerSaveId, stats }) =>
            Prisma.sql`(${getOrThrow(statsIdByKey, seasonStatsKey(seasonId, playerSaveId), "season stats")}::text,
              ${stats.minutes}::int, ${stats.goals}::int, ${stats.assists}::int,
              ${stats.yellowCards}::int, ${stats.redCards}::int)`,
        ),
      )}) AS v("id", "minutes", "goals", "assists", "yellowCards", "redCards")
      WHERE s."id" = v."id" AND s."saveId" = ${saveId}`;
  }

  // Dates go through ISO strings: a Date parameter would be sent in the server's local time zone.
  if (playerUpdates.length > 0) {
    await tx.$executeRaw`
      UPDATE "PlayerSave" AS p
      SET "form" = v."form", "injuredUntil" = v."injuredUntil"
      FROM (VALUES ${Prisma.join(
        playerUpdates.map(
          (update) =>
            Prisma.sql`(${update.playerSaveId}::text, ${update.form}::int, ${update.injuredUntil?.toISOString() ?? null}::timestamp(3))`,
        ),
      )}) AS v("id", "form", "injuredUntil")
      WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
  }
}

/**
 * Plays every fixture of the next date with unplayed fixtures, in all competitions, in one transaction:
 * scores, match events, season stats, form and injuries, then moves the save's current date to that day.
 * With pauseManagedMatch, the managed club's match stops at half-time instead: its first half's events, its
 * half-time score and the engine state are written, and the save waits for resumeLiveMatch (Save.liveFixtureId).
 * Refused with MatchInProgressError while a match waits at half-time. Returns null when every fixture of the
 * save has been played.
 */
export async function playNextMatchday(saveId: string, options: PlayNextMatchdayOptions = {}): Promise<MatchdaySummary | null> {
  return prisma.$transaction(
    async (tx) => {
      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true, liveFixtureId: true } });
      if (save.liveFixtureId !== null) {
        throw new MatchInProgressError(save.liveFixtureId);
      }
      const next = await tx.fixture.findFirst({
        where: { saveId, played: false },
        orderBy: { scheduledAt: "asc" },
        select: { scheduledAt: true },
      });
      if (next === null) {
        return null;
      }
      const matchDate = next.scheduledAt;

      const fixtures = await tx.fixture.findMany({
        where: { saveId, played: false, scheduledAt: matchDate },
        select: {
          id: true,
          round: true,
          seasonId: true,
          homeClubSaveId: true,
          awayClubSaveId: true,
          season: { select: { startYear: true } },
          homeClubSave: { select: TEAM_SELECT },
          awayClubSave: { select: TEAM_SELECT },
        },
      });

      const playerSaves = await tx.playerSave.findMany({
        where: { saveId, clubSaveId: { in: fixtures.flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]) } },
        select: PLAYER_SELECT,
      });
      const { squads, stateByKey } = squadsOf(playerSaves, matchDate);

      const finished: FinishedMatch[] = [];
      let managed: MatchdaySummary["managed"] = null;

      for (const fixture of fixtures) {
        const squadsBySide = {
          home: getOrThrow(squads, fixture.homeClubSaveId, "home squad"),
          away: getOrThrow(squads, fixture.awayClubSaveId, "away squad"),
        };
        const matchSeed = fixtureMatchSeed(save.seed, fixture);
        const home = lineupOf(fixture.homeClubSave, squadsBySide.home);
        const away = lineupOf(fixture.awayClubSave, squadsBySide.away);
        const formations = { home: home.formation, away: away.formation };
        const managedSide: Side | null = fixture.homeClubSave.isManaged ? "home" : fixture.awayClubSave.isManaged ? "away" : null;

        if (managedSide !== null && options.pauseManagedMatch === true) {
          const halfTime = simulateHalf(startMatch(home.lineup, away.lineup, formations), makeRng(halfRngSeed(matchSeed, "h1")), "h1");
          const homeHalfTimeGoals = halfTime.home.goals;
          const awayHalfTimeGoals = halfTime.away.goals;
          const updated = await tx.fixture.updateMany({
            where: { id: fixture.id, saveId, played: false },
            data: {
              status: "HALF_TIME",
              homeHalfTimeGoals,
              awayHalfTimeGoals,
              liveState: serializeLiveState({ managedSide, state: halfTime }),
            },
          });
          if (updated.count !== 1) {
            throw new Error(`Fixture ${fixture.id} could not be paused`);
          }
          const events = matchEventRows(fixture.id, halfTime.events, stateByKey);
          if (events.length > 0) {
            await tx.matchEvent.createMany({ data: events });
          }
          await tx.save.update({ where: { id: saveId }, data: { liveFixtureId: fixture.id } });
          managed = { fixtureId: fixture.id, autoFilledSlots: (managedSide === "home" ? home : away).autoFilledSlots, halfTime: true };
          continue;
        }

        const result = simulateMatch(home.lineup, away.lineup, matchSeed, formations);
        if (managedSide !== null) {
          managed = { fixtureId: fixture.id, autoFilledSlots: (managedSide === "home" ? home : away).autoFilledSlots, halfTime: false };
        }
        finished.push({
          fixtureId: fixture.id,
          seasonId: fixture.seasonId,
          result,
          newEvents: result.events,
          involvesManagedClub: managedSide !== null,
          squads: squadsBySide,
        });
      }

      await recordFinishedMatches(tx, saveId, matchDate, finished, stateByKey);
      await tx.save.update({ where: { id: saveId }, data: { currentDate: matchDate } });

      return {
        date: matchDate,
        fixtures: fixtures.length,
        goals: finished.reduce((sum, { result }) => sum + result.homeGoals + result.awayGoals, 0),
        managed,
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
