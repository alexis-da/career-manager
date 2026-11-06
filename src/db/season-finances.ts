import { NEUTRAL_BUDGET_COEFFICIENT, WAGE_BUDGET_MARGIN } from "../engine/balance";
import { managedWageMargin, seasonFinances, wageBudgetFor, type SeasonFinances } from "../engine/economy";
import { budgetCoefficient, divisionOf, rankingObjective, rankingOutcome } from "../engine/objectives";
import type { MoveReason } from "../engine/promotion";
import { rankInNextDivision, reputationAfterSeason, reputationRanks, reputationTarget } from "../engine/reputation";
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
  target: number; // the reputation it goes towards: the creation's at its rank in the division it plays next
  reputation: number; // after the season
};

/**
 * Every club's reputation after the season being closed (gameplay v2, V2), inside advanceToNextSeason's transaction: a
 * share of the way to its target, the creation's reputation at its final rank in its division; a promoted or a relegated
 * club takes outright the target of its equivalent rank in its new division (rankInNextDivision, reputationTarget,
 * reputationAfterSeason). AI clubs and the managed club alike, in both worlds. Returns each club's season end, with its
 * expected rank, its reputation rank in its division as the season was played (reputationRanks): an AI club's ranking
 * objective's.
 */
export async function applySeasonReputations(
  tx: Db,
  saveId: string,
  tables: FinalTables,
  moves: readonly SeasonMove[],
): Promise<ClubSeasonEnd[]> {
  const clubs = await tx.clubSave.findMany({
    where: { saveId },
    select: { id: true, reputation: true, wageBudget: true, club: { select: { slug: true } } },
  });
  const clubOf = new Map(clubs.map((club) => [club.id, club]));
  const reputationOf = new Map(clubs.map((club) => [club.id, club.reputation]));
  const moveOf = new Map(moves.map((move) => [move.clubSaveId, move]));
  // Each division's tier and size, and how many clubs go from one division to another: their country's exchange.
  const divisionByCode = new Map(tables.standings.map(({ code, tier, table }) => [code, { tier, clubCount: table.length }]));
  const movingBetween = (from: string, to: string): number => moves.filter((move) => move.from === from && move.to === to).length;

  const ends = tables.standings.flatMap(({ code, tier, table }): ClubSeasonEnd[] => {
    const members = table.map((row) => ({
      clubSaveId: getOrThrow(tables.clubBySlug, row.club, "club of the table").clubSaveId,
      finalRank: row.rank,
    }));
    const expected = reputationRanks(
      members.map(({ clubSaveId }) => {
        const club = getOrThrow(clubOf, clubSaveId, "club");
        return { key: clubSaveId, reputation: club.reputation, wageBudget: club.wageBudget, slug: club.club.slug };
      }),
    );
    return members.map(({ clubSaveId, finalRank }) => {
      const reputationBefore = getOrThrow(reputationOf, clubSaveId, "club");
      const expectedRank = getOrThrow(expected, clubSaveId, "expected rank");
      const move = moveOf.get(clubSaveId) ?? null;
      const next = move === null ? { tier, clubCount: members.length } : getOrThrow(divisionByCode, move.to, "next division");
      const rank = rankInNextDivision({
        finalRank,
        clubCount: members.length,
        move: move?.reason ?? null,
        moving: move === null ? 0 : movingBetween(move.from, move.to),
        nextClubCount: next.clubCount,
      });
      const target = reputationTarget(rank, next.clubCount, next.tier);
      return {
        clubSaveId,
        code,
        tier,
        clubCount: members.length,
        expectedRank,
        finalRank,
        move: move?.reason ?? null,
        reputationBefore,
        target,
        reputation: reputationAfterSeason(reputationBefore, target, move?.reason ?? null),
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
 * reputation rank in its new division, times its coefficient, plus, for the managed club alone, half of its unspent
 * transfer budget (an AI club starts each season from its dotation, whatever it left); its wage budget,
 * its payroll at the end of the season closed (payrolls, read before any player left) times its margin, at most the
 * table's at that rank (seasonFinances). An AI club's coefficient is its ranking objective's (aiCoefficient), its margin
 * WAGE_BUDGET_MARGIN; the managed club's coefficient is the one given, its season's objectives' (100 without any), and
 * its margin follows it (managedWageMargin). Returns the managed club's dotation, for its SeasonBudget.
 */
export async function applySeasonFinances(
  tx: Db,
  saveId: string,
  ends: readonly ClubSeasonEnd[],
  worldVersion: WorldVersion,
  managedCoefficient: number,
  payrolls: ReadonlyMap<string, number>,
): Promise<ManagedDotation> {
  const clubs = await tx.clubSave.findMany({
    where: { saveId },
    select: {
      id: true,
      isManaged: true,
      budget: true,
      reputation: true,
      wageBudget: true,
      competitionId: true,
      competition: { select: { tier: true } },
      club: { select: { slug: true } },
    },
  });
  const endOf = new Map(ends.map((end) => [end.clubSaveId, end]));
  const byDivision = Map.groupBy(clubs, (club) => club.competitionId);

  let managed: ManagedDotation | null = null;
  const updates: { clubSaveId: string; finances: SeasonFinances }[] = [];
  for (const division of byDivision.values()) {
    // Ranked by the new reputations; equal ones by the wage budgets of the season closed.
    const ranks = reputationRanks(
      division.map((club) => ({ key: club.id, reputation: club.reputation, wageBudget: club.wageBudget, slug: club.club.slug })),
    );
    for (const club of division) {
      const reputationRank = getOrThrow(ranks, club.id, "reputation rank");
      const coefficient = club.isManaged
        ? managedCoefficient
        : aiCoefficient(getOrThrow(endOf, club.id, "club's season end"), worldVersion);
      const finances = seasonFinances({
        reputationRank,
        clubCount: division.length,
        tier: competitionTier(club.competition.tier),
        coefficient,
        // The managed club alone carries half of its unspent budget over: an AI club never spending its own would
        // otherwise see it double.
        unspent: club.isManaged ? club.budget : 0,
        payroll: payrolls.get(club.id) ?? 0,
        wageMargin: club.isManaged ? managedWageMargin(coefficient) : WAGE_BUDGET_MARGIN,
      });
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

/** Each club's payroll, the wages of its players, by ClubSave id: what its wage budget is measured against. */
export async function payrollsOf(tx: Db, saveId: string): Promise<Map<string, number>> {
  const rows = await tx.playerSave.groupBy({
    by: ["clubSaveId"],
    where: { saveId, clubSaveId: { not: null } },
    _sum: { wage: true },
  });
  return new Map(rows.flatMap((row) => (row.clubSaveId === null ? [] : [[row.clubSaveId, row._sum.wage ?? 0] as const])));
}

/**
 * Every club's wage budget at the creation of a save, once its squads are complete (after the preseason): its payroll
 * times WAGE_BUDGET_MARGIN, at most the table's, the wage budget its creation finances gave it (wageBudgetFor). The
 * managed club's coefficient being 100 then, its margin is the AI clubs'.
 */
export async function applyCreationWageBudgets(tx: Db, saveId: string): Promise<void> {
  const clubs = await tx.clubSave.findMany({ where: { saveId }, select: { id: true, wageBudget: true } });
  const payrolls = await payrollsOf(tx, saveId);
  const updates = clubs
    .map((club) => ({
      id: club.id,
      before: club.wageBudget,
      wageBudget: wageBudgetFor(payrolls.get(club.id) ?? 0, WAGE_BUDGET_MARGIN, club.wageBudget),
    }))
    .filter((club) => club.wageBudget !== club.before);
  if (updates.length > 0) {
    await tx.$executeRaw`
      UPDATE "ClubSave" AS c
      SET "wageBudget" = v."wageBudget"
      FROM (VALUES ${Prisma.join(updates.map((club) => Prisma.sql`(${club.id}::text, ${club.wageBudget}::int)`))})
        AS v("id", "wageBudget")
      WHERE c."id" = v."id" AND c."saveId" = ${saveId}`;
  }
}

/**
 * The managed club's dotation for its first season, at the creation of a save: its creation finances as they are (its
 * budget, and its wage budget once measured against its payroll, applyCreationWageBudgets), its reputation rank in its
 * division, a coefficient of 100 and nothing carried over.
 */
export async function firstSeasonDotation(tx: Db, saveId: string): Promise<{ seasonId: string; dotation: ManagedDotation }> {
  const managed = await tx.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, competitionId: true, budget: true, wageBudget: true, reputation: true },
  });
  const rivals = await tx.clubSave.findMany({
    where: { saveId, competitionId: managed.competitionId },
    select: { id: true, reputation: true, wageBudget: true, club: { select: { slug: true } } },
  });
  const ranks = reputationRanks(
    rivals.map((club) => ({ key: club.id, reputation: club.reputation, wageBudget: club.wageBudget, slug: club.club.slug })),
  );
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
      reputationRank: getOrThrow(ranks, managed.id, "reputation rank"),
    },
  };
}

/** Writes the managed club's dotation on its league season (SeasonBudget). */
export async function recordDotation(tx: Db, saveId: string, seasonId: string, dotation: ManagedDotation): Promise<void> {
  await tx.seasonBudget.create({ data: { saveId, seasonId, ...dotation }, select: { id: true } });
}
