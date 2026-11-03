import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// A throwaway save with the demo seed, its first match played with a break, then deleted. Runs against DATABASE_URL and
// is skipped without it; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("managedMatchesPlayed", () => {
  let db: typeof prismaClient | undefined;
  let modules:
    | {
        managedMatchesPlayed: typeof import("./first-steps").managedMatchesPlayed;
        playNextMatchday: typeof import("./matchday").playNextMatchday;
        playLiveMatch: typeof import("./test-support").playLiveMatch;
      }
    | undefined;
  let saveId = "";

  const loaded = () => {
    if (db === undefined || modules === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, ...modules };
  };

  beforeAll(async () => {
    const [{ prisma }, support, { managedMatchesPlayed }, { playNextMatchday }] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./first-steps"),
      import("./matchday"),
    ]);
    db = prisma;
    modules = { managedMatchesPlayed, playNextMatchday, playLiveMatch: support.playLiveMatch };
    saveId = await support.createDemoTwin("Test premiers pas");
  }, 120_000);

  afterAll(async () => {
    if (saveId !== "") {
      await db?.save.delete({ where: { id: saveId } });
    }
    await db?.$disconnect();
  }, 60_000);

  it("counts the club's own matches: none at the half-time of its first, with the other clubs' already played", async () => {
    const { db, managedMatchesPlayed, playNextMatchday, playLiveMatch } = loaded();
    expect(await managedMatchesPlayed(saveId, 5)).toBe(0);

    await playNextMatchday(saveId, { pauseManagedMatch: true });
    await playLiveMatch(saveId, "break");

    expect(await db.fixture.count({ where: { saveId, played: true } })).toBeGreaterThan(0);
    expect(await managedMatchesPlayed(saveId, 5)).toBe(0);

    await playLiveMatch(saveId, "end");

    expect(await managedMatchesPlayed(saveId, 5)).toBe(1);
  }, 60_000);

  it("counts no further than its limit", async () => {
    const { managedMatchesPlayed, playNextMatchday } = loaded();

    await playNextMatchday(saveId);

    expect(await managedMatchesPlayed(saveId, 5)).toBe(2);
    expect(await managedMatchesPlayed(saveId, 1)).toBe(1);
  }, 60_000);
});
