import * as z from "zod";
import { clubFinances, generateContract } from "../engine/economy";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "../engine/generation";
import { generateSchedule, scheduleRngSeed } from "../engine/schedule";
import { FIRST_MATCHDAY_DATE, seasonStartYear, WORLD_START_DATE } from "../engine/world";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";

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

const bySlug = (a: { slug: string }, b: { slug: string }): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/**
 * Creates a save and its whole initial state in one transaction: a ClubSave per club, a PlayerSave per
 * player, a Season per competition and its fixtures. Everything random derives from the seed, so the
 * same seed always yields the same save. Reference tables (Competition, Club, Player) are only read.
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
        select: { id: true, initialClubId: true, squadSlot: true, birthDate: true, position: true },
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
        data: players.map((player) => {
          const club = getOrThrow(clubById, player.initialClubId, "club");
          const clubLevel = clubLevelFromRank(
            club.initialRank,
            getOrThrow(clubCountByCompetition, club.competitionId, "club count"),
          );
          const age = ageInYears(player.birthDate, save.currentDate);
          // One stream per player, keyed by stable identity: attributes first, then the contract length.
          const rng = makeRng(attributeRngSeed(save.seed, club.slug, player.squadSlot));
          const attributes = generateAttributes({ position: player.position, age }, clubLevel, rng);
          const contract = generateContract(
            { age, overall: attributes.overall, potential: attributes.potential },
            save.currentDate,
            rng,
          );
          return {
            saveId: save.id,
            playerId: player.id,
            clubSaveId: getOrThrow(clubSaveIdByClubId, club.id, "club save"),
            ...attributes,
            ...contract,
          };
        }),
      });

      const startYear = seasonStartYear(save.currentDate);
      const seasons = await tx.season.createManyAndReturn({
        data: competitions.map((competition) => ({ saveId: save.id, competitionId: competition.id, startYear })),
        select: { id: true, competitionId: true },
      });
      const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));

      await tx.fixture.createMany({
        data: seasons.flatMap((season) => {
          const competition = getOrThrow(competitionById, season.competitionId, "competition");
          const competitionClubs = clubs.filter((club) => club.competitionId === competition.id).sort(bySlug);
          const clubSaveIdBySlug = new Map(
            competitionClubs.map((club) => [club.slug, getOrThrow(clubSaveIdByClubId, club.id, "club save")]),
          );
          const schedule = generateSchedule(
            competitionClubs.map((club) => club.slug),
            FIRST_MATCHDAY_DATE,
            makeRng(scheduleRngSeed(save.seed, competition.code, startYear)),
          );
          return schedule.map((match) => ({
            saveId: save.id,
            seasonId: season.id,
            round: match.round,
            scheduledAt: match.scheduledAt,
            homeClubSaveId: getOrThrow(clubSaveIdBySlug, match.home, "club save"),
            awayClubSaveId: getOrThrow(clubSaveIdBySlug, match.away, "club save"),
          }));
        }),
      });

      return { id: save.id };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
