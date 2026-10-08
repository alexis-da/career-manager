import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FREE_AGENT_POOL_OVERALL_MIN,
  FREE_AGENT_POOL_TOP_OVERALL_MAX,
  SQUAD_SIZE_MAX,
  YOUTH_PLAYERS_PER_CLUB,
} from "../engine/balance";
import { WORLD_START_YEAR } from "../engine/world";
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
    const [{ prisma }, { createSave }, { ensureDemoUser }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./test-support"),
    ]);
    db = prisma;

    referenceCountsBefore = await countReferenceTables();
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: "liverpool-fc" }, select: { id: true } });
    const ownerId = await ensureDemoUser();
    for (const seed of ["test-seed-1", "test-seed-1", "test-seed-2"]) {
      const save = await createSave({ name: `Test ${seed}`, managerName: "Test", clubId, seed, ownerId });
      saveIds.push(save.id);
    }
    referenceCountsAfter = await countReferenceTables();
  }, 300_000);

  // Deleting three saves cascades to about 12 000 rows: allow more than the 10 s hook default.
  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: { in: saveIds } } });
    await db?.$disconnect();
  }, 120_000);

  const playerSavesOf = (saveId: string) =>
    database().playerSave.findMany({
      where: { saveId },
      orderBy: { playerKey: "asc" },
      select: {
        playerKey: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        nationality: true,
        position: true,
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

  it("creates the whole initial state of a save, young players included", async () => {
    const [saveId] = saveIds;
    const db = database();
    const [save, clubSaves, managed, playerSaves, youthPlayers, seasons, fixtures, clubsByCompetition] =
      await Promise.all([
        db.save.findUniqueOrThrow({ where: { id: saveId } }),
        db.clubSave.count({ where: { saveId } }),
        db.clubSave.findMany({ where: { saveId, isManaged: true }, select: { club: { select: { slug: true } } } }),
        db.playerSave.count({ where: { saveId } }),
        db.playerSave.count({ where: { saveId, playerId: null, playerKey: { startsWith: `youth:${WORLD_START_YEAR}:` } } }),
        db.season.findMany({ where: { saveId }, select: { startYear: true } }),
        db.fixture.count({ where: { saveId } }),
        db.club.groupBy({ by: ["competitionId"], _count: { _all: true } }),
      ]);
    const [competitionCount, clubCount, playerCount] = referenceCountsAfter;

    // A new save starts on 1 July of the game's first season, 2026-27.
    expect(save.currentDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(clubSaves).toBe(clubCount);
    expect(managed.map((clubSave) => clubSave.club.slug)).toEqual(["liverpool-fc"]);
    expect(youthPlayers).toBe(clubCount * YOUTH_PLAYERS_PER_CLUB);
    expect(playerSaves).toBe(playerCount + youthPlayers);
    expect(seasons).toHaveLength(competitionCount);
    expect(seasons.every((season) => season.startYear === WORLD_START_YEAR)).toBe(true);
    expect(fixtures).toBe(
      clubsByCompetition.reduce((sum, group) => sum + group._count._all * (group._count._all - 1), 0),
    );
  });

  it("copies each world player's identity and key from Player, the free agent pool included", async () => {
    const [saveId] = saveIds;
    const [row] = await database().$queryRaw<{ mismatches: number; copied: number }[]>`
      SELECT count(*)::int AS copied,
        count(*) FILTER (WHERE ps."firstName" <> p."firstName" OR ps."lastName" <> p."lastName"
          OR ps."birthDate" <> p."birthDate" OR ps.nationality <> p.nationality OR ps.position <> p.position
          OR ps."playerKey" <> coalesce(c.slug, 'free-agents') || '#' || p."squadSlot")::int AS mismatches
      FROM "PlayerSave" ps
      JOIN "Player" p ON p.id = ps."playerId"
      LEFT JOIN "Club" c ON c.id = p."initialClubId"
      WHERE ps."saveId" = ${saveId}`;
    const [, , playerCount] = referenceCountsAfter;

    expect(row.copied).toBe(playerCount);
    expect(row.mismatches).toBe(0);
  });

  it("puts 100 to 120 free agents on the market, 8 goalkeepers or more, none signed by the full AI squads", async () => {
    const [saveId] = saveIds;
    const db = database();
    const [freeAgents, signings, squadSizes] = await Promise.all([
      db.playerSave.findMany({
        where: { saveId, clubSaveId: null, transfers: { none: { saveId, type: "RETIREMENT" } } },
        select: { playerKey: true, position: true, overall: true, potential: true, wage: true, contractUntil: true },
      }),
      db.transfer.count({ where: { saveId, type: "FREE", toClubId: { not: null } } }),
      db.playerSave.groupBy({ by: ["clubSaveId"], where: { saveId, clubSaveId: { not: null } }, _count: { _all: true } }),
    ]);

    expect(freeAgents.length).toBeGreaterThanOrEqual(100);
    expect(freeAgents.length).toBeLessThanOrEqual(120);
    expect(freeAgents.filter((player) => player.position === "GK").length).toBeGreaterThanOrEqual(8);
    for (const player of freeAgents) {
      expect(player.playerKey).toMatch(/^free-agents#\d+$/);
      expect(player.overall).toBeGreaterThanOrEqual(FREE_AGENT_POOL_OVERALL_MIN);
      expect(player.overall).toBeLessThanOrEqual(FREE_AGENT_POOL_TOP_OVERALL_MAX);
      expect(player.potential).toBeGreaterThanOrEqual(player.overall);
      expect(player.contractUntil).toBeNull();
    }
    expect(signings).toBe(0);
    expect(squadSizes.every((squad) => squad._count._all === SQUAD_SIZE_MAX)).toBe(true);
  });

  it("gives the same players, attributes and fixtures to two saves with the same seed", async () => {
    const [first, second] = saveIds;

    expect(await playerSavesOf(second)).toEqual(await playerSavesOf(first));
    expect(await fixturesOf(second)).toEqual(await fixturesOf(first));
  });

  it("gives different attributes to a save with a different seed", async () => {
    const [first, , other] = saveIds;
    const [firstPlayers, otherPlayers] = await Promise.all([playerSavesOf(first), playerSavesOf(other)]);
    const otherByKey = new Map(otherPlayers.map((player) => [player.playerKey, player]));
    const worldPlayers = firstPlayers.filter((player) => !player.playerKey.startsWith("youth:"));
    const differing = worldPlayers.filter((player) => {
      const counterpart = otherByKey.get(player.playerKey);
      return counterpart !== undefined && counterpart.overall !== player.overall;
    });

    expect(otherPlayers).toHaveLength(firstPlayers.length);
    expect(differing.length).toBeGreaterThan(worldPlayers.length * 0.7);
  });

  it("leaves the reference tables untouched", () => {
    expect(referenceCountsAfter).toEqual(referenceCountsBefore);
  });
});
