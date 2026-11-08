import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RankingObjective } from "../engine/objectives";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// The ranking objective each club's card announces on the creation form (listClubsByCompetition, what suggestClubs
// shows) is the one a save's first season with that club gets. For each of the 198 clubs of a worldVersion 2 world, on
// one throwaway save, the creation's steps that set the managed club's dotation and objectives (firstSeasonDotation,
// recordDotation, openSeasonObjectives) run with that club as the managed one, in a transaction rolled back. A real save
// for each club is the slow test's (creation-objectives.slow.test.ts). Runs against DATABASE_URL and is skipped without
// it; modules are imported lazily because the client throws without it.

/** Thrown to roll a transaction back once it has been read. */
class RolledBack extends Error {}

const objectiveOf = ({ variant, target, exceed }: { variant: string | null; target: number; exceed: number | null }) => ({
  variant,
  target,
  exceed,
});

describe.skipIf(process.env.DATABASE_URL === undefined)("the objective a club's card announces", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  beforeAll(async () => {
    const [{ prisma }, support] = await Promise.all([import("./client"), import("./test-support")]);
    db = prisma;
    saveId = await support.createDemoTwin("Test objectifs des cartes", 2);
  }, 120_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 120_000);

  /** The ranking objective the save's creation sets when the club is the managed one, read and rolled back. */
  async function firstSeasonRanking(clubSaveId: string): Promise<RankingObjective> {
    const [{ firstSeasonDotation, recordDotation }, { openSeasonObjectives }] = await Promise.all([
      import("./season-finances"),
      import("./objectives"),
    ]);
    let ranking: RankingObjective | undefined;
    try {
      await database().$transaction(async (tx) => {
        await tx.seasonObjective.deleteMany({ where: { saveId } });
        await tx.seasonBudget.deleteMany({ where: { saveId } });
        await tx.clubSave.updateMany({ where: { saveId, isManaged: true }, data: { isManaged: false } });
        await tx.clubSave.updateMany({ where: { saveId, id: clubSaveId }, data: { isManaged: true } });
        const first = await firstSeasonDotation(tx, saveId);
        await recordDotation(tx, saveId, first.seasonId, first.dotation);
        await openSeasonObjectives(tx, saveId, { id: first.seasonId, startYear: WORLD_START_YEAR });
        const row = await tx.seasonObjective.findFirstOrThrow({
          where: { saveId, kind: "RANKING" },
          select: { variant: true, target: true, exceed: true },
        });
        ranking = objectiveOf(row) as RankingObjective;
        throw new RolledBack();
      });
    } catch (error) {
      if (!(error instanceof RolledBack)) {
        throw error;
      }
    }
    if (ranking === undefined) {
      throw new Error("No ranking objective read");
    }
    return ranking;
  }

  it("is the one its first season gets, for each of the 198 clubs", async () => {
    const { listClubsByCompetition } = await import("./clubs");
    const cards = (await listClubsByCompetition(2)).flatMap((competition) => competition.clubs);
    const clubSaves = new Map(
      (await database().clubSave.findMany({ where: { saveId }, select: { id: true, clubId: true } })).map((club) => [club.clubId, club.id]),
    );
    expect(cards).toHaveLength(198);
    expect(clubSaves.size).toBe(198);

    const differing: string[] = [];
    for (const card of cards) {
      const clubSaveId = clubSaves.get(card.id);
      if (clubSaveId === undefined) {
        throw new Error(`No club of the save for ${card.name}`);
      }
      const season = await firstSeasonRanking(clubSaveId);
      if (JSON.stringify(objectiveOf(card.objective)) !== JSON.stringify(season)) {
        differing.push(`${card.name}: card ${JSON.stringify(card.objective)}, season ${JSON.stringify(season)}`);
      }
    }
    expect(differing).toEqual([]);

    // The save itself is untouched: its managed club and its objectives are its creation's.
    const managed = await database().clubSave.findMany({ where: { saveId, isManaged: true }, select: { clubId: true } });
    expect(managed).toHaveLength(1);
    expect(await database().seasonObjective.count({ where: { saveId, kind: "RANKING" } })).toBe(1);
  }, 180_000);
});
