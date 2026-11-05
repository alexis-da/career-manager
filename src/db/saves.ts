import * as z from "zod";
import { MAX_CHALLENGE_SAVES_PER_WEEK } from "../config/challenge";
import { displayClubName } from "../engine/club-name";
import { clubFinances, generateContract, marketValueFor } from "../engine/economy";
import { FREE_AGENT_POOL_SLUG, freeAgentPlayerKey, generateFreeAgentAttributes } from "../engine/free-agents";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "../engine/generation";
import { worldPlayerKey } from "../engine/identity";
import { CUPS_ENABLED } from "../engine/cup";
import { countryOf } from "../engine/promotion";
import { competitionTier } from "../engine/tiers";
import { seasonStartYear, WORLD_START_DATE } from "../engine/world";
import { DEFAULT_WORLD_VERSION, worldTiers } from "../engine/world-version";
import type { Prisma } from "../generated/prisma/client";
import { chunk } from "../lib/arrays";
import { describeError, phaseTimer, type PhaseTimer } from "../lib/diagnostics";
import { ageInYears } from "../lib/dates";
import { isoWeekNumber } from "../lib/iso-week";
import { canCreateSave, ChallengeEntryExistsError, ChallengeFullError, SaveLimitError } from "../lib/limits";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { visibleSavesWhere, type SaveViewer } from "./access";
import { prisma } from "./client";
import { openCups } from "./cup";
import { seasonFixtures } from "./fixtures";
import { runPreseasonInTransaction } from "./preseason";
import { openSeasonObjectives } from "./objectives";
import { firstSeasonDotation, recordDotation } from "./season-finances";
import { TRANSACTION_MAX_WAIT_MS } from "./transactions";

export const createSaveInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  managerName: z.string().trim().min(1).max(100),
  clubId: z.string().min(1),
  seed: z.string().min(1).max(200),
  ownerId: z.string().min(1), // every new save has an owner: only inherited saves, from before owners, have none
  // The game creates DEFAULT_WORLD_VERSION saves; tests pass 2 for the second divisions.
  worldVersion: z.union([z.literal(1), z.literal(2)]).default(DEFAULT_WORLD_VERSION),
  // The national cups of a worldVersion 2 save: CUPS_ENABLED (true) for the game; a test may pass either.
  cups: z.boolean().default(CUPS_ENABLED),
});

export type CreateSaveInput = z.input<typeof createSaveInputSchema>;

export const createChallengeSaveInputSchema = z.object({
  challengeId: z.string().min(1),
  managerName: z.string().trim().min(1).max(100),
  ownerId: z.string().min(1),
});

export type CreateChallengeSaveInput = z.input<typeof createChallengeSaveInputSchema>;

/** What a creation writes: a challenge save also has its challenge, and the cap of its week. */
type SaveData = z.output<typeof createSaveInputSchema> & { challenge: { id: string; maxSaves: number } | null };

// A new save writes about 4 000 rows in a worldVersion 1 world, 8 500 in a worldVersion 2 one: allow much more than
// the 5 s default.
const TRANSACTION_TIMEOUT_MS = 120_000;

/** Rows per INSERT of the large tables: bounded statements rather than one of several thousand rows. */
const CREATE_BATCH_SIZE = 1_000;

/**
 * Creates a save and its whole initial state in one transaction: a ClubSave per club of its world (worldVersion: the
 * first divisions, or the first and second ones), a PlayerSave per player of those clubs (identity copied from Player)
 * and per free agent of the pool (without a club or a contract), the first preseason (young players), a Season per
 * competition and its fixtures; in a worldVersion 2 save with cups (CUPS_ENABLED), the national cups and their
 * preliminary rounds too. The large tables are written in batches of CREATE_BATCH_SIZE rows. Everything random
 * derives from the seed, so the same seed always yields the same save; each player's stream is his own, so a first
 * division player gets the same attributes in both worlds. Reference tables (Competition, Club, Player) are only read.
 * Throws SaveLimitError, before writing anything, when the owner already has as many saves as their kind allows (their
 * challenge saves left out).
 */
export async function createSave(input: CreateSaveInput): Promise<{ id: string }> {
  return timedWriteSave({ ...createSaveInputSchema.parse(input), challenge: null });
}

/**
 * Creates a user's save of a week's challenge: the save createSave makes in a worldVersion 2 world, cups included, with
 * the challenge's seed and club, the same for every player of the week, and no name of its own (the screens name it from
 * its week, in the player's language: SaveSummary.challengeWeek), and the user's entry
 * (ChallengeEntry) in the same transaction. Outside the save limits; before writing anything, throws
 * ChallengeEntryExistsError when the user already has an entry this week (even if they deleted its save: the entry
 * stays), and ChallengeFullError when the week has maxSaves challenge saves. Whether the challenge is still open is the
 * caller's to check: that is real time.
 */
export async function createChallengeSave(
  input: CreateChallengeSaveInput,
  { maxSaves = MAX_CHALLENGE_SAVES_PER_WEEK }: { maxSaves?: number } = {},
): Promise<{ id: string }> {
  const { challengeId, managerName, ownerId } = createChallengeSaveInputSchema.parse(input);
  const challenge = await prisma.challenge.findUniqueOrThrow({
    where: { id: challengeId },
    select: { weekKey: true, seed: true, clubId: true },
  });
  return timedWriteSave({
    name: "",
    managerName,
    clubId: challenge.clubId,
    seed: challenge.seed,
    ownerId,
    worldVersion: 2,
    cups: CUPS_ENABLED,
    challenge: { id: challengeId, maxSaves },
  });
}

/** A rule's refusal, before anything is written: no error worth a log line. */
const isRefusal = (error: unknown): boolean =>
  error instanceof SaveLimitError || error instanceof ChallengeEntryExistsError || error instanceof ChallengeFullError;

/** writeSave, its phases and its duration in the logs, a failure's too. */
async function timedWriteSave(data: SaveData): Promise<{ id: string }> {
  const timer = phaseTimer();
  const what = `world ${data.worldVersion}${data.challenge === null ? "" : ", challenge"}`;
  try {
    const created = await writeSave(data, timer);
    console.info(`[createSave] ${what}: ${timer.elapsed()} ms (${timer.summary()})`);
    return created;
  } catch (error) {
    if (!isRefusal(error)) {
      console.error(
        `[createSave] ${what}, failed after ${timer.elapsed()} ms (${timer.summary() || "nothing done"}): ${describeError(error)}`,
      );
    }
    throw error;
  }
}

/** The transaction of a creation, each phase marked on the timer for the logs. */
async function writeSave(data: SaveData, timer: PhaseTimer): Promise<{ id: string }> {
  const { name, managerName, clubId, seed, ownerId, worldVersion, cups, challenge } = data;
  const tiers = worldTiers(worldVersion);

  return prisma.$transaction(
    async (tx) => {
      // The limits first: a refused creation reads nothing else. A challenge save leaves the save limit alone, for its
      // own rules: one a user a week, and the week's cap. The cap is read without a lock: two creations at once may
      // pass it by one, which the storage it protects can take.
      if (challenge === null) {
        const owner = await tx.user.findUniqueOrThrow({
          where: { id: ownerId },
          select: { kind: true, _count: { select: { saves: { where: { challengeId: null } } } } },
        });
        if (!canCreateSave(owner.kind, owner._count.saves)) {
          throw new SaveLimitError(owner.kind, owner._count.saves);
        }
      } else {
        const entry = await tx.challengeEntry.findUnique({
          where: { challengeId_userId: { challengeId: challenge.id, userId: ownerId } },
          select: { id: true },
        });
        if (entry !== null) {
          throw new ChallengeEntryExistsError(challenge.id, ownerId);
        }
        if ((await tx.save.count({ where: { challengeId: challenge.id } })) >= challenge.maxSaves) {
          throw new ChallengeFullError(challenge.id, challenge.maxSaves);
        }
      }

      timer.mark("limit");

      // Sequential on purpose: a transaction runs on a single connection, which takes one query at a time.
      const competitions = await tx.competition.findMany({
        where: { kind: "LEAGUE", tier: { in: tiers } },
        select: { id: true, code: true },
      });
      const clubRows = await tx.club.findMany({
        where: { competition: { tier: { in: tiers } } },
        select: { id: true, slug: true, initialRank: true, competitionId: true, competition: { select: { tier: true } } },
      });
      // The players of the world's clubs, and the free agent pool, the same in every world.
      const players = await tx.player.findMany({
        where: { OR: [{ initialClubId: null }, { initialClub: { competition: { tier: { in: tiers } } } }] },
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

      timer.mark("read");

      const clubs = clubRows.map(({ competition, ...club }) => {
        if (club.competitionId === null || competition === null) {
          throw new Error(`Club ${club.slug} has no competition`);
        }
        return { ...club, competitionId: club.competitionId, tier: competitionTier(competition.tier) };
      });
      if (!clubs.some((club) => club.id === clubId)) {
        throw new Error(`Unknown club in world ${worldVersion}: ${clubId}`);
      }

      const clubById = new Map(clubs.map((club) => [club.id, club]));
      const clubCountByCompetition = new Map<string, number>();
      for (const club of clubs) {
        clubCountByCompetition.set(club.competitionId, (clubCountByCompetition.get(club.competitionId) ?? 0) + 1);
      }

      const save = await tx.save.create({
        data: { name, managerName, seed, ownerId, worldVersion, currentDate: WORLD_START_DATE, challengeId: challenge?.id ?? null },
        select: { id: true, seed: true, currentDate: true },
      });
      if (challenge !== null) {
        // Right after the save: a creation for the same user and week at the same time waits on this row's unique
        // index, then fails here, before writing its world.
        try {
          await tx.challengeEntry.create({ data: { challengeId: challenge.id, userId: ownerId, saveId: save.id }, select: { id: true } });
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "P2002") {
            throw new ChallengeEntryExistsError(challenge.id, ownerId);
          }
          throw error;
        }
      }

      const clubSaves = await tx.clubSave.createManyAndReturn({
        data: clubs.map((club) => ({
          saveId: save.id,
          clubId: club.id,
          competitionId: club.competitionId,
          isManaged: club.id === clubId,
          ...clubFinances(club.initialRank, getOrThrow(clubCountByCompetition, club.competitionId, "club count"), club.tier),
        })),
        select: { id: true, clubId: true },
      });
      const clubSaveIdByClubId = new Map(clubSaves.map((clubSave) => [clubSave.clubId, clubSave.id]));
      timer.mark("clubs");

      const playerRows = players.map(
        ({ id: playerId, initialClubId, squadSlot, ...identity }): Prisma.PlayerSaveCreateManyInput => {
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
            club.tier,
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
        },
      );
      for (const batch of chunk(playerRows, CREATE_BATCH_SIZE)) {
        await tx.playerSave.createMany({ data: batch });
      }
      timer.mark(`players ${playerRows.length}`);

      // AI squads are full (SQUAD_SIZE_MAX) once the young players arrive: the pool stays on the market.
      await runPreseasonInTransaction(tx, save.id);
      timer.mark("preseason");

      const startYear = seasonStartYear(save.currentDate);
      const seasons = await tx.season.createManyAndReturn({
        data: competitions.map((competition) => ({ saveId: save.id, competitionId: competition.id, startYear })),
        select: { id: true, competitionId: true },
      });
      const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));

      const fixtures = seasons.flatMap((season) => {
        const competition = getOrThrow(competitionById, season.competitionId, "competition");
        return seasonFixtures({
          saveId: save.id,
          saveSeed: save.seed,
          worldVersion,
          seasonId: season.id,
          competitionCode: competition.code,
          startYear,
          clubs: clubs
            .filter((club) => club.competitionId === competition.id)
            .map((club) => ({ slug: club.slug, clubSaveId: getOrThrow(clubSaveIdByClubId, club.id, "club save") })),
        });
      });
      for (const batch of chunk(fixtures, CREATE_BATCH_SIZE)) {
        await tx.fixture.createMany({ data: batch });
      }
      timer.mark(`fixtures ${fixtures.length}`);

      if (worldVersion === 2 && cups) {
        // The clubs' places in the world's source season decide who plays the preliminary rounds.
        const ties = await openCups(tx, {
          saveId: save.id,
          saveSeed: save.seed,
          startYear,
          entrants: clubs.map((club) => ({
            club: club.slug,
            tier: club.tier,
            rank: club.initialRank,
            clubSaveId: getOrThrow(clubSaveIdByClubId, club.id, "club save"),
            country: countryOf(getOrThrow(competitionById, club.competitionId, "competition").code),
          })),
        });
        timer.mark(`cups ${ties}`);
      }

      // The managed club's first dotation, its creation finances, and its objectives, on its league season.
      const first = await firstSeasonDotation(tx, save.id);
      await recordDotation(tx, save.id, first.seasonId, first.dotation);
      await openSeasonObjectives(tx, save.id, { id: first.seasonId, startYear });

      return { id: save.id };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}

export type SaveSummary = {
  id: string;
  name: string; // the player's; empty for a challenge save, named from its week
  managerName: string;
  currentDate: Date;
  // A save of the weekly challenge: the number of its week, which names it in the player's language; null otherwise.
  challengeWeek: number | null;
  club: { name: string };
};

const SAVE_SUMMARY_SELECT = {
  id: true,
  name: true,
  managerName: true,
  currentDate: true,
  challenge: { select: { weekKey: true } },
  clubSaves: {
    where: { isManaged: true },
    select: { club: { select: { slug: true, name: true } } },
  },
} as const;

function toSaveSummary(save: {
  id: string;
  name: string;
  managerName: string;
  currentDate: Date;
  challenge: { weekKey: string } | null;
  clubSaves: { club: SaveSummary["club"] & { slug: string } }[];
}): SaveSummary {
  const [managed] = save.clubSaves;
  if (managed === undefined) {
    throw new Error(`Save ${save.id} has no managed club`);
  }
  return {
    id: save.id,
    name: save.name,
    managerName: save.managerName,
    currentDate: save.currentDate,
    challengeWeek: save.challenge === null ? null : isoWeekNumber(save.challenge.weekKey),
    club: { name: displayClubName(managed.club) },
  };
}

/** The saves a viewer may open (their own, src/db/access.ts), most recently played first. */
export async function listSaves(viewer: SaveViewer): Promise<SaveSummary[]> {
  const saves = await prisma.save.findMany({
    where: visibleSavesWhere(viewer),
    orderBy: { updatedAt: "desc" },
    select: SAVE_SUMMARY_SELECT,
  });
  return saves.map(toSaveSummary);
}

/** How many saves a user owns, their challenge saves left out: what the save limit (src/lib/limits.ts) counts. */
export async function countOwnedSaves(userId: string): Promise<number> {
  return prisma.save.count({ where: { ownerId: userId, challengeId: null } });
}

/** Whether a save has a match played: from then on, an anonymous player is asked to sign in. */
export async function hasPlayedMatch(saveId: string): Promise<boolean> {
  return (await prisma.fixture.findFirst({ where: { saveId, played: true }, select: { id: true } })) !== null;
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
