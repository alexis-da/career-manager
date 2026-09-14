import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { SQUAD_TEMPLATE } from "./players";
import { buildWorldPlan, seedWorld } from "./seed";

const connectionString = process.env.DATABASE_URL;

// Runs the real seed against DATABASE_URL (the dev database); skipped when it is not set.
describe.skipIf(connectionString === undefined)("seedWorld", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function readWorld() {
    const [competitions, clubs, players] = await Promise.all([
      prisma.competition.findMany({ orderBy: { code: "asc" } }),
      prisma.club.findMany({ orderBy: { slug: "asc" } }),
      prisma.player.findMany({ orderBy: [{ initialClubId: "asc" }, { squadSlot: "asc" }] }),
    ]);
    return { competitions, clubs, players };
  }

  it("is idempotent: a second run changes nothing", async () => {
    const plan = buildWorldPlan();
    const planClubs = plan.flatMap((competition) => competition.clubs);
    const playerCount = planClubs.length * SQUAD_TEMPLATE.length;

    await seedWorld(prisma, plan);
    const afterFirstRun = await readWorld();
    const summary = await seedWorld(prisma, plan);
    const afterSecondRun = await readWorld();

    expect(afterSecondRun).toEqual(afterFirstRun);
    expect(afterSecondRun.players).toHaveLength(playerCount);
    expect(summary.players).toEqual({ created: 0, updated: 0, unchanged: playerCount });

    const rankBySlug = new Map(afterSecondRun.clubs.map((club) => [club.slug, club.initialRank]));
    for (const club of planClubs) {
      expect(rankBySlug.get(club.slug)).toBe(club.initialRank);
    }
  }, 120_000);
});
