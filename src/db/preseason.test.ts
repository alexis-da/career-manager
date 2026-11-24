import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIN_GOALKEEPERS, SQUAD_LIMIT, SQUAD_SIZE_MAX, SQUAD_SIZE_MIN, YOUTH_PLAYERS_PER_CLUB } from "../engine/balance";
import { marketValueFor, signingBonus } from "../engine/economy";
import { seasonStartDate, WORLD_START_YEAR } from "../engine/world";
import { youthKeyPrefix } from "../engine/youth";
import { ageInYears } from "../lib/dates";
import type { prisma as prismaClient } from "./client";
import type { PreseasonSummary } from "./preseason";

type SquadRow = { isManaged: boolean; players: number; goalkeepers: number };

let db: typeof prismaClient | undefined;

const database = (): typeof prismaClient => {
  if (db === undefined) {
    throw new Error("Database client not initialised");
  }
  return db;
};

// One client for both blocks, closed once they are done.
afterAll(async () => {
  await db?.$disconnect();
});

// Checks the second preseason of the demo save, against DATABASE_URL. Skipped without it. The demo save is created
// on the first run when missing (a whole season to play, hence the long hook timeout) and kept for later runs.
// Modules are imported lazily because the client throws without DATABASE_URL.
describe.skipIf(process.env.DATABASE_URL === undefined)("runPreseason on the demo save", () => {
  let saveId = "";
  let secondRun: PreseasonSummary | undefined;

  beforeAll(async () => {
    const [{ prisma }, { runPreseason }, { ensureDemoSave }] = await Promise.all([
      import("./client"),
      import("./preseason"),
      import("./test-support"),
    ]);
    db = prisma;
    saveId = await ensureDemoSave();

    // The season transition already ran this preseason: both calls must find it done.
    await runPreseason(saveId);
    secondRun = await runPreseason(saveId);
  }, 900_000);

  const squads = () => database().$queryRaw<SquadRow[]>`
    SELECT cs."isManaged" AS "isManaged", count(ps.id)::int AS players,
      count(ps.id) FILTER (WHERE ps.position = 'GK')::int AS goalkeepers
    FROM "ClubSave" cs
    LEFT JOIN "PlayerSave" ps ON ps."clubSaveId" = cs.id AND ps."saveId" = ${saveId}
    WHERE cs."saveId" = ${saveId}
    GROUP BY cs.id, cs."isManaged"`;

  it("gives every AI club 20 to 25 players, including at least 2 goalkeepers", async () => {
    const aiSquads = (await squads()).filter((squad) => !squad.isManaged);

    expect(aiSquads).toHaveLength(95);
    expect(aiSquads.filter((squad) => squad.players < SQUAD_SIZE_MIN || squad.players > SQUAD_SIZE_MAX)).toEqual([]);
    expect(aiSquads.filter((squad) => squad.goalkeepers < MIN_GOALKEEPERS)).toEqual([]);
  });

  it("leaves fewer than 5 % of the players rated above 65 without a club", async () => {
    const [row] = await database().$queryRaw<{ rated: number; free: number }[]>`
      SELECT count(*)::int AS rated, count(*) FILTER (WHERE ps."clubSaveId" IS NULL)::int AS free
      FROM "PlayerSave" ps
      WHERE ps."saveId" = ${saveId} AND ps.overall > 65
        AND NOT EXISTS (SELECT 1 FROM "Transfer" t WHERE t."saveId" = ${saveId} AND t."playerSaveId" = ps.id AND t.type = 'RETIREMENT')`;

    expect(row.rated).toBeGreaterThan(0);
    expect(row.free / row.rated).toBeLessThan(0.05);
  });

  it("gives every signed or renewed player a running contract", async () => {
    const [row] = await database().$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "PlayerSave" ps JOIN "Save" s ON s.id = ps."saveId"
      WHERE ps."saveId" = ${saveId} AND ps."clubSaveId" IS NOT NULL
        AND (ps."contractUntil" IS NULL OR ps."contractUntil" < s."currentDate" OR ps.wage <= 0)`;

    expect(row.count).toBe(0);
  });

  it("runs once per season: a second call changes nothing", () => {
    expect(secondRun?.skipped).toBe(true);
    expect(secondRun?.startYear).toBe(WORLD_START_YEAR + 1);
  });
});

// The money rules of the simplification (docs/design/simplification.md § 1.4 and § 1.5), against DATABASE_URL, on two
// twins of the demo save moved, unplayed, to the next season's first day: contracts ending on 30 June expire, the free
// agents of the initial pool rated 65 or less leave the world, and the clubs plan their squads with their budgets.
// Skipped without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a preseason under the simplification's money rules", () => {
  const NEXT_START = seasonStartDate(WORLD_START_YEAR + 1);
  const saveIds: string[] = [];
  let modules: { preseason: typeof import("./preseason"); transfers: typeof import("./transfers") } | undefined;

  const loaded = () => {
    if (modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return modules;
  };

  beforeAll(async () => {
    const [{ prisma }, preseason, transfers, support] = await Promise.all([
      import("./client"),
      import("./preseason"),
      import("./transfers"),
      import("./test-support"),
    ]);
    db = prisma;
    modules = { preseason, transfers };
    for (const name of ["Présaison A", "Présaison B"]) {
      const id = await support.createDemoTwin(name);
      await prisma.save.update({ where: { id }, data: { currentDate: NEXT_START } });
      saveIds.push(id);
    }
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: { in: saveIds } } });
  }, 120_000);

  /** Every club of a save: its row, its Club.id, its slug and its budget. */
  const clubsOf = (saveId: string) =>
    database().clubSave.findMany({
      where: { saveId },
      select: { id: true, clubId: true, isManaged: true, budget: true, reputation: true, club: { select: { slug: true } } },
    });

  const squadSizeOf = (saveId: string, clubSaveId: string) =>
    database().playerSave.count({ where: { saveId, clubSaveId, retired: false } });

  /**
   * Fills a club up to `size` players with free agents moved in as they are, the lowest rated first: those the preseason
   * would send out of the world, the market keeping its best.
   */
  const fillTo = async (saveId: string, clubSaveId: string, size: number): Promise<void> => {
    const missing = size - (await squadSizeOf(saveId, clubSaveId));
    const fillers = await database().playerSave.findMany({
      where: loaded().transfers.freeAgentWhere(saveId),
      orderBy: [{ overall: "asc" }, { playerKey: "asc" }],
      take: missing,
      select: { id: true },
    });
    expect(fillers).toHaveLength(missing);
    await database().playerSave.updateMany({ where: { saveId, id: { in: fillers.map(({ id }) => id) } }, data: { clubSaveId } });
  };

  /** The free signings of the preseason's date, each with what his bonus should be on that day. */
  const signingsOf = async (saveId: string) => {
    const rows = await database().transfer.findMany({
      where: { saveId, type: "FREE", date: NEXT_START, fromClubId: null, toClubId: { not: null } },
      select: { fee: true, toClubId: true, playerSave: { select: { birthDate: true, overall: true, potential: true } } },
    });
    return rows.map(({ fee, toClubId, playerSave: { birthDate, overall, potential } }) => ({
      fee,
      toClubId,
      bonus: signingBonus(marketValueFor({ age: ageInYears(birthDate, NEXT_START), overall, potential })),
    }));
  };

  it("gives each club its young players up to 30, and has the AI clubs pay their signings' bonuses", async () => {
    const [saveId] = saveIds;
    const clubs = await clubsOf(saveId);
    const managed = clubs.find((club) => club.isManaged);
    // The least reputed AI club, at 30 players: no place left for a young player.
    const crowded = clubs.filter((club) => !club.isManaged).sort((a, b) => a.reputation - b.reputation || (a.id < b.id ? -1 : 1))[0];
    if (managed === undefined || crowded === undefined) {
      throw new Error("No managed club, or no AI club");
    }
    // The managed club at 29: one place left.
    await fillTo(saveId, managed.id, SQUAD_LIMIT - 1);
    await fillTo(saveId, crowded.id, SQUAD_LIMIT);

    const summary = await loaded().preseason.runPreseason(saveId);

    // The young players of the day by the club they joined, from their key (« youth:2027:slug:n »): an AI club above
    // 25 players may release one at once, and another sign him.
    const prefix = youthKeyPrefix(WORLD_START_YEAR + 1);
    const youths = await database().playerSave.findMany({ where: { saveId, playerKey: { startsWith: prefix } }, select: { playerKey: true } });
    const youthsOf = new Map<string, number>();
    for (const { playerKey } of youths) {
      const slug = playerKey.slice(prefix.length, playerKey.lastIndexOf(":"));
      youthsOf.set(slug, (youthsOf.get(slug) ?? 0) + 1);
    }
    expect(youthsOf.get(managed.club.slug)).toBe(1);
    expect(youthsOf.get(crowded.club.slug)).toBeUndefined();
    expect(clubs.filter((club) => club !== managed && club !== crowded).filter((club) => youthsOf.get(club.club.slug) !== YOUTH_PLAYERS_PER_CLUB)).toEqual([]);
    expect(summary.youthPlayers).toBe(YOUTH_PLAYERS_PER_CLUB * (clubs.length - 2) + 1);
    // The managed club does not plan its squad: 29 and its young player.
    expect(await squadSizeOf(saveId, managed.id)).toBe(SQUAD_LIMIT);

    // Every free signing of the day has its bonus for fee, a quarter of the player's value then, at least 50 000 €.
    const signings = await signingsOf(saveId);
    expect(signings.length).toBeGreaterThan(0);
    expect(signings).toHaveLength(summary.signings);
    expect(signings.filter(({ fee, bonus }) => fee !== bonus)).toEqual([]);
    expect(signings.every(({ fee }) => fee >= 50_000)).toBe(true);
    expect(summary.bonuses).toBe(signings.reduce((sum, { fee }) => sum + fee, 0));
    expect(signings.some(({ toClubId }) => toClubId === managed.clubId)).toBe(false);

    // Each club's budget is its own less the bonuses it paid; the managed club's untouched. No AI club sells to another.
    const paid = new Map<string, number>();
    for (const { toClubId, fee } of signings) {
      paid.set(toClubId ?? "", (paid.get(toClubId ?? "") ?? 0) + fee);
    }
    const after = new Map((await clubsOf(saveId)).map((club) => [club.id, club.budget]));
    for (const club of clubs) {
      expect(after.get(club.id), club.clubId).toBe(club.budget - (paid.get(club.clubId) ?? 0));
    }
    expect(await database().transfer.count({ where: { saveId, type: "TRANSFER", date: NEXT_START } })).toBe(0);
  }, 120_000);

  it("has the managed club pay its own signings' bonuses when the assistant plans its squad", async () => {
    const [, saveId] = saveIds;
    const clubs = await clubsOf(saveId);
    const managed = clubs.find((club) => club.isManaged);
    if (managed === undefined) {
      throw new Error("No managed club");
    }
    // Eight of its players gone for good, a known budget: it signs to fill its roles, paying each bonus.
    const gone = await database().playerSave.findMany({
      where: { saveId, clubSaveId: managed.id },
      orderBy: [{ overall: "desc" }, { playerKey: "asc" }],
      take: 8,
      select: { id: true },
    });
    await database().playerSave.updateMany({ where: { saveId, id: { in: gone.map(({ id }) => id) } }, data: { clubSaveId: null, retired: true } });
    const budget = 100_000_000;
    await database().clubSave.update({ where: { id: managed.id, saveId }, data: { budget } });
    const before = await squadSizeOf(saveId, managed.id);
    expect(before).toBeLessThan(SQUAD_SIZE_MIN - YOUTH_PLAYERS_PER_CLUB);

    const summary = await database().$transaction(
      (tx) => loaded().preseason.runPreseasonInTransaction(tx, saveId, { assistantContracts: true }),
      { timeout: 120_000 },
    );

    const own = (await signingsOf(saveId)).filter(({ toClubId }) => toClubId === managed.clubId);
    const moves = summary.managed;
    if (moves === undefined) {
      throw new Error("The managed club did not plan its squad");
    }
    expect(own.length).toBeGreaterThan(0);
    expect(own).toHaveLength(moves.signings);
    expect(own.filter(({ fee, bonus }) => fee !== bonus)).toEqual([]);
    const { budget: after } = await database().clubSave.findUniqueOrThrow({ where: { id: managed.id }, select: { budget: true } });
    expect(after).toBe(budget - own.reduce((sum, { fee }) => sum + fee, 0));
    expect(await squadSizeOf(saveId, managed.id)).toBe(before + YOUTH_PLAYERS_PER_CLUB + moves.signings - moves.releases);
  }, 120_000);
});
