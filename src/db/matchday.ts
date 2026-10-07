import { autoFilledSlots, resolveLineup, selectLineup, type Lineup, type SquadPlayer } from "../engine/lineup";
import {
  matchRngSeed,
  nextForm,
  outcomeFor,
  playerMatchStats,
  simulateMatch,
  type PlayerMatchStats,
} from "../engine/match";
import { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { parseFormation, parseSavedLineup } from "./lineup";

// A matchday writes a few thousand rows, in a handful of bulk statements.
const TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 60_000;

const DAY_MS = 86_400_000;

export type MatchdaySummary = {
  date: Date;
  fixtures: number;
  goals: number;
  // The managed club's match that day, with how many of its starters were picked automatically in place of the
  // saved ones; null when it did not play.
  managed: { fixtureId: string; autoFilledSlots: number } | null;
};

type PlayerState = {
  playerSaveId: string;
  injuredUntil: Date | null;
};

type SeasonStats = {
  seasonId: string;
  playerSaveId: string;
  stats: PlayerMatchStats;
};

const TEAM_SELECT = { isManaged: true, formation: true, lineup: true, club: { select: { slug: true } } } as const;

type Team = { isManaged: boolean; formation: string; lineup: unknown };

type TeamLineup = { lineup: Lineup; autoFilledSlots: number };

/** The managed club plays its saved lineup, completed automatically; AI clubs pick their 4-3-3 automatically. */
function lineupOf(team: Team, squad: readonly SquadPlayer[]): TeamLineup {
  if (!team.isManaged) {
    return { lineup: selectLineup(squad), autoFilledSlots: 0 };
  }
  const saved = parseSavedLineup(team.lineup);
  const lineup = resolveLineup(parseFormation(team.formation), saved, squad);
  return { lineup, autoFilledSlots: autoFilledSlots(saved, lineup) };
}

const seasonStatsKey = (seasonId: string, playerSaveId: string): string => `${seasonId}#${playerSaveId}`;

/**
 * Plays every fixture of the next date with unplayed fixtures, in all competitions, in one transaction:
 * scores, match events, season stats, form and injuries, then moves the save's current date to that day.
 * Returns null when every fixture of the save has been played.
 */
export async function playNextMatchday(saveId: string): Promise<MatchdaySummary | null> {
  return prisma.$transaction(
    async (tx) => {
      const next = await tx.fixture.findFirst({
        where: { saveId, played: false },
        orderBy: { scheduledAt: "asc" },
        select: { scheduledAt: true },
      });
      if (next === null) {
        return null;
      }
      const matchDate = next.scheduledAt;

      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true } });
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
        select: {
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
        },
      });

      // Players are keyed by playerKey in the engine: stable across databases, unlike PlayerSave.id.
      const squads = new Map<string, SquadPlayer[]>();
      const stateByKey = new Map<string, PlayerState>();
      for (const row of playerSaves) {
        if (row.clubSaveId === null) {
          continue; // free agents do not play; the query already leaves them out
        }
        const { playerKey, position, clubSaveId, id: playerSaveId, injuredUntil, ...ratings } = row;
        stateByKey.set(playerKey, { playerSaveId, injuredUntil });
        const squad = squads.get(clubSaveId) ?? [];
        squad.push({
          ...ratings,
          id: playerKey,
          position,
          injured: injuredUntil !== null && injuredUntil > matchDate,
        });
        squads.set(clubSaveId, squad);
      }
      const playerSaveIdOf = (key: string): string => getOrThrow(stateByKey, key, "player").playerSaveId;

      const scores: { fixtureId: string; homeGoals: number; awayGoals: number }[] = [];
      const events: Prisma.MatchEventCreateManyInput[] = [];
      const seasonStats: SeasonStats[] = [];
      const playerUpdates: { playerSaveId: string; form: number; injuredUntil: Date | null }[] = [];
      let managed: MatchdaySummary["managed"] = null;

      for (const fixture of fixtures) {
        const squadsBySide = {
          home: getOrThrow(squads, fixture.homeClubSaveId, "home squad"),
          away: getOrThrow(squads, fixture.awayClubSaveId, "away squad"),
        };
        const rng = makeRng(
          matchRngSeed(
            save.seed,
            fixture.season.startYear,
            fixture.round,
            fixture.homeClubSave.club.slug,
            fixture.awayClubSave.club.slug,
          ),
        );
        const home = lineupOf(fixture.homeClubSave, squadsBySide.home);
        const away = lineupOf(fixture.awayClubSave, squadsBySide.away);
        const result = simulateMatch(home.lineup, away.lineup, rng);
        if (fixture.homeClubSave.isManaged || fixture.awayClubSave.isManaged) {
          const side = fixture.homeClubSave.isManaged ? home : away;
          managed = { fixtureId: fixture.id, autoFilledSlots: side.autoFilledSlots };
        }

        scores.push({ fixtureId: fixture.id, homeGoals: result.homeGoals, awayGoals: result.awayGoals });
        for (const event of result.events) {
          events.push({
            fixtureId: fixture.id,
            minute: event.minute,
            type: event.type,
            side: event.side === "home" ? "HOME" : "AWAY",
            playerSaveId: playerSaveIdOf(event.playerId),
            relatedPlayerSaveId: event.relatedPlayerId === undefined ? null : playerSaveIdOf(event.relatedPlayerId),
          });
        }

        const statsByKey = new Map(playerMatchStats(result).map((stats) => [stats.playerId, stats]));
        for (const stats of statsByKey.values()) {
          seasonStats.push({ seasonId: fixture.seasonId, playerSaveId: playerSaveIdOf(stats.playerId), stats });
        }

        const injuryDays = new Map(result.injuries.map((injury) => [injury.playerId, injury.days]));
        for (const side of ["home", "away"] as const) {
          const outcome = outcomeFor(result, side);
          for (const player of squadsBySide[side]) {
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
        SET "played" = true, "homeGoals" = v."homeGoals", "awayGoals" = v."awayGoals"
        FROM (VALUES ${Prisma.join(
          scores.map((score) => Prisma.sql`(${score.fixtureId}::text, ${score.homeGoals}::int, ${score.awayGoals}::int)`),
        )}) AS v("id", "homeGoals", "awayGoals")
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

      await tx.save.update({ where: { id: saveId }, data: { currentDate: matchDate } });

      return {
        date: matchDate,
        fixtures: fixtures.length,
        goals: scores.reduce((sum, score) => sum + score.homeGoals + score.awayGoals, 0),
        managed,
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
