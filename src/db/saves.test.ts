import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// Runs against DATABASE_URL (the dev database); skipped when it is not set. The modules are imported
// lazily because the client throws without a connection string.
describe.skipIf(process.env.DATABASE_URL === undefined)("createSave", () => {
  let db: typeof prismaClient | undefined;
  const saveIds: string[] = [];
  let referenceCountsBefore: number[] = [];
  let referenceCountsAfter: number[] = [];

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  const countReferenceTables = () =>
    Promise.all([database().competition.count(), database().club.count(), database().player.count()]);

  beforeAll(async () => {
    const [{ prisma }, { createSave }] = await Promise.all([import("./client"), import("./saves")]);
    db = prisma;

    referenceCountsBefore = await countReferenceTables();
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: "liverpool-fc" }, select: { id: true } });
    for (const seed of ["test-seed-1", "test-seed-1", "test-seed-2"]) {
      const save = await createSave({ name: `Test ${seed}`, managerName: "Test", clubId, seed });
      saveIds.push(save.id);
    }
    referenceCountsAfter = await countReferenceTables();
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: { in: saveIds } } });
    await db?.$disconnect();
  });

  const playerSavesOf = (saveId: string) =>
    database().playerSave.findMany({
      where: { saveId },
      orderBy: { playerId: "asc" },
      select: {
        playerId: true,
        clubSave: { select: { clubId: true } },
        overall: true,
        potential: true,
        pace: true,
        shooting: true,
        passing: true,
        dribbling: true,
        defending: true,
        physical: true,
        goalkeeping: true,
        marketValue: true,
        wage: true,
        contractUntil: true,
      },
    });

  const fixturesOf = async (saveId: string) => {
    const fixtures = await database().fixture.findMany({
      where: { saveId },
      select: {
        round: true,
        scheduledAt: true,
        season: { select: { competitionId: true } },
        homeClubSave: { select: { clubId: true } },
        awayClubSave: { select: { clubId: true } },
      },
    });
    return fixtures
      .map(
        (fixture) =>
          `${fixture.season.competitionId} ${fixture.round} ${fixture.scheduledAt.toISOString()} ` +
          `${fixture.homeClubSave.clubId} > ${fixture.awayClubSave.clubId}`,
      )
      .sort();
  };

  it("creates the whole initial state of a save", async () => {
    const [saveId] = saveIds;
    const db = database();
    const [save, clubSaves, managed, playerSaves, seasons, fixtures, clubsByCompetition] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: saveId } }),
      db.clubSave.count({ where: { saveId } }),
      db.clubSave.findMany({ where: { saveId, isManaged: true }, select: { club: { select: { slug: true } } } }),
      db.playerSave.count({ where: { saveId } }),
      db.season.findMany({ where: { saveId }, select: { startYear: true } }),
      db.fixture.count({ where: { saveId } }),
      db.club.groupBy({ by: ["competitionId"], _count: { _all: true } }),
    ]);
    const [competitionCount, clubCount, playerCount] = referenceCountsAfter;

    expect(save.currentDate.toISOString()).toBe("2024-07-01T00:00:00.000Z");
    expect(clubSaves).toBe(clubCount);
    expect(managed.map((clubSave) => clubSave.club.slug)).toEqual(["liverpool-fc"]);
    expect(playerSaves).toBe(playerCount);
    expect(seasons).toHaveLength(competitionCount);
    expect(seasons.every((season) => season.startYear === 2024)).toBe(true);
    expect(fixtures).toBe(
      clubsByCompetition.reduce((sum, group) => sum + group._count._all * (group._count._all - 1), 0),
    );
  });

  it("gives the same attributes and fixtures to two saves with the same seed", async () => {
    const [first, second] = saveIds;

    expect(await playerSavesOf(second)).toEqual(await playerSavesOf(first));
    expect(await fixturesOf(second)).toEqual(await fixturesOf(first));
  });

  it("gives different attributes to a save with a different seed", async () => {
    const [first, , other] = saveIds;
    const [firstPlayers, otherPlayers] = await Promise.all([playerSavesOf(first), playerSavesOf(other)]);
    const differing = firstPlayers.filter((player, index) => {
      const { playerId, clubSave, ...attributes } = player;
      const { playerId: otherPlayerId, clubSave: otherClubSave, ...otherAttributes } = otherPlayers[index];
      return (
        playerId === otherPlayerId &&
        clubSave?.clubId === otherClubSave?.clubId &&
        JSON.stringify(attributes) !== JSON.stringify(otherAttributes)
      );
    });

    expect(otherPlayers).toHaveLength(firstPlayers.length);
    expect(differing.length).toBeGreaterThan(firstPlayers.length * 0.9);
  });

  it("leaves the reference tables untouched", () => {
    expect(referenceCountsAfter).toEqual(referenceCountsBefore);
  });
});
