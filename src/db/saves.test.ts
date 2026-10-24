import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FREE_AGENT_POOL_OVERALL_MIN,
  FREE_AGENT_POOL_TOP_OVERALL_MAX,
  SQUAD_SIZE_MAX,
  YOUTH_PLAYERS_PER_CLUB,
} from "../engine/balance";
import { CUPS_ENABLED } from "../engine/cup";
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

  /** Competitions, clubs and players (free agent pool included) of a world's tiers in the reference tables. */
  const countWorld = (tiers: number[]) =>
    Promise.all([
      database().competition.count({ where: { tier: { in: tiers } } }),
      database().club.count({ where: { competition: { tier: { in: tiers } } } }),
      database().player.count({
        where: { OR: [{ initialClubId: null }, { initialClub: { competition: { tier: { in: tiers } } } }] },
      }),
    ]);

  beforeAll(async () => {
    const [{ prisma }, { createSave }, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./test-support"),
    ]);
    db = prisma;

    referenceCountsBefore = await countReferenceTables();
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: "liverpool-fc" }, select: { id: true } });
    for (const seed of ["test-seed-1", "test-seed-1", "test-seed-2"]) {
      const save = await createSave({
        name: `Test ${seed}`,
        managerName: "Test",
        clubId,
        seed,
        ownerId: await createTestOwner(),
        worldVersion: 1,
      });
      saveIds.push(save.id);
    }
    // The fourth: the same seed as the first, in the world with the second divisions.
    const v2 = await createSave({
      name: "Test v2",
      managerName: "Test",
      clubId,
      seed: "test-seed-1",
      ownerId: await createTestOwner(),
      worldVersion: 2,
    });
    saveIds.push(v2.id);
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
        db.club.groupBy({ by: ["competitionId"], where: { competition: { tier: 1 } }, _count: { _all: true } }),
      ]);
    // A worldVersion 1 save, the first divisions only.
    const [competitionCount, clubCount, playerCount] = await countWorld([1]);

    expect(save.worldVersion).toBe(1);
    expect([competitionCount, clubCount]).toEqual([5, 96]);

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
    const [, , playerCount] = await countWorld([1]);

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

  it("creates a worldVersion 2 save with both divisions, each club in its world competition, all ending the same day", async () => {
    const [, , , saveId] = saveIds;
    const db = database();
    const [save, clubSaves, seasons, fixtures, misplaced] = await Promise.all([
      db.save.findUniqueOrThrow({ where: { id: saveId }, select: { worldVersion: true } }),
      db.clubSave.count({ where: { saveId } }),
      db.season.findMany({ where: { saveId, competition: { kind: "LEAGUE" } }, select: { competition: { select: { tier: true } } } }),
      db.fixture.groupBy({
        by: ["seasonId"],
        where: { saveId, season: { competition: { kind: "LEAGUE" } } },
        _count: { _all: true },
        _max: { scheduledAt: true },
      }),
      db.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "ClubSave" cs JOIN "Club" c ON c.id = cs."clubId"
        WHERE cs."saveId" = ${saveId} AND cs."competitionId" <> c."competitionId"`,
    ]);
    const [competitionCount, clubCount] = await countWorld([1, 2]);

    expect(save.worldVersion).toBe(2);
    expect([competitionCount, clubCount]).toEqual([10, 198]);
    expect(clubSaves).toBe(clubCount);
    expect(seasons.map((season) => season.competition.tier).sort()).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    // 20 clubs: 380 matches; 24 clubs: 552; the ten competitions, 3 758.
    expect(fixtures.reduce((sum, season) => sum + season._count._all, 0)).toBe(3758);
    expect(new Set(fixtures.map((season) => season._max.scheduledAt?.toISOString())).size).toBe(1);
    expect(misplaced[0].count).toBe(0);
  });

  it("gives a worldVersion 2 save no cup while the game has none (CUPS_ENABLED false), nor a worldVersion 1 save", async () => {
    const [firstSaveId, , , v2SaveId] = saveIds;
    const db = database();
    const [cupSeasons, cupTies] = await Promise.all([
      db.season.count({ where: { saveId: { in: [firstSaveId, v2SaveId] }, competition: { kind: "CUP" } } }),
      db.fixture.count({ where: { saveId: { in: [firstSaveId, v2SaveId] }, season: { competition: { kind: "CUP" } } } }),
    ]);

    // The worldVersion 2 save was created as the game creates one, without the cups option. The cups' opening at
    // creation, asked for by a test, is checked by season-v2.slow.test.ts.
    expect(CUPS_ENABLED).toBe(false);
    expect([cupSeasons, cupTies]).toEqual([0, 0]);
  });

  it("gives the first division players of a worldVersion 2 save the attributes of a worldVersion 1 save of the same seed", async () => {
    const [firstSaveId, , , v2SaveId] = saveIds;
    const firstDivision = async (saveId: string) =>
      (await playerSavesOf(saveId)).filter((player) => !player.playerKey.startsWith("youth:") && !player.playerKey.startsWith("free-agents#"));
    const v1Players = await firstDivision(firstSaveId);
    const v1Keys = new Set(v1Players.map((player) => player.playerKey));
    const v2Players = (await firstDivision(v2SaveId)).filter((player) => v1Keys.has(player.playerKey));
    // The club a player is at may differ once the AI clubs have signed: compare the player, not his club.
    const withoutClub = (players: Awaited<ReturnType<typeof firstDivision>>) =>
      players.map((player) => ({ ...player, clubSave: undefined }));

    expect(v1Players).toHaveLength(2208);
    expect(withoutClub(v2Players)).toEqual(withoutClub(v1Players));
  });

  it("refuses a second division club in a worldVersion 1 save", async () => {
    const [{ createSave }, { createTestOwner }] = await Promise.all([import("./saves"), import("./test-support")]);
    const { id: clubId } = await database().club.findUniqueOrThrow({ where: { slug: "leeds-united-fc" }, select: { id: true } });

    await expect(
      createSave({ name: "Test v1 D2", managerName: "Test", clubId, seed: "test-seed-1", ownerId: await createTestOwner(), worldVersion: 1 }),
    ).rejects.toThrow(/Unknown club in world 1/);
  });

  it("leaves the reference tables untouched", () => {
    expect(referenceCountsAfter).toEqual(referenceCountsBefore);
  });
});
