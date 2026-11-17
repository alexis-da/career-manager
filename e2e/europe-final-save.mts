/**
 * Run by e2e/europe.spec.ts with tsx, against the end-to-end tests' database (DATABASE_URL set by the spec): a worldVersion
 * 1 twin of the demo save, owned by the user given, with a Laurel Cup final added (Lyon - Napoli on 12 August, before
 * the first matchday, on neutral ground, Lyon in a 4-3-3, Napoli in the formation it chooses). With the demo's seed and
 * its assistant's decisions, it ends 2-2 after extra time and 3-4 on penalties. Prints the save's id. Playwright's
 * CommonJS loader cannot import the Prisma client, hence a script of its own.
 */
import { prisma } from "../src/db/client";
import { createSave } from "../src/db/saves";
import { DEMO_CLUB_SLUG, DEMO_SEED } from "../src/db/test-support";

const OPPONENT_SLUG = "ssc-napoli";

const ownerId = process.argv[2];
if (ownerId === undefined) {
  throw new Error("Usage: tsx e2e/europe-final-save.mts <user id>");
}
try {
  const lyon = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id: saveId } = await createSave({ name: "E2E finale européenne", managerName: "Test E2E", clubId: lyon.id, seed: DEMO_SEED, ownerId, worldVersion: 1 });
  const [competition, managed, napoli] = await Promise.all([
    prisma.competition.findUniqueOrThrow({ where: { code: "eu.1" }, select: { id: true } }),
    prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, reputation: true } }),
    prisma.clubSave.findFirstOrThrow({ where: { saveId, club: { slug: OPPONENT_SLUG } }, select: { id: true, reputation: true } }),
  ]);
  await prisma.clubSave.update({ where: { id: managed.id }, data: { formation: "4-3-3" } });
  // Its two finalists, as the opening keeps a European season's clubs (src/db/europe.ts).
  const season = await prisma.season.create({
    data: {
      saveId,
      competitionId: competition.id,
      startYear: 2026,
      entrants: [
        { club: DEMO_CLUB_SLUG, country: "fr", pot: 1, path: "RANK", tier: 1, rank: 1, reputation: managed.reputation },
        { club: OPPONENT_SLUG, country: "it", pot: 2, path: "RANK", tier: 1, rank: 1, reputation: napoli.reputation },
      ],
    },
    select: { id: true },
  });
  await prisma.fixture.create({
    data: { saveId, seasonId: season.id, round: 10, scheduledAt: new Date("2026-08-12T00:00:00.000Z"), homeClubSaveId: managed.id, awayClubSaveId: napoli.id },
  });
  console.log(saveId);
} finally {
  await prisma.$disconnect();
}
