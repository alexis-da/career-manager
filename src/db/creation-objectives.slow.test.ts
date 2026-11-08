import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The ranking objective each club's card announces on the creation form (listClubsByCompetition, what suggestClubs
// shows) is the one a real save created with that club gets for its first season: a worldVersion 2 save for each of the
// 198 clubs, with the game's cups and one seed, a few at a time, each deleted (with its throwaway owner) once read. The
// regular suite checks the same on one save, the creation's objective steps run for each club
// (creation-objectives.test.ts). Runs against DATABASE_URL and is skipped without it.

/** Saves created at once: each creation is a transaction of its own, on a connection of its own. */
const CONCURRENCY = 4;
const SEED = "cartes-du-choix-du-club";

describe.skipIf(process.env.DATABASE_URL === undefined)("a save created with each of the 198 clubs", () => {
  let db: typeof prismaClient | undefined;

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("gets for its first season the ranking objective its card announced", async () => {
    const [{ prisma }, { createSave }, { listClubsByCompetition }, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./clubs"),
      import("./test-support"),
    ]);
    db = prisma;
    const cards = (await listClubsByCompetition(2)).flatMap((competition) => competition.clubs);
    expect(cards).toHaveLength(198);

    const differing: string[] = [];
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < cards.length) {
        const card = cards[next++];
        const ownerId = await createTestOwner();
        try {
          const { id: saveId } = await createSave({
            name: "Test objectif de la carte",
            managerName: "Test",
            clubId: card.id,
            seed: SEED,
            ownerId,
            worldVersion: 2,
          });
          const season = await prisma.seasonObjective.findFirstOrThrow({
            where: { saveId, kind: "RANKING" },
            select: { variant: true, target: true, exceed: true },
          });
          const announced = { variant: card.objective.variant, target: card.objective.target, exceed: card.objective.exceed };
          if (JSON.stringify(announced) !== JSON.stringify(season)) {
            differing.push(`${card.name}: card ${JSON.stringify(announced)}, season ${JSON.stringify(season)}`);
          }
        } finally {
          // The owner's save goes with it.
          await prisma.user.delete({ where: { id: ownerId } });
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    expect(differing).toEqual([]);
  }, 40 * 60_000);
});
