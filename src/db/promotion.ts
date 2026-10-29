import * as z from "zod";
import { PROMOTION_RELEGATION } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { financesAfterMove } from "../engine/economy";
import { applyPromotionRelegation, countryOf, type CompetitionStanding, type MoveReason } from "../engine/promotion";
import { computeStandings } from "../engine/standings";
import { competitionTier } from "../engine/tiers";
import type { WorldVersion } from "../engine/world-version";
import type { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";

type Db = Prisma.TransactionClient;

/** A season being closed, as advanceToNextSeason reads it. */
export type ClosingSeason = { id: string; competitionId: string; competition: { code: string } };

/** A move as stored in Season.movements: the club (Club.id) leaving the season's competition, and where it goes. */
export const seasonMoveSchema = z.object({
  clubId: z.string().min(1),
  from: z.string().min(1), // competition code
  to: z.string().min(1),
  reason: z.enum(["PROMOTED", "RELEGATED"]),
  rank: z.number().int().min(1), // final rank in the competition it leaves
});

export type SeasonMove = z.infer<typeof seasonMoveSchema> & { clubSaveId: string };

export const seasonMovementsSchema = z.array(seasonMoveSchema);

/** The final tables of the league seasons being closed, and each club of them by its key in the tables (its slug). */
export type FinalTables = {
  standings: CompetitionStanding[];
  clubBySlug: ReadonlyMap<string, { clubId: string; clubSaveId: string }>;
};

/**
 * The final tables of the league seasons being closed, from their played fixtures, keyed and sorted as the league table
 * (getStandings) sorts them: promotion and relegation (seasonMovesOf) and the next cups' preliminary rounds read them.
 */
export async function readFinalTables(tx: Db, saveId: string, seasons: readonly ClosingSeason[]): Promise<FinalTables> {
  // One after the other: the transaction's queries share its connection.
  const competitions = await tx.competition.findMany({
    where: { id: { in: seasons.map((season) => season.competitionId) } },
    select: { id: true, tier: true },
  });
  const fixtures = await tx.fixture.findMany({
    where: { saveId, seasonId: { in: seasons.map((season) => season.id) }, played: true },
    select: {
      seasonId: true,
      homeGoals: true,
      awayGoals: true,
      homeClubSave: { select: { id: true, clubId: true, club: { select: { slug: true } } } },
      awayClubSave: { select: { id: true, clubId: true, club: { select: { slug: true } } } },
    },
  });
  const tierById = new Map(competitions.map((competition) => [competition.id, competitionTier(competition.tier)]));
  const clubBySlug = new Map(
    fixtures.flatMap(({ homeClubSave, awayClubSave }) =>
      [homeClubSave, awayClubSave].map((side) => [side.club.slug, { clubId: side.clubId, clubSaveId: side.id }] as const),
    ),
  );
  const fixturesBySeason = Map.groupBy(fixtures, (fixture) => fixture.seasonId);

  const standings = seasons.map((season): CompetitionStanding => {
    const played = fixturesBySeason.get(season.id) ?? [];
    const scores = played.map(({ homeGoals, awayGoals, homeClubSave, awayClubSave }) => {
      if (homeGoals === null || awayGoals === null) {
        throw new Error(`A played fixture of season ${season.id} has no score`);
      }
      return { home: homeClubSave.club.slug, away: awayClubSave.club.slug, homeGoals, awayGoals };
    });
    return {
      code: season.competition.code,
      tier: getOrThrow(tierById, season.competitionId, "competition tier"),
      table: computeStandings(scores),
    };
  });

  return { standings, clubBySlug };
}

/** The promotions and relegations of final tables: applyPromotionRelegation with PROMOTION_RELEGATION. */
export function seasonMovesOf({ standings, clubBySlug }: FinalTables): SeasonMove[] {
  return applyPromotionRelegation(standings, PROMOTION_RELEGATION).map(({ club, ...move }) => ({
    ...move,
    ...getOrThrow(clubBySlug, club, "club of the table"),
  }));
}

/** A promotion or relegation as the « Saison terminée » panel lists it. */
export type CountryMoveView = {
  clubName: string;
  isManaged: boolean;
  reason: MoveReason;
  rank: number; // final rank in the competition it left
  from: string; // competition code, named by the screens
  to: string;
};

/**
 * The promotions and relegations of a completed season in the country of its competition, from Season.movements:
 * promotions first, each by final rank. Empty for a worldVersion 1 save, or a season still in progress.
 */
export async function getCountryMoves(saveId: string, seasonId: string): Promise<CountryMoveView[]> {
  const season = await prisma.season.findFirst({
    where: { id: seasonId, saveId },
    select: { startYear: true, competition: { select: { code: true } } },
  });
  if (season === null) {
    return [];
  }
  const country = countryOf(season.competition.code);
  const seasons = await prisma.season.findMany({
    where: { saveId, startYear: season.startYear, competition: { kind: "LEAGUE", code: { startsWith: `${country}.` } } },
    select: { movements: true, competition: { select: { code: true } } },
  });
  const moves = seasons.flatMap((row) => (row.movements === null ? [] : seasonMovementsSchema.parse(row.movements)));
  if (moves.length === 0) {
    return [];
  }
  const clubs = await prisma.clubSave.findMany({
    where: { saveId, clubId: { in: moves.map((move) => move.clubId) } },
    select: { clubId: true, isManaged: true, club: { select: { slug: true, name: true } } },
  });
  const clubById = new Map(clubs.map((club) => [club.clubId, club]));

  return moves
    .map((move) => {
      const club = getOrThrow(clubById, move.clubId, "moving club");
      return {
        clubName: displayClubName(club.club),
        isManaged: club.isManaged,
        reason: move.reason,
        rank: move.rank,
        from: move.from,
        to: move.to,
      };
    })
    .sort((a, b) => (a.reason === b.reason ? a.rank - b.rank : a.reason === "PROMOTED" ? -1 : 1));
}

/**
 * Applies the moves of a closing season, inside advanceToNextSeason's transaction and before the preseason: each
 * moving club changes competition in the save (ClubSave.competitionId) and gets its finances for its new division
 * (financesAfterMove); players and contracts are not touched. Each completed season of a worldVersion 2 save keeps the
 * moves out of its competition in Season.movements, an empty list when there are none.
 */
export async function applySeasonMoves(
  tx: Db,
  saveId: string,
  worldVersion: WorldVersion,
  seasons: readonly ClosingSeason[],
  moves: readonly SeasonMove[],
): Promise<void> {
  if (worldVersion === 1) {
    return;
  }
  for (const season of seasons) {
    const out: z.infer<typeof seasonMoveSchema>[] = moves
      .filter((move) => move.from === season.competition.code)
      .map(({ clubId, from, to, reason, rank }) => ({ clubId, from, to, reason, rank }));
    await tx.season.update({ where: { id: season.id, saveId }, data: { movements: out } });
  }

  const competitionIdByCode = new Map(seasons.map((season) => [season.competition.code, season.competitionId]));
  const clubs = await tx.clubSave.findMany({
    where: { saveId, id: { in: moves.map((move) => move.clubSaveId) } },
    select: { id: true, budget: true, wageBudget: true, reputation: true },
  });
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  for (const move of moves) {
    const { budget, wageBudget, reputation } = getOrThrow(clubById, move.clubSaveId, "moving club");
    await tx.clubSave.update({
      where: { id: move.clubSaveId, saveId },
      data: {
        competitionId: getOrThrow(competitionIdByCode, move.to, "competition of the move"),
        ...financesAfterMove({ budget, wageBudget, reputation }, move.reason),
      },
    });
  }
}
