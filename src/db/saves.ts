import * as z from "zod";
import { clubFinances, generateContract, marketValueFor } from "../engine/economy";
import { FREE_AGENT_POOL_SLUG, freeAgentPlayerKey, generateFreeAgentAttributes } from "../engine/free-agents";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "../engine/generation";
import { worldPlayerKey } from "../engine/identity";
import { seasonStartYear, WORLD_START_DATE } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { seasonFixtures } from "./fixtures";
import { runPreseasonInTransaction } from "./preseason";

export const createSaveInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  managerName: z.string().trim().min(1).max(100),
  clubId: z.string().min(1),
  seed: z.string().min(1).max(200),
});

export type CreateSaveInput = z.input<typeof createSaveInputSchema>;

// A new save writes about 4 000 rows: allow much more than the 5 s default.
const TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 120_000;

/**
 * Creates a save and its whole initial state in one transaction: a ClubSave per club, a PlayerSave per
 * world player (identity copied from Player; the free agent pool without a club or a contract), the first
 * preseason (young players), a Season per competition and its fixtures. Everything random derives from the
 * seed, so the same seed always yields the same save. Reference tables (Competition, Club, Player) are only read.
 */
export async function createSave(input: CreateSaveInput): Promise<{ id: string }> {
  const { name, managerName, clubId, seed } = createSaveInputSchema.parse(input);

  return prisma.$transaction(
    async (tx) => {
      // Sequential on purpose: a transaction runs on a single connection, which takes one query at a time.
      const competitions = await tx.competition.findMany({ select: { id: true, code: true } });
      const clubRows = await tx.club.findMany({
        select: { id: true, slug: true, initialRank: true, competitionId: true },
      });
      const players = await tx.player.findMany({
        select: {
          id: true,
          initialClubId: true,
          squadSlot: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          nationality: true,
          position: true,
        },
      });

      const clubs = clubRows.map((club) => {
        if (club.competitionId === null) {
          throw new Error(`Club ${club.slug} has no competition`);
        }
        return { ...club, competitionId: club.competitionId };
      });
      if (!clubs.some((club) => club.id === clubId)) {
        throw new Error(`Unknown club: ${clubId}`);
      }

      const clubById = new Map(clubs.map((club) => [club.id, club]));
      const clubCountByCompetition = new Map<string, number>();
      for (const club of clubs) {
        clubCountByCompetition.set(club.competitionId, (clubCountByCompetition.get(club.competitionId) ?? 0) + 1);
      }

      const save = await tx.save.create({
        data: { name, managerName, seed, currentDate: WORLD_START_DATE },
        select: { id: true, seed: true, currentDate: true },
      });

      const clubSaves = await tx.clubSave.createManyAndReturn({
        data: clubs.map((club) => ({
          saveId: save.id,
          clubId: club.id,
          isManaged: club.id === clubId,
          ...clubFinances(club.initialRank, getOrThrow(clubCountByCompetition, club.competitionId, "club count")),
        })),
        select: { id: true, clubId: true },
      });
      const clubSaveIdByClubId = new Map(clubSaves.map((clubSave) => [clubSave.clubId, clubSave.id]));

      await tx.playerSave.createMany({
        data: players.map(({ id: playerId, initialClubId, squadSlot, ...identity }): Prisma.PlayerSaveCreateManyInput => {
          const age = ageInYears(identity.birthDate, save.currentDate);

          if (initialClubId === null) {
            // The free agent pool: rated within its own range whatever the club levels, no club, no contract.
            const rng = makeRng(attributeRngSeed(save.seed, FREE_AGENT_POOL_SLUG, squadSlot));
            const attributes = generateFreeAgentAttributes({ position: identity.position, age }, rng);
            return {
              saveId: save.id,
              playerId,
              playerKey: freeAgentPlayerKey(squadSlot),
              ...identity,
              clubSaveId: null,
              ...attributes,
              marketValue: marketValueFor({ age, overall: attributes.overall, potential: attributes.potential }),
              wage: 0,
              contractUntil: null,
            };
          }

          const club = getOrThrow(clubById, initialClubId, "club");
          const clubLevel = clubLevelFromRank(
            club.initialRank,
            getOrThrow(clubCountByCompetition, club.competitionId, "club count"),
          );
          // One stream per player, keyed by stable identity: attributes first, then the contract length.
          const rng = makeRng(attributeRngSeed(save.seed, club.slug, squadSlot));
          const attributes = generateAttributes({ position: identity.position, age }, clubLevel, rng);
          const contract = generateContract(
            { age, overall: attributes.overall, potential: attributes.potential },
            save.currentDate,
            rng,
          );
          return {
            saveId: save.id,
            playerId,
            playerKey: worldPlayerKey(club.slug, squadSlot),
            ...identity,
            clubSaveId: getOrThrow(clubSaveIdByClubId, club.id, "club save"),
            ...attributes,
            ...contract,
          };
        }),
      });

      // AI squads are full (SQUAD_SIZE_MAX) once the young players arrive: the pool stays on the market.
      await runPreseasonInTransaction(tx, save.id);

      const startYear = seasonStartYear(save.currentDate);
      const seasons = await tx.season.createManyAndReturn({
        data: competitions.map((competition) => ({ saveId: save.id, competitionId: competition.id, startYear })),
        select: { id: true, competitionId: true },
      });
      const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));

      await tx.fixture.createMany({
        data: seasons.flatMap((season) => {
          const competition = getOrThrow(competitionById, season.competitionId, "competition");
          return seasonFixtures({
            saveId: save.id,
            saveSeed: save.seed,
            seasonId: season.id,
            competitionCode: competition.code,
            startYear,
            clubs: clubs
              .filter((club) => club.competitionId === competition.id)
              .map((club) => ({ slug: club.slug, clubSaveId: getOrThrow(clubSaveIdByClubId, club.id, "club save") })),
          });
        }),
      });

      return { id: save.id };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}

export type SaveSummary = {
  id: string;
  name: string;
  managerName: string;
  currentDate: Date;
  club: { name: string; primaryColor: string; secondaryColor: string };
};

const SAVE_SUMMARY_SELECT = {
  id: true,
  name: true,
  managerName: true,
  currentDate: true,
  clubSaves: {
    where: { isManaged: true },
    select: { club: { select: { name: true, primaryColor: true, secondaryColor: true } } },
  },
} as const;

function toSaveSummary(save: {
  id: string;
  name: string;
  managerName: string;
  currentDate: Date;
  clubSaves: { club: SaveSummary["club"] }[];
}): SaveSummary {
  const [managed] = save.clubSaves;
  if (managed === undefined) {
    throw new Error(`Save ${save.id} has no managed club`);
  }
  return { id: save.id, name: save.name, managerName: save.managerName, currentDate: save.currentDate, club: managed.club };
}

/** Every save, most recently played first. */
export async function listSaves(): Promise<SaveSummary[]> {
  const saves = await prisma.save.findMany({ orderBy: { updatedAt: "desc" }, select: SAVE_SUMMARY_SELECT });
  return saves.map(toSaveSummary);
}

/** A save with its managed club, or null when it does not exist. */
export async function getSaveSummary(saveId: string): Promise<SaveSummary | null> {
  const save = await prisma.save.findUnique({ where: { id: saveId }, select: SAVE_SUMMARY_SELECT });
  return save === null ? null : toSaveSummary(save);
}

/** Deletes a save and, by cascade, everything in it: the only deletion the game allows. */
export async function deleteSave(saveId: string): Promise<void> {
  await prisma.save.delete({ where: { id: saveId } });
}
