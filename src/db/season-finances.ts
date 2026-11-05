import { NEUTRAL_BUDGET_COEFFICIENT } from "../engine/balance";
import { seasonFinances, type SeasonFinances } from "../engine/economy";
import { budgetCoefficient, divisionOf, rankingObjective, rankingOutcome } from "../engine/objectives";
import type { MoveReason } from "../engine/promotion";
import { reputationAfterSeason, reputationRanks } from "../engine/reputation";
import { competitionTier, type CompetitionTier } from "../engine/tiers";
import type { WorldVersion } from "../engine/world-version";
import { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import type { FinalTables, SeasonMove } from "./promotion";

type Db = Prisma.TransactionClient;

/** The managed club's dotation for a season, as SeasonBudget keeps it: its finances and the reputation behind them. */
export type ManagedDotation = SeasonFinances & { reputation: number; reputationRank: number };

/** A club at the end of the season being closed: where it finished against what was expected of it. */
export type ClubSeasonEnd = {
  clubSaveId: string;
  code: string; // the competition it played
  tier: CompetitionTier;
  clubCount: number; // of that competition
  expectedRank: number; // its reputation rank in that competition as the season was played
  finalRank: number;
  move: MoveReason | null;
  reputationBefore: number;
  reputation: number; // after the season
};

/**
 * Every club's reputation after the season being closed (gameplay v2, V2), inside advanceToNextSeason's transaction:
 * its expected rank is its reputation rank in its division as the season was played (reputationRanks), its final rank
 * the final table's, and a promotion or a relegation counts too (reputationAfterSeason). AI clubs and the managed club
 * alike, in both worlds. Returns each club's season end.
 */
export async function applySeasonReputations(
  tx: Db,
  saveId: string,
  tables: FinalTables,
  moves: readonly SeasonMove[],
): Promise<ClubSeasonEnd[]> {
  const clubs = await tx.clubSave.findMany({ where: { saveId }, select: { id: true, reputation: true } });
  const reputationOf = new Map(clubs.map((club) => [club.id, club.reputation]));
  const moveOf = new Map(moves.map((move) => [move.clubSaveId, move.reason]));

  const ends = tables.standings.flatMap(({ code, tier, table }): ClubSeasonEnd[] => {
    const members = table.map((row) => ({
      clubSaveId: getOrThrow(tables.clubBySlug, row.club, "club of the table").clubSaveId,
      finalRank: row.rank,
    }));
    const expected = reputationRanks(
      members.map(({ clubSaveId }) => ({ key: clubSaveId, reputation: getOrThrow(reputationOf, clubSaveId, "club") })),
    );
    return members.map(({ clubSaveId, finalRank }) => {
      const reputationBefore = getOrThrow(reputationOf, clubSaveId, "club");
      const expectedRank = getOrThrow(expected, clubSaveId, "expected rank");
      const move = moveOf.get(clubSaveId) ?? null;
      return {
        clubSaveId,
        code,
        tier,
        clubCount: members.length,
        expectedRank,
        finalRank,
        move,
        reputationBefore,
        reputation: reputationAfterSeason(reputationBefore, expectedRank, finalRank, move),
      };
    });
  });

  const changed = ends.filter((end) => end.reputation !== end.reputationBefore);
  if (changed.length > 0) {
    await tx.$executeRaw`
      UPDATE "ClubSave" AS c
      SET "reputation" = v."reputation"
      FROM (VALUES ${Prisma.join(changed.map((end) => Prisma.sql`(${end.clubSaveId}::text, ${end.reputation}::int)`))})
        AS v("id", "reputation")
      WHERE c."id" = v."id" AND c."saveId" = ${saveId}`;
  }
  return ends;
}

/**
 * An AI club's budget coefficient for the season it closes: its ranking objective's alone (budgetCoefficient), the
 * objective its expected rank gave it in the division it played (rankingObjective), against its final rank.
 */
export function aiCoefficient(end: ClubSeasonEnd, worldVersion: WorldVersion): number {
  const division = divisionOf(end.code, end.tier, end.clubCount, worldVersion);
  return budgetCoefficient({ ranking: rankingOutcome(rankingObjective(end.expectedRank, division), end.finalRank) });
}

/**
 * Every club's finances for the new season (gameplay v2, V2), inside advanceToNextSeason's transaction, once the moving
 * clubs have changed division and every reputation has followed its season, before the preseason: its dotation at its
 * reputation rank in its new division, times its coefficient, plus half of its unspent transfer budget; its wage budget
 * recalculated (seasonFinances). An AI club's coefficient is its ranking objective's (aiCoefficient); the managed club's
 * is the one given, its season's objectives' (100 without any). Returns the managed club's dotation, for its SeasonBudget.
 */
export async function applySeasonFinances(
  tx: Db,
  saveId: string,
  ends: readonly ClubSeasonEnd[],
  worldVersion: WorldVersion,
  managedCoefficient: number,
): Promise<ManagedDotation> {
  const clubs = await tx.clubSave.findMany({
    where: { saveId },
    select: { id: true, isManaged: true, budget: true, reputation: true, competitionId: true, competition: { select: { tier: true } } },
  });
  const endOf = new Map(ends.map((end) => [end.clubSaveId, end]));
  const byDivision = Map.groupBy(clubs, (club) => club.competitionId);

  let managed: ManagedDotation | null = null;
  const updates: { clubSaveId: string; finances: SeasonFinances }[] = [];
  for (const division of byDivision.values()) {
    const ranks = reputationRanks(division.map((club) => ({ key: club.id, reputation: club.reputation })));
    for (const club of division) {
      const reputationRank = getOrThrow(ranks, club.id, "reputation rank");
      const coefficient = club.isManaged
        ? managedCoefficient
        : aiCoefficient(getOrThrow(endOf, club.id, "club's season end"), worldVersion);
      const finances = seasonFinances(reputationRank, division.length, competitionTier(club.competition.tier), coefficient, club.budget);
      updates.push({ clubSaveId: club.id, finances });
      if (club.isManaged) {
        managed = { ...finances, reputation: club.reputation, reputationRank };
      }
    }
  }
  if (managed === null) {
    throw new Error(`Save ${saveId} has no managed club`);
  }

  await tx.$executeRaw`
    UPDATE "ClubSave" AS c
    SET "budget" = v."budget", "wageBudget" = v."wageBudget"
    FROM (VALUES ${Prisma.join(
      updates.map(({ clubSaveId, finances }) => Prisma.sql`(${clubSaveId}::text, ${finances.budget}::int, ${finances.wageBudget}::int)`),
    )}) AS v("id", "budget", "wageBudget")
    WHERE c."id" = v."id" AND c."saveId" = ${saveId}`;
  return managed;
}

/**
 * The managed club's dotation for its first season, at the creation of a save: its creation finances as they are (its
 * budget and wage budget), its reputation rank in its division, a coefficient of 100 and nothing carried over.
 */
export async function firstSeasonDotation(tx: Db, saveId: string): Promise<{ seasonId: string; dotation: ManagedDotation }> {
  const managed = await tx.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { competitionId: true, budget: true, wageBudget: true, reputation: true },
  });
  const rivals = await tx.clubSave.findMany({
    where: { saveId, competitionId: managed.competitionId },
    select: { reputation: true },
  });
  const season = await tx.season.findFirstOrThrow({
    where: { saveId, competitionId: managed.competitionId, completed: false },
    select: { id: true },
  });
  return {
    seasonId: season.id,
    dotation: {
      dotation: managed.budget,
      coefficient: NEUTRAL_BUDGET_COEFFICIENT,
      carryOver: 0,
      budget: managed.budget,
      wageBudget: managed.wageBudget,
      reputation: managed.reputation,
      reputationRank: 1 + rivals.filter((rival) => rival.reputation > managed.reputation).length,
    },
  };
}

/** Writes the managed club's dotation on its league season (SeasonBudget). */
export async function recordDotation(tx: Db, saveId: string, seasonId: string, dotation: ManagedDotation): Promise<void> {
  await tx.seasonBudget.create({ data: { saveId, seasonId, ...dotation }, select: { id: true } });
}
