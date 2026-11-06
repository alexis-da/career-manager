import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";
import type { SaveHeader } from "./header";

// The header's season state, read by the managed club's id and from the save's date: its next match, and whether every
// fixture of the seasons in progress is played (the season over, the way on to the next). On a throwaway worldVersion 1
// twin of the demo save, whose fixtures the test marks played in SQL, as many as each case needs (a 1-1 each: the header
// reads whether they are played, not their scores). Runs against DATABASE_URL and is skipped without it; modules are
// imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the header's next match and season state", () => {
  let db: typeof prismaClient | undefined;
  let saveId = "";
  let managedId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  const header = async (): Promise<SaveHeader> => {
    const { getSaveHeader } = await import("./header");
    const read = await getSaveHeader(saveId);
    if (read === null) {
      throw new Error("No header");
    }
    return read;
  };

  /** Every fixture of the save played, 1-1, but those kept, still to play. */
  const playAllBut = async (kept: string[]): Promise<void> => {
    await database().fixture.updateMany({
      where: { saveId, id: { notIn: kept } },
      data: { played: true, status: "PLAYED", homeGoals: 1, awayGoals: 1 },
    });
    await database().fixture.updateMany({
      where: { saveId, id: { in: kept } },
      data: { played: false, status: "SCHEDULED", homeGoals: null, awayGoals: null },
    });
  };

  beforeAll(async () => {
    const [{ prisma }, { createDemoTwin }] = await Promise.all([import("./client"), import("./test-support")]);
    db = prisma;
    saveId = await createDemoTwin("Test en-tête", 1);
    managedId = (await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } })).id;
  }, 120_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.$disconnect();
  }, 120_000);

  it("shows the managed club's next match and the season under way, then nothing once every fixture is played", async () => {
    const fixtures = await database().fixture.findMany({
      where: { saveId },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      select: { id: true, round: true, scheduledAt: true, homeClubSaveId: true, awayClubSaveId: true },
    });
    const ofManaged = (fixture: (typeof fixtures)[number]): boolean =>
      fixture.homeClubSaveId === managedId || fixture.awayClubSaveId === managedId;
    const managedFixtures = fixtures.filter(ofManaged);
    const first = managedFixtures.at(0);
    const last = managedFixtures.at(-1);
    // Another club's fixture of the last matchday, the managed club's own played.
    const other = fixtures.findLast((fixture) => !ofManaged(fixture));
    if (first === undefined || last === undefined || other === undefined) {
      throw new Error("The demo twin has no fixtures");
    }

    // At the creation: its first match is next.
    expect(await header()).toMatchObject({
      nextStage: { round: first.round, cup: false },
      nextMatch: { date: first.scheduledAt },
      seasonFinished: false,
    });

    // Everything played but its last match: that one is next.
    await playAllBut([last.id]);
    expect(await header()).toMatchObject({ nextStage: { round: last.round, cup: false }, seasonFinished: false });

    // Its season over, another club's match still to play: no next match, and the season goes on.
    await playAllBut([other.id]);
    expect(await header()).toMatchObject({ nextStage: null, nextMatch: null, seasonFinished: false });

    // Every fixture played: the season is over.
    await playAllBut([]);
    expect(await header()).toMatchObject({ nextStage: null, nextMatch: null, seasonFinished: true });
  });
});
