import { CONDITION_NEUTRAL, FULL_FITNESS } from "../engine/balance";
import { marketValueFor } from "../engine/economy";
import type { PlayerAttributes } from "../engine/generation";
import { progressionRngSeed, progressPlayer, willRetire } from "../engine/progression";
import { seasonEndDate, seasonStartDate } from "../engine/world";
import { worldVersionOf } from "../engine/world-version";
import { Prisma } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { chunk } from "../lib/arrays";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { seasonFixtures } from "./fixtures";
import { assertNoMatchInProgress } from "./matchday";
import { runPreseasonInTransaction, type PreseasonSummary } from "./preseason";
import { applySeasonMoves, computeSeasonMoves } from "./promotion";
import { recordSeasonResult } from "./season-results";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

// The transition rewrites every player of the save, then runs the preseason, in bulk statements.
const TRANSACTION_TIMEOUT_MS = 120_000;

/** Players per bulk UPDATE: PostgreSQL takes 65 535 parameters per statement at most. */
const UPDATE_BATCH_SIZE = 1_000;

export type SeasonTransition = {
  completedStartYear: number;
  completedSeasonId: string | null; // the managed club's season just closed, whose SeasonResult was written
  startYear: number;
  moves: number; // clubs promoted or relegated (worldVersion 2 saves)
  retired: number;
  freeAgents: number; // players of the managed club whose contract ended; AI clubs decide in the preseason
  fixtures: number;
  preseason: PreseasonSummary;
};

export class SeasonNotFinishedError extends Error {
  constructor(readonly unplayedFixtures: number) {
    super(`The season is not finished: ${unplayedFixtures} fixtures left to play`);
    this.name = "SeasonNotFinishedError";
  }
}

type PlayerUpdate = PlayerAttributes & {
  playerSaveId: string;
  clubSaveId: string | null;
  contractUntil: Date | null;
  marketValue: number;
};

/**
 * Closes the season in progress and opens the next one, in one transaction. Refused while the managed club's
 * match waits at half-time (MatchInProgressError) or a fixture of the season is unplayed. Then: in a worldVersion 2
 * save, promotion and relegation are drawn from the final tables (src/db/promotion.ts); the managed club's
 * SeasonResult is written, every player progresses (retired players excepted) and gets his market value
 * from his new rating and age, some retire, expired contracts of the managed club turn its players into free
 * agents, form, morale, fitness and injuries are reset, the seasons are marked completed (with their moves), the
 * moving clubs change competition and finances, the save moves to
 * 1 July, the preseason runs (young players, AI squads), and next season's seasons and fixtures are created.
 * PlayerSave.marketValue is read as is everywhere else: this is where it changes.
 */
export async function advanceToNextSeason(saveId: string): Promise<SeasonTransition> {
  return prisma.$transaction(
    async (tx) => {
      await assertNoMatchInProgress(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true, worldVersion: true } });
      const seasons = await tx.season.findMany({
        where: { saveId, completed: false },
        select: { id: true, startYear: true, competitionId: true, competition: { select: { code: true, kind: true } } },
      });
      if (seasons.length === 0) {
        throw new Error(`Save ${saveId} has no season in progress`);
      }
      const startYears = [...new Set(seasons.map((season) => season.startYear))];
      if (startYears.length !== 1) {
        throw new Error(`Seasons in progress start in several years: ${startYears.join(", ")}`);
      }
      const [completedStartYear] = startYears;
      const seasonIds = seasons.map((season) => season.id);
      // The leagues' seasons: tables, promotion and relegation, the managed club's result, playing time. A cup's
      // fixtures only have to be played.
      const leagueSeasons = seasons.filter((season) => season.competition.kind === "LEAGUE");

      const unplayed = await tx.fixture.count({ where: { saveId, seasonId: { in: seasonIds }, played: false } });
      if (unplayed > 0) {
        throw new SeasonNotFinishedError(unplayed);
      }

      // Promotion and relegation from the final tables (worldVersion 2 saves only), then the managed club's result,
      // before any player progresses, retires or leaves.
      const worldVersion = worldVersionOf(save.worldVersion);
      const moves = await computeSeasonMoves(tx, saveId, worldVersion, leagueSeasons);
      const completedSeasonId = await recordSeasonResult(tx, saveId, leagueSeasons, moves);

      const startYear = completedStartYear + 1;
      const transitionDate = seasonStartDate(startYear);
      const lastContractDay = seasonEndDate(completedStartYear);

      const retirements = await tx.transfer.findMany({
        where: { saveId, type: "RETIREMENT" },
        select: { playerSaveId: true },
      });
      const alreadyRetired = new Set(retirements.map((transfer) => transfer.playerSaveId));

      const players = await tx.playerSave.findMany({
        where: { saveId },
        select: {
          id: true,
          playerKey: true,
          birthDate: true,
          position: true,
          clubSaveId: true,
          contractUntil: true,
          overall: true,
          potential: true,
          pace: true,
          shooting: true,
          passing: true,
          dribbling: true,
          defending: true,
          physical: true,
          goalkeeping: true,
          clubSave: { select: { clubId: true, isManaged: true } },
        },
      });
      // League minutes only: the cup keeps the managed club's players' stats alone, which would favour them.
      const minutes = await tx.playerSeasonStats.groupBy({
        by: ["playerSaveId"],
        where: { saveId, seasonId: { in: leagueSeasons.map((season) => season.id) } },
        _sum: { minutes: true },
      });
      const minutesByPlayer = new Map(minutes.map((row) => [row.playerSaveId, row._sum.minutes ?? 0]));

      const updates: PlayerUpdate[] = [];
      const transfers: Prisma.TransferCreateManyInput[] = [];
      let retired = 0;
      let freeAgents = 0;

      for (const row of players) {
        if (alreadyRetired.has(row.id)) {
          continue;
        }
        const { id: playerSaveId, playerKey, birthDate, position, clubSave, clubSaveId, contractUntil, ...attributes } = row;
        const age = ageInYears(birthDate, transitionDate);
        // One stream per player: progression first, then the retirement draw.
        const rng = makeRng(progressionRngSeed(save.seed, completedStartYear, playerKey));
        const progressed = progressPlayer({ ...attributes, position }, age, minutesByPlayer.get(playerSaveId) ?? 0, rng);
        const marketValue = marketValueFor({ age, overall: progressed.overall, potential: progressed.potential });
        const fromClubId = clubSave?.clubId ?? null;

        if (willRetire(age, rng)) {
          retired++;
          transfers.push({ saveId, playerSaveId, fromClubId, toClubId: null, type: "RETIREMENT", date: transitionDate });
          updates.push({ ...progressed, playerSaveId, clubSaveId: null, contractUntil: null, marketValue });
        } else if (clubSave?.isManaged === true && contractUntil !== null && contractUntil <= lastContractDay) {
          freeAgents++;
          transfers.push({ saveId, playerSaveId, fromClubId, toClubId: null, type: "FREE", date: transitionDate });
          updates.push({ ...progressed, playerSaveId, clubSaveId: null, contractUntil: null, marketValue });
        } else {
          updates.push({ ...progressed, playerSaveId, clubSaveId, contractUntil, marketValue });
        }
      }

      // Dates go through ISO strings: a Date parameter would be sent in the server's local time zone. In batches: a
      // statement takes 65 535 parameters at most, and a worldVersion 2 save has some 5 000 players of 13 each.
      for (const batch of chunk(updates, UPDATE_BATCH_SIZE)) {
        await tx.$executeRaw`
          UPDATE "PlayerSave" AS p
          SET "clubSaveId" = v."clubSaveId",
              "contractUntil" = v."contractUntil",
              "overall" = v."overall",
              "potential" = v."potential",
              "pace" = v."pace",
              "shooting" = v."shooting",
              "passing" = v."passing",
              "dribbling" = v."dribbling",
              "defending" = v."defending",
              "physical" = v."physical",
              "goalkeeping" = v."goalkeeping",
              "marketValue" = v."marketValue",
              "form" = ${CONDITION_NEUTRAL},
              "morale" = ${CONDITION_NEUTRAL},
              "fitness" = ${FULL_FITNESS},
              "injuredUntil" = NULL
          FROM (VALUES ${Prisma.join(
            batch.map(
              (update) => Prisma.sql`(${update.playerSaveId}::text, ${update.clubSaveId}::text,
                ${update.contractUntil?.toISOString() ?? null}::timestamp(3), ${update.overall}::int,
                ${update.potential}::int, ${update.pace}::int, ${update.shooting}::int, ${update.passing}::int,
                ${update.dribbling}::int, ${update.defending}::int, ${update.physical}::int,
                ${update.goalkeeping}::int, ${update.marketValue}::int)`,
            ),
          )}) AS v("id", "clubSaveId", "contractUntil", "overall", "potential", "pace", "shooting", "passing",
                   "dribbling", "defending", "physical", "goalkeeping", "marketValue")
          WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
      }

      if (transfers.length > 0) {
        await tx.transfer.createMany({ data: transfers });
      }

      await tx.season.updateMany({ where: { saveId, id: { in: seasonIds } }, data: { completed: true } });
      // The moving clubs change competition and finances before the preseason, whose AI clubs plan with them.
      await applySeasonMoves(tx, saveId, worldVersion, leagueSeasons, moves);
      await tx.save.update({ where: { id: saveId }, data: { currentDate: transitionDate } });

      const preseason = await runPreseasonInTransaction(tx, saveId);

      const nextSeasons = await tx.season.createManyAndReturn({
        data: leagueSeasons.map((season) => ({ saveId, competitionId: season.competitionId, startYear })),
        select: { id: true, competitionId: true },
      });
      const codeByCompetition = new Map(leagueSeasons.map((season) => [season.competitionId, season.competition.code]));
      // Each club plays its current competition in the save (ClubSave.competitionId), never the world's.
      const clubSaves = await tx.clubSave.findMany({
        where: { saveId },
        select: { id: true, competitionId: true, club: { select: { slug: true } } },
      });

      const fixtures = nextSeasons.flatMap((season) =>
        seasonFixtures({
          saveId,
          saveSeed: save.seed,
          worldVersion,
          seasonId: season.id,
          competitionCode: getOrThrow(codeByCompetition, season.competitionId, "competition code"),
          startYear,
          clubs: clubSaves
            .filter((clubSave) => clubSave.competitionId === season.competitionId)
            .map((clubSave) => ({ slug: clubSave.club.slug, clubSaveId: clubSave.id })),
        }),
      );
      await tx.fixture.createMany({ data: fixtures });

      return {
        completedStartYear,
        completedSeasonId,
        startYear,
        moves: moves.length,
        retired,
        freeAgents,
        fixtures: fixtures.length,
        preseason,
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
