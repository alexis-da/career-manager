import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIN_GOALKEEPERS, SQUAD_SIZE_MAX, SQUAD_SIZE_MIN } from "../engine/balance";
import { WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";
import type { PreseasonSummary } from "./preseason";

type SquadRow = { isManaged: boolean; players: number; goalkeepers: number };

// Checks the second preseason of the demo save, against DATABASE_URL. Skipped without it. The demo save is created
// on the first run when missing (a whole season to play, hence the long hook timeout) and kept for later runs.
// Modules are imported lazily because the client throws without DATABASE_URL.
describe.skipIf(process.env.DATABASE_URL === undefined)("runPreseason on the demo save", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let secondRun: PreseasonSummary | undefined;

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

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

  afterAll(async () => {
    await db?.$disconnect();
  });

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
