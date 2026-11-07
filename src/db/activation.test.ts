import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// A player's first steps, against DATABASE_URL: two twins of the demo save (worldVersion 1), each with a throwaway owner
// of its own, one played simulated, the other live; deleted at the end, their owners by the tests' teardown. A season
// played to its end is src/db/season.slow.test.ts's. Skipped without DATABASE_URL; modules are imported lazily because
// the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("a player's first steps, in the database", () => {
  let db: typeof prismaClient | undefined;
  let activation: typeof import("./activation") | undefined;
  let support: typeof import("./test-support") | undefined;
  let matchday: typeof import("./matchday") | undefined;
  const saveIds: string[] = [];
  // Matchdays and a live match played while the other files run: more than the default 5 s.
  const PLAYING_MS = 60_000;

  const loaded = () => {
    if (db === undefined || activation === undefined || support === undefined || matchday === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, activation, support, matchday };
  };
  const ownerOf = async (saveId: string) => (await loaded().db.save.findUniqueOrThrow({ where: { id: saveId } })).ownerId ?? "";
  const stepsOf = async (saveId: string) =>
    loaded().db.user.findUniqueOrThrow({
      where: { id: await ownerOf(saveId) },
      select: { firstSaveAt: true, firstMatchAt: true, firstSeasonEndAt: true },
    });

  beforeAll(async () => {
    const [{ prisma }, activationModule, supportModule, matchdayModule] = await Promise.all([
      import("./client"),
      import("./activation"),
      import("./test-support"),
      import("./matchday"),
    ]);
    db = prisma;
    activation = activationModule;
    support = supportModule;
    matchday = matchdayModule;
    saveIds.push(await supportModule.createDemoTwin("Premiers pas simulés"), await supportModule.createDemoTwin("Premiers pas en direct"));
  }, 120_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: { in: saveIds } } });
    await db?.$disconnect();
  }, 120_000);

  it("dates the first career at its creation, once: a later one changes nothing", async () => {
    const { db, activation } = loaded();
    const [saveId] = saveIds;
    const created = await stepsOf(saveId);
    expect(created.firstSaveAt).toBeInstanceOf(Date);
    expect(created).toMatchObject({ firstMatchAt: null, firstSeasonEndAt: null });

    await activation.recordFirstSave(db, await ownerOf(saveId));

    expect((await stepsOf(saveId)).firstSaveAt).toEqual(created.firstSaveAt);
  });

  it("dates the first match once the managed club has played one, simulated, then keeps it", async () => {
    const { matchday } = loaded();
    const [saveId] = saveIds;

    expect((await matchday.playNextMatchday(saveId))?.managed?.live).toBe(false);
    const first = (await stepsOf(saveId)).firstMatchAt;
    expect(first).toBeInstanceOf(Date);
    await matchday.playNextMatchday(saveId);

    expect((await stepsOf(saveId)).firstMatchAt).toEqual(first);
    expect((await stepsOf(saveId)).firstSeasonEndAt).toBeNull();
  }, PLAYING_MS);

  it("dates a live first match at its end, never at its kick-off", async () => {
    const { matchday, support } = loaded();
    const [, saveId] = saveIds;

    expect((await matchday.playNextMatchday(saveId, { pauseManagedMatch: true }))?.managed?.live).toBe(true);
    expect((await stepsOf(saveId)).firstMatchAt).toBeNull();
    await support.playLiveMatch(saveId, "end");

    expect((await stepsOf(saveId)).firstMatchAt).toBeInstanceOf(Date);
  }, PLAYING_MS);

  it("dates the season's end once no fixture of the save is left to play, not before", async () => {
    const { db, activation } = loaded();
    const [saveId] = saveIds;

    await activation.recordFirstSeasonEnd(db, saveId);
    expect((await stepsOf(saveId)).firstSeasonEndAt).toBeNull();
    // As the season's last date would leave it, played whole.
    await db.fixture.updateMany({ where: { saveId, played: false }, data: { played: true } });
    await activation.recordFirstSeasonEnd(db, saveId);

    const { firstMatchAt, firstSeasonEndAt } = await stepsOf(saveId);
    expect(firstSeasonEndAt).toBeInstanceOf(Date);
    expect(firstSeasonEndAt?.getTime()).toBeGreaterThanOrEqual(firstMatchAt?.getTime() ?? Infinity);
  }, PLAYING_MS);
});
