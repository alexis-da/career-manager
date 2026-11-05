import type { MoveReason } from "../engine/promotion";
import { reputationAfterSeason, reputationRanks } from "../engine/reputation";
import type { CompetitionTier } from "../engine/tiers";
import { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import type { FinalTables, SeasonMove } from "./promotion";

type Db = Prisma.TransactionClient;

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
