import { FITNESS_RECOVERY_PER_DAY, FULL_FITNESS } from "../engine/balance";
import { assistantChoices, withChoices, type MatchDecision } from "../engine/choices";
import { disciplineAfterMatch, isSuspended, type CompetitionKind, type Discipline } from "../engine/discipline";
import { fitnessAfterMatch, recoveredFitness } from "../engine/fitness";
import { chooseFormation } from "../engine/formation-choice";
import type { FormationName } from "../engine/formations";
import { autoFilledSlots, resolveLineup, type Lineup, type SquadPlayer } from "../engine/lineup";
import {
  cupMatchRngSeed,
  eventsToPersist,
  goalTimesOf,
  knockoutWinner,
  matchRngSeed,
  nextForm,
  outcomeFor,
  playerMatchStats,
  simulateMatch,
  startMatch,
  type Appearance,
  type MatchEvent,
  type MatchResult,
  type MatchState,
  type PlayerMatchStats,
  type Side,
} from "../engine/match";
import { playOn } from "../engine/live";
import { competitionTier } from "../engine/tiers";
import { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import { recordFirstMatch, recordFirstSeasonEnd } from "./activation";
import { recordChallengeScore } from "./challenge";
import { countManagedMatch } from "./daily-stats";
import { ensureObjectiveChosen, refreshBoardConfidence } from "./objectives";
import { prisma } from "./client";
import { progressCups } from "./cup";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";
import { serializeLiveState } from "./live-state";
import { parseFormation, parseSavedLineup } from "./lineup";

// A matchday writes a few thousand rows, in a handful of bulk statements.
// Re-exported for live-match.ts, which shares the matchday transaction settings.
export { TRANSACTION_MAX_WAIT_MS };
export const TRANSACTION_TIMEOUT_MS = 60_000;

const DAY_MS = 86_400_000;

type Transaction = Prisma.TransactionClient;

/** Refusal of anything that moves the save forward while the managed club's match waits to be played on. */
export class MatchInProgressError extends Error {
  constructor(readonly fixtureId: string) {
    super(`The managed club's match ${fixtureId} is paused`);
    this.name = "MatchInProgressError";
  }
}

/**
 * Locks the save's row until the transaction ends: whatever moves a save forward (a matchday, a step of its live match)
 * waits for the move before it, then reads what that one wrote. Two clicks, two tabs, never play the same thing twice.
 */
export async function lockSave(tx: Transaction, saveId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Save" WHERE "id" = ${saveId} FOR UPDATE`;
}

/** The status of a fixture whose match waits at a pause: between two segments, at half-time, at the end of regulation time. */
export function liveFixtureStatus(state: MatchState): "IN_PLAY" | "HALF_TIME" | "REGULATION_END" {
  return state.phase === "HALF_TIME" || state.phase === "REGULATION_END" ? state.phase : "IN_PLAY";
}

/** Throws MatchInProgressError while the save has a match waiting to be played on. */
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
  // saved ones, and whether it waits to be played on live; null when it did not play.
  managed: { fixtureId: string; autoFilledSlots: number; live: boolean } | null;
};

export type PlayNextMatchdayOptions = {
  // Play the managed club's match live: its first segment only, the rest step by step (advanceLiveMatch). Without it,
  // as in the quick simulation, every match is played in full, the managed club's choice events by its assistant.
  pauseManagedMatch?: boolean;
};

/**
 * What the database knows of a player of the match: his row, and what a match changes of it as the row holds it before
 * the match (form, fitness, injury, discipline): a row the match leaves as it was is not written again.
 */
export type PlayerState = {
  playerSaveId: string;
  form: number;
  fitness: number; // the row's: before the days of rest a club whose match ends now recovers in memory
  injuredUntil: Date | null;
  discipline: Discipline;
};

const TEAM_SELECT = {
  isManaged: true,
  formation: true,
  lineup: true,
  club: { select: { slug: true } },
  // Its division, whose average opponent an AI club weighs its formations against.
  competition: { select: { tier: true } },
} as const;

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
  fitness: true,
  injuredUntil: true,
  leagueYellows: true,
  cupYellows: true,
  suspendedMatches: true,
  suspendedLeagueMatches: true,
  suspendedCupMatches: true,
} as const;

type PlayerRow = Prisma.PlayerSaveGetPayload<{ select: typeof PLAYER_SELECT }>;

type Team = { isManaged: boolean; formation: string; lineup: unknown; competition: { tier: number } };

type TeamLineup = { lineup: Lineup; formation: FormationName; autoFilledSlots: number };

/**
 * The managed club plays its saved lineup, completed automatically; an AI club chooses its formation for its squad as it
 * stands before the match (chooseFormation: the most points expected against the average opponent of its division) and
 * plays its automatic eleven in it, resting its tired players where a rested one is hardly worse (selectRestedLineup).
 */
function lineupOf(team: Team, squad: readonly SquadPlayer[]): TeamLineup {
  if (!team.isManaged) {
    const { formation, lineup } = chooseFormation(squad, competitionTier(team.competition.tier));
    return { lineup, formation, autoFilledSlots: 0 };
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
    const {
      playerKey,
      position,
      clubSaveId,
      id: playerSaveId,
      injuredUntil,
      leagueYellows,
      cupYellows,
      suspendedMatches,
      suspendedLeagueMatches,
      suspendedCupMatches,
      ...ratings
    } = row;
    stateByKey.set(playerKey, {
      playerSaveId,
      form: ratings.form,
      fitness: ratings.fitness,
      injuredUntil,
      discipline: { leagueYellows, cupYellows, suspendedMatches, suspendedLeagueMatches, suspendedCupMatches },
    });
    if (clubSaveId === null) {
      continue; // free agents do not play; a player who left during a paused match is only needed for his events
    }
    const squad = squads.get(clubSaveId) ?? [];
    squad.push({ ...ratings, id: playerKey, position, injured: injuredUntil !== null && injuredUntil > matchDate });
    squads.set(clubSaveId, squad);
  }
  return { squads, stateByKey };
}

/** A club's players for a match of a competition, the ones suspended for it out, as the injured are (isAvailable). */
export function withSuspensions(
  squad: readonly SquadPlayer[],
  competition: CompetitionKind,
  stateByKey: ReadonlyMap<string, PlayerState>,
): SquadPlayer[] {
  return squad.map((player) =>
    isSuspended(getOrThrow(stateByKey, player.id, "player").discipline, competition) ? { ...player, suspended: true } : player,
  );
}

/** What a fixture's match needs to know of its season: its year, and whether it is a cup tie, a knockout match. */
export const FIXTURE_SEASON_SELECT = { select: { startYear: true, competition: { select: { kind: true } } } } as const;

type FixtureSeason = { startYear: number; competition: { kind: "LEAGUE" | "CUP" } };

/** A cup tie is a knockout match: level after 90 minutes, it goes to extra time and a shoot-out. */
export const isKnockout = (season: FixtureSeason): boolean => season.competition.kind === "CUP";

/**
 * The seed of a fixture's match: save seed, season, matchday (or cup round) and club slugs. A cup tie has a seed of its
 * own (cupMatchRngSeed), so that it never replays the league match of the same round between the same clubs.
 */
export function fixtureMatchSeed(
  saveSeed: string,
  fixture: { round: number; season: FixtureSeason; homeClubSave: { club: { slug: string } }; awayClubSave: { club: { slug: string } } },
): string {
  const seed = isKnockout(fixture.season) ? cupMatchRngSeed : matchRngSeed;
  return seed(saveSeed, fixture.season.startYear, fixture.round, fixture.homeClubSave.club.slug, fixture.awayClubSave.club.slug);
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
    period: event.period ?? "REGULAR",
    type: event.type,
    side: event.side === "home" ? "HOME" : "AWAY",
    playerSaveId: playerSaveIdOf(event.playerId),
    relatedPlayerSaveId: event.relatedPlayerId === undefined ? null : playerSaveIdOf(event.relatedPlayerId),
  }));
}

/** The managed club's decisions on its choice events, as rows; (fixtureId, sequence) is unique: never written twice. */
export function matchDecisionRows(
  fixtureId: string,
  decisions: readonly MatchDecision[],
  stateByKey: ReadonlyMap<string, PlayerState>,
): Prisma.MatchDecisionCreateManyInput[] {
  return decisions.map((decision) => ({
    fixtureId,
    sequence: decision.sequence,
    minute: decision.minute,
    kind: decision.kind,
    option: decision.option,
    assistant: decision.assistant,
    playerSaveId: decision.playerId === undefined ? null : getOrThrow(stateByKey, decision.playerId, "player").playerSaveId,
  }));
}

const DISCIPLINE_KEYS = ["leagueYellows", "cupYellows", "suspendedMatches", "suspendedLeagueMatches", "suspendedCupMatches"] as const;

/** Whether a match changes a player's row: his form, fitness, injury or discipline after it, against the row's. */
export function rowChanges(
  update: { form: number; fitness: number; injuredUntil: Date | null } & Discipline,
  state: PlayerState,
): boolean {
  return (
    update.form !== state.form ||
    update.fitness !== state.fitness ||
    (update.injuredUntil?.getTime() ?? null) !== (state.injuredUntil?.getTime() ?? null) ||
    DISCIPLINE_KEYS.some((key) => update[key] !== state.discipline[key])
  );
}

/** A match played to the end, ready to be written. */
export type FinishedMatch = {
  fixtureId: string;
  seasonId: string;
  result: MatchResult;
  newEvents: readonly MatchEvent[]; // the events not written yet: all of them, or those since the last pause
  newDecisions: readonly MatchDecision[]; // the managed club's decisions not written yet
  managedSide: Side | null; // a match of the managed club keeps all its events, another one its goals only
  knockout: boolean; // a cup tie: its winner is written, and only the managed club's players get season stats
  squads: Readonly<Record<Side, readonly SquadPlayer[]>>; // the clubs' players, whose form and injuries change
};

type SeasonStats = {
  seasonId: string;
  playerSaveId: string;
  stats: PlayerMatchStats;
};

const seasonStatsKey = (seasonId: string, playerSaveId: string): string => `${seasonId}#${playerSaveId}`;

/**
 * Writes finished matches in bulk: final and half-time scores (the live state cleared), a cup tie's winner and how it
 * was decided, events not written yet (all of them for the managed club's match, none for the others, whose goals go in
 * their fixture: eventsToPersist, goalTimesOf), season stats (in a cup tie, the managed club's players only), form and injuries of both clubs'
 * players, these three from the whole match.
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
  const playerUpdates: ({ playerSaveId: string; form: number; fitness: number; injuredUntil: Date | null } & Discipline)[] = [];

  const decisions: Prisma.MatchDecisionCreateManyInput[] = [];

  for (const { fixtureId, seasonId, result, newEvents, newDecisions, managedSide, knockout, squads } of matches) {
    // Only the writing is filtered: the stats and injuries below come from the whole match in memory.
    events.push(...matchEventRows(fixtureId, eventsToPersist(newEvents, managedSide !== null), stateByKey));
    decisions.push(...matchDecisionRows(fixtureId, newDecisions, stateByKey));

    const statsByKey = new Map(playerMatchStats(result).map((stats) => [stats.playerId, stats]));
    for (const stats of statsByKey.values()) {
      if (!knockout || stats.side === managedSide) {
        seasonStats.push({ seasonId, playerSaveId: playerSaveIdOf(stats.playerId), stats });
      }
    }

    const injuryDays = new Map(result.injuries.map((injury) => [injury.playerId, injury.days]));
    const spellsByKey = new Map<string, Appearance[]>();
    for (const appearance of result.appearances) {
      spellsByKey.set(appearance.playerId, [...(spellsByKey.get(appearance.playerId) ?? []), appearance]);
    }
    const competition: CompetitionKind = knockout ? "CUP" : "LEAGUE";
    for (const side of ["home", "away"] as const) {
      const outcome = outcomeFor(result, side);
      for (const player of squads[side]) {
        const state = getOrThrow(stateByKey, player.id, "player");
        const days = injuryDays.get(player.id);
        const update = {
          playerSaveId: state.playerSaveId,
          form: nextForm(player.form, statsByKey.get(player.id), outcome),
          // The fitness his minutes have left him; a player who did not play keeps his, to recover from day to day.
          fitness: Math.round(fitnessAfterMatch(player.fitness, spellsByKey.get(player.id) ?? [])),
          injuredUntil: days === undefined ? state.injuredUntil : new Date(matchDate.getTime() + days * DAY_MS),
          // Every player of the club: a suspended one has served this match, the booked and the sent-off count theirs.
          ...disciplineAfterMatch(state.discipline, competition, statsByKey.get(player.id)),
        };
        // Most of a bench leaves the match as it came, its form settled: its rows are not written again.
        if (rowChanges(update, state)) {
          playerUpdates.push(update);
        }
      }
    }
  }

  // A cup tie's winner is a side of the fixture: the CASE turns it into the club's row.
  await tx.$executeRaw`
    UPDATE "Fixture" AS f
    SET "played" = true, "status" = 'PLAYED'::"FixtureStatus", "liveState" = NULL, "goalTimes" = v."goalTimes",
        "homeGoals" = v."homeGoals", "awayGoals" = v."awayGoals",
        "homeHalfTimeGoals" = v."homeHalfTimeGoals", "awayHalfTimeGoals" = v."awayHalfTimeGoals",
        "decidedBy" = v."decidedBy"::"DecidedBy", "homePenalties" = v."homePenalties", "awayPenalties" = v."awayPenalties",
        "winnerClubSaveId" = CASE v."winner" WHEN 'home' THEN f."homeClubSaveId" WHEN 'away' THEN f."awayClubSaveId" END
    FROM (VALUES ${Prisma.join(
      matches.map(
        ({ fixtureId, result, knockout, managedSide }) =>
          // A match without the managed club keeps its goals here, none of its events: an int[] literal of integers.
          Prisma.sql`(${fixtureId}::text, ${`{${managedSide === null ? goalTimesOf(result.events).join(",") : ""}}`}::int[],
            ${result.homeGoals}::int, ${result.awayGoals}::int,
            ${result.homeHalfTimeGoals}::int, ${result.awayHalfTimeGoals}::int, ${result.decidedBy ?? null}::text,
            ${result.homePenalties ?? null}::int, ${result.awayPenalties ?? null}::int,
            ${knockout ? knockoutWinner(result) : null}::text)`,
      ),
    )}) AS v("id", "goalTimes", "homeGoals", "awayGoals", "homeHalfTimeGoals", "awayHalfTimeGoals", "decidedBy",
             "homePenalties", "awayPenalties", "winner")
    WHERE f."id" = v."id" AND f."saveId" = ${saveId}`;

  if (events.length > 0) {
    await tx.matchEvent.createMany({ data: events });
  }
  if (decisions.length > 0) {
    await tx.matchDecision.createMany({ data: decisions });
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
        starts: stats.started ? 1 : 0,
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
          "starts" = s."starts" + v."starts",
          "minutes" = s."minutes" + v."minutes",
          "goals" = s."goals" + v."goals",
          "assists" = s."assists" + v."assists",
          "yellowCards" = s."yellowCards" + v."yellowCards",
          "redCards" = s."redCards" + v."redCards"
      FROM (VALUES ${Prisma.join(
        furtherAppearances.map(
          ({ seasonId, playerSaveId, stats }) =>
            Prisma.sql`(${getOrThrow(statsIdByKey, seasonStatsKey(seasonId, playerSaveId), "season stats")}::text,
              ${stats.started ? 1 : 0}::int, ${stats.minutes}::int, ${stats.goals}::int, ${stats.assists}::int,
              ${stats.yellowCards}::int, ${stats.redCards}::int)`,
        ),
      )}) AS v("id", "starts", "minutes", "goals", "assists", "yellowCards", "redCards")
      WHERE s."id" = v."id" AND s."saveId" = ${saveId}`;
  }

  // Dates go through ISO strings: a Date parameter would be sent in the server's local time zone.
  if (playerUpdates.length > 0) {
    await tx.$executeRaw`
      UPDATE "PlayerSave" AS p
      SET "form" = v."form", "fitness" = v."fitness", "injuredUntil" = v."injuredUntil",
        "leagueYellows" = v."leagueYellows", "cupYellows" = v."cupYellows", "suspendedMatches" = v."suspendedMatches",
        "suspendedLeagueMatches" = v."suspendedLeagueMatches", "suspendedCupMatches" = v."suspendedCupMatches"
      FROM (VALUES ${Prisma.join(
        playerUpdates.map(
          (update) =>
            Prisma.sql`(${update.playerSaveId}::text, ${update.form}::int, ${update.fitness}::int,
              ${update.injuredUntil?.toISOString() ?? null}::timestamp(3), ${update.leagueYellows}::int,
              ${update.cupYellows}::int, ${update.suspendedMatches}::int, ${update.suspendedLeagueMatches}::int,
              ${update.suspendedCupMatches}::int)`,
        ),
      )}) AS v("id", "form", "fitness", "injuredUntil", "leagueYellows", "cupYellows", "suspendedMatches",
        "suspendedLeagueMatches", "suspendedCupMatches")
      WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
  }
}

/**
 * Plays every fixture of the next date with unplayed fixtures, in all competitions, in one transaction: first the
 * fitness every player of the save recovers over the days since the current date (recoveredFitness), then scores, match
 * events, season stats, form, fitness and injuries, the cups' prizes and next rounds (progressCups), then moves the
 * save's current date to that day.
 * The managed club's match has its choice events, decided by its assistant. With pauseManagedMatch, it is played live
 * instead: its first segment only, whose events and the engine state are written, and the save waits for
 * advanceLiveMatch (Save.liveFixtureId). Refused with MatchInProgressError while a match waits. Returns null when every
 * fixture of the save has been played.
 */
export async function playNextMatchday(saveId: string, options: PlayNextMatchdayOptions = {}): Promise<MatchdaySummary | null> {
  const summary = await prisma.$transaction(
    async (tx) => {
      await lockSave(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({
        where: { id: saveId },
        select: { seed: true, liveFixtureId: true, challengeId: true, currentDate: true },
      });
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
          season: FIXTURE_SEASON_SELECT,
          homeClubSave: { select: TEAM_SELECT },
          awayClubSave: { select: TEAM_SELECT },
        },
      });

      // Every player recovers day by day until that date, as recoveredFitness says, up to full fitness. The players of
      // the clubs whose matches end in this transaction recover in memory, their match's write keeping it: one write of
      // their rows instead of two. Those of a match paused live recover here, their rows read at each of its steps.
      const restDays = Math.round((matchDate.getTime() - save.currentDate.getTime()) / DAY_MS);
      const paused =
        options.pauseManagedMatch === true
          ? fixtures.find((fixture) => fixture.homeClubSave.isManaged || fixture.awayClubSave.isManaged)
          : undefined;
      const finishing = new Set(
        fixtures.filter((fixture) => fixture !== paused).flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]),
      );
      if (restDays > 0) {
        const others =
          finishing.size === 0 ? Prisma.empty : Prisma.sql`AND ("clubSaveId" IS NULL OR "clubSaveId" NOT IN (${Prisma.join([...finishing])}))`;
        await tx.$executeRaw`
          UPDATE "PlayerSave"
          SET "fitness" = LEAST(${FULL_FITNESS}, "fitness" + ${FITNESS_RECOVERY_PER_DAY * restDays})
          WHERE "saveId" = ${saveId} AND "fitness" < ${FULL_FITNESS} ${others}`;
      }

      const playerSaves = await tx.playerSave.findMany({
        where: { saveId, clubSaveId: { in: fixtures.flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]) } },
        select: PLAYER_SELECT,
      });
      const { squads, stateByKey } = squadsOf(playerSaves, matchDate);
      if (restDays > 0) {
        for (const clubSaveId of finishing) {
          const squad = squads.get(clubSaveId);
          if (squad !== undefined) {
            squads.set(clubSaveId, squad.map((player) => ({ ...player, fitness: recoveredFitness(player.fitness, restDays) })));
          }
        }
      }

      const finished: FinishedMatch[] = [];
      let managed: MatchdaySummary["managed"] = null;
      // The managed club plays: its season's optional objective is chosen by now, by its assistant when not by the player.
      if (fixtures.some((fixture) => fixture.homeClubSave.isManaged || fixture.awayClubSave.isManaged)) {
        await ensureObjectiveChosen(tx, saveId);
      }

      for (const fixture of fixtures) {
        // The players suspended for this match's competition sit it out.
        const competition: CompetitionKind = fixture.season.competition.kind;
        const squadsBySide = {
          home: withSuspensions(getOrThrow(squads, fixture.homeClubSaveId, "home squad"), competition, stateByKey),
          away: withSuspensions(getOrThrow(squads, fixture.awayClubSaveId, "away squad"), competition, stateByKey),
        };
        const matchSeed = fixtureMatchSeed(save.seed, fixture);
        const home = lineupOf(fixture.homeClubSave, squadsBySide.home);
        const away = lineupOf(fixture.awayClubSave, squadsBySide.away);
        const formations = { home: home.formation, away: away.formation };
        const managedSide: Side | null = fixture.homeClubSave.isManaged ? "home" : fixture.awayClubSave.isManaged ? "away" : null;
        const knockout = isKnockout(fixture.season);

        if (managedSide !== null && options.pauseManagedMatch === true) {
          // Nobody can act before the first boundary: its segment is played now, the rest step by step.
          const kickOff = withChoices(startMatch(home.lineup, away.lineup, formations, knockout), managedSide, matchSeed);
          const live = playOn(kickOff, managedSide, matchSeed, {}, "segment");
          const updated = await tx.fixture.updateMany({
            where: { id: fixture.id, saveId, status: "SCHEDULED" },
            data: { status: liveFixtureStatus(live), liveState: serializeLiveState({ managedSide, state: live }) },
          });
          if (updated.count !== 1) {
            throw new Error(`Fixture ${fixture.id} could not be started live`);
          }
          const events = matchEventRows(fixture.id, live.events, stateByKey);
          if (events.length > 0) {
            await tx.matchEvent.createMany({ data: events });
          }
          await tx.save.update({ where: { id: saveId }, data: { liveFixtureId: fixture.id } });
          managed = { fixtureId: fixture.id, autoFilledSlots: (managedSide === "home" ? home : away).autoFilledSlots, live: true };
          continue;
        }

        // The managed club's choice events, decided by its assistant: the very match it would play live with them.
        const result = simulateMatch(
          home.lineup,
          away.lineup,
          matchSeed,
          formations,
          knockout,
          {},
          managedSide === null ? undefined : assistantChoices(managedSide, matchSeed),
        );
        if (managedSide !== null) {
          managed = { fixtureId: fixture.id, autoFilledSlots: (managedSide === "home" ? home : away).autoFilledSlots, live: false };
        }
        finished.push({
          fixtureId: fixture.id,
          seasonId: fixture.seasonId,
          result,
          newEvents: result.events,
          newDecisions: result.decisions ?? [],
          managedSide,
          knockout,
          squads: squadsBySide,
        });
      }

      await recordFinishedMatches(tx, saveId, matchDate, finished, stateByKey);
      await progressCups(
        tx,
        saveId,
        save.seed,
        finished.filter((match) => match.knockout).map((match) => match.fixtureId),
      );
      // A challenge save's entry and the president's confidence, once its club's match is over: not while it waits live.
      if (managed !== null && !managed.live) {
        await recordChallengeScore(tx, saveId, save.challengeId);
        await refreshBoardConfidence(tx, saveId);
        await recordFirstMatch(tx, saveId);
      }
      // The player's first steps (src/db/activation.ts): a season over once the last date of all is played.
      await recordFirstSeasonEnd(tx, saveId);
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
  // The day's count of the matches players play (src/db/daily-stats.ts), once the matchday is written: a live one counts
  // at its end (advanceLiveMatch).
  if (summary?.managed?.live === false) {
    await countManagedMatch(prisma, "simulated");
  }
  return summary;
}
