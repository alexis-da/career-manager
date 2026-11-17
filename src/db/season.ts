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
import { CUPS_ENABLED } from "../engine/cup";
import { EUROPE_ENABLED } from "../engine/europe";
import { cupEntrantsOf, openCups } from "./cup";
import { cupWinnersOf, europeQualifiersOf, europeReputationBonuses, openEurope } from "./europe";
import { seasonFixtures } from "./fixtures";
import { assertNoMatchInProgress } from "./matchday";
import { runPreseasonInTransaction, type PreseasonOptions, type PreseasonSummary } from "./preseason";
import { closeSeasonObjectives, openSeasonObjectives } from "./objectives";
import { applySeasonMoves, readFinalTables, seasonMovesOf } from "./promotion";
import { applySeasonFinances, applySeasonReputations, payrollsOf, recordDotation } from "./season-finances";
import { unlockSeasonAchievements } from "./rewards";
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
  // Players of the managed club whose contract ended; AI clubs decide in the preseason, and the managed club too when
  // the assistant manages its contracts (none then).
  freeAgents: number;
  fixtures: number; // of the leagues
  cupTies: number; // the cups' preliminary rounds (worldVersion 2 saves)
  europeMatches: number; // the European competitions' league phases (worldVersion 2 saves, never a challenge save's)
  preseason: PreseasonSummary;
};

export class SeasonNotFinishedError extends Error {
  constructor(readonly unplayedFixtures: number) {
    super(`The season is not finished: ${unplayedFixtures} fixtures left to play`);
    this.name = "SeasonNotFinishedError";
  }
}

/**
 * A transition's options: the preseason's (assistantContracts), and `europe`, the measurement scripts' baseline only: false
 * opens no European competition, whatever the game's rule (EUROPE_ENABLED), to weigh a save without them. Absent, the
 * game's rule.
 */
export type SeasonTransitionOptions = PreseasonOptions & { europe?: false };

type PlayerUpdate = PlayerAttributes & {
  playerSaveId: string;
  clubSaveId: string | null;
  retired: boolean;
  contractUntil: Date | null;
  marketValue: number;
};

/**
 * Closes the season in progress and opens the next one, in one transaction. Refused while the managed club's
 * match waits at half-time (MatchInProgressError) or a fixture of the season is unplayed. Then: in a worldVersion 2
 * save, promotion and relegation are drawn from the final tables (src/db/promotion.ts); the managed club's
 * SeasonResult is written and its objectives of the season get their outcome (src/db/objectives.ts); every player
 * progresses (retired players excepted) and gets his market value from his new rating and age, some retire, expired
 * contracts of the managed club turn its players into free agents, form, morale, fitness, injuries and yellow cards
 * are reset (a suspension still to serve carries over), the seasons are marked completed (with their moves), the
 * moving clubs change competition, every club's reputation follows its final place against its expected rank and every
 * club gets its finances for the new season, its dotation (from its objectives for the managed club, which alone keeps
 * half of its unspent budget) and its wage budget from its payroll at the end of the season
 * (src/db/season-finances.ts), the save moves to 1 July, the preseason runs (young players, AI squads), and next season's seasons and fixtures are created, with the managed club's dotation
 * (SeasonBudget), the cups of a worldVersion 2 save and their preliminary rounds, drawn from the final tables (when the
 * save already had cups, or the game gives them: CUPS_ENABLED), its European competitions and their league phases, from
 * the final tables and the cups' winners (when the save already had them, or the game gives them: EUROPE_ENABLED; never
 * a challenge save), then the managed club's objectives of the new season. Every cup tie and European match must have
 * been played too: the season ends with the European finals. A European run raises a club's reputation target
 * (europeReputationBonuses).
 * PlayerSave.marketValue is read as is everywhere else: this is where it changes.
 * options.assistantContracts (the measurement scripts' and tests' mode, never the game's): the assistant manages the
 * managed club's contracts, whose expired ones stay for its preseason to renew or release as an AI club's.
 */
export async function advanceToNextSeason(saveId: string, options: SeasonTransitionOptions = {}): Promise<SeasonTransition> {
  const transition = await prisma.$transaction(
    async (tx) => {
      await assertNoMatchInProgress(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({
        where: { id: saveId },
        select: { seed: true, worldVersion: true, challengeId: true },
      });
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
      const cupSeasonIds = seasons.filter((season) => season.competition.kind === "CUP").map((season) => season.id);
      const europeSeasonIds = seasons.filter((season) => season.competition.kind === "EUROPE").map((season) => season.id);

      const unplayed = await tx.fixture.count({ where: { saveId, seasonId: { in: seasonIds }, played: false } });
      if (unplayed > 0) {
        throw new SeasonNotFinishedError(unplayed);
      }

      // The final tables, which every club's reputation follows; promotion and relegation from them (worldVersion 2
      // saves only: a worldVersion 1 save has one division a country); then the managed club's result and cup run,
      // before any player progresses, retires or leaves.
      const worldVersion = worldVersionOf(save.worldVersion);
      const tables = await readFinalTables(tx, saveId, leagueSeasons);
      const moves = worldVersion === 1 ? [] : seasonMovesOf(tables);
      const completedSeasonId = await recordSeasonResult(tx, saveId, leagueSeasons, moves, cupSeasonIds, europeSeasonIds);
      // The managed club's objectives of the season, closed: their coefficient goes to its next dotation.
      const managedCoefficient = await closeSeasonObjectives(tx, saveId, completedSeasonId);

      const startYear = completedStartYear + 1;
      const transitionDate = seasonStartDate(startYear);
      const lastContractDay = seasonEndDate(completedStartYear);

      // Every club's payroll at the end of the season, before any player retires or leaves: its next wage budget's base.
      const payrolls = await payrollsOf(tx, saveId);

      // The retired players are out of the world: they neither progress nor retire again.
      const players = await tx.playerSave.findMany({
        where: { saveId, retired: false },
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
      // League minutes only: the cup and Europe keep the managed club's players' stats alone, which would favour them.
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
          updates.push({ ...progressed, playerSaveId, clubSaveId: null, retired: true, contractUntil: null, marketValue });
        } else if (
          clubSave?.isManaged === true &&
          options.assistantContracts !== true &&
          contractUntil !== null &&
          contractUntil <= lastContractDay
        ) {
          freeAgents++;
          transfers.push({ saveId, playerSaveId, fromClubId, toClubId: null, type: "FREE", date: transitionDate });
          updates.push({ ...progressed, playerSaveId, clubSaveId: null, retired: false, contractUntil: null, marketValue });
        } else {
          updates.push({ ...progressed, playerSaveId, clubSaveId, retired: false, contractUntil, marketValue });
        }
      }

      // Dates go through ISO strings: a Date parameter would be sent in the server's local time zone. In batches: a
      // statement takes 65 535 parameters at most, and a worldVersion 2 save has some 5 000 players of 13 each.
      for (const batch of chunk(updates, UPDATE_BATCH_SIZE)) {
        await tx.$executeRaw`
          UPDATE "PlayerSave" AS p
          SET "clubSaveId" = v."clubSaveId",
              "retired" = v."retired",
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
              "injuredUntil" = NULL,
              "leagueYellows" = 0,
              "cupYellows" = 0,
              "europeYellows" = 0
          FROM (VALUES ${Prisma.join(
            batch.map(
              (update) => Prisma.sql`(${update.playerSaveId}::text, ${update.clubSaveId}::text, ${update.retired}::boolean,
                ${update.contractUntil?.toISOString() ?? null}::timestamp(3), ${update.overall}::int,
                ${update.potential}::int, ${update.pace}::int, ${update.shooting}::int, ${update.passing}::int,
                ${update.dribbling}::int, ${update.defending}::int, ${update.physical}::int,
                ${update.goalkeeping}::int, ${update.marketValue}::int)`,
            ),
          )}) AS v("id", "clubSaveId", "retired", "contractUntil", "overall", "potential", "pace", "shooting", "passing",
                   "dribbling", "defending", "physical", "goalkeeping", "marketValue")
          WHERE p."id" = v."id" AND p."saveId" = ${saveId}`;
      }

      if (transfers.length > 0) {
        await tx.transfer.createMany({ data: transfers });
      }

      await tx.season.updateMany({ where: { saveId, id: { in: seasonIds } }, data: { completed: true } });
      // The moving clubs change competition, every club's reputation follows its season (its target raised by a European
      // run), then every club gets its finances for the new season, before the preseason, whose AI clubs plan with them.
      await applySeasonMoves(tx, saveId, worldVersion, leagueSeasons, moves);
      const bonuses = await europeReputationBonuses(tx, saveId, europeSeasonIds);
      const ends = await applySeasonReputations(tx, saveId, tables, moves, bonuses);
      const dotation = await applySeasonFinances(tx, saveId, ends, worldVersion, managedCoefficient, payrolls);
      await tx.save.update({ where: { id: saveId }, data: { currentDate: transitionDate } });

      const preseason = await runPreseasonInTransaction(tx, saveId, options);

      const nextSeasons = await tx.season.createManyAndReturn({
        data: leagueSeasons.map((season) => ({ saveId, competitionId: season.competitionId, startYear })),
        select: { id: true, competitionId: true },
      });
      const codeByCompetition = new Map(leagueSeasons.map((season) => [season.competitionId, season.competition.code]));
      // Each club plays its current competition in the save (ClubSave.competitionId), never the world's.
      const clubSaves = await tx.clubSave.findMany({
        where: { saveId },
        select: { id: true, isManaged: true, competitionId: true, club: { select: { slug: true } } },
      });
      // The managed club's dotation, on its new league season.
      const managedCompetitionId = clubSaves.find((clubSave) => clubSave.isManaged)?.competitionId;
      const managedSeason = nextSeasons.find((season) => season.competitionId === managedCompetitionId);
      if (managedSeason === undefined) {
        throw new Error(`Save ${saveId} has no league season for its managed club in ${startYear}`);
      }
      await recordDotation(tx, saveId, managedSeason.id, dotation);

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
      // The cups of a worldVersion 2 save that had them, or of any once the game gives them (its saves from before the
      // cups included): the final tables rank the entrants.
      const withCups = worldVersion === 2 && (CUPS_ENABLED || cupSeasonIds.length > 0);
      const cupTies = withCups
        ? await openCups(tx, { saveId, saveSeed: save.seed, startYear, entrants: cupEntrantsOf(tables) })
        : 0;
      // The European competitions of a worldVersion 2 save that had them, or of any once the game gives them, never a
      // challenge save's: the final tables and the cups' winners qualify their clubs.
      const withEurope =
        worldVersion === 2 && save.challengeId === null && options.europe !== false && (EUROPE_ENABLED || europeSeasonIds.length > 0);
      const europeMatches = withEurope
        ? await openEurope(tx, {
            saveId,
            saveSeed: save.seed,
            startYear,
            qualifiers: europeQualifiersOf(tables, await cupWinnersOf(tx, saveId, cupSeasonIds, tables)),
          })
        : 0;
      // The managed club's objectives of the new season, once its fixtures and its cup's first round exist.
      await openSeasonObjectives(tx, saveId, { id: managedSeason.id, startYear });

      return {
        completedStartYear,
        completedSeasonId,
        startYear,
        moves: moves.length,
        retired,
        freeAgents,
        fixtures: fixtures.length,
        cupTies,
        europeMatches,
        preseason,
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
  // The season's palmarès and objectives unlock their cosmetics for the save's owner (missions v2), once it is written:
  // a failure costs a badge, never the season.
  await unlockSeasonAchievements(saveId, transition.completedSeasonId);
  return transition;
}
