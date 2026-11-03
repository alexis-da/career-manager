/**
 * Run by e2e/cup.spec.ts with tsx, against the end-to-end tests' database (DATABASE_URL set by the spec): a worldVersion
 * 1 twin of the demo save, owned by the user given, with a cup final added (Auxerre - Lyon on 12 August, before the
 * first matchday). With the demo's seed, it ends 2-2 after extra time and 5-6 on penalties (src/db/cup.test.ts).
 * Prints the save's id. Playwright's CommonJS loader cannot import the Prisma client, hence a script of its own.
 */
import { prisma } from "../src/db/client";
import { createSave } from "../src/db/saves";
import { DEMO_CLUB_SLUG, DEMO_SEED } from "../src/db/test-support";

const ownerId = process.argv[2];
if (ownerId === undefined) {
  throw new Error("Usage: tsx e2e/cup-final-save.mts <user id>");
}
try {
  const lyon = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id: saveId } = await createSave({ name: "E2E finale de coupe", managerName: "Test E2E", clubId: lyon.id, seed: DEMO_SEED, ownerId, worldVersion: 1 });
  const [cup, managed, auxerre] = await Promise.all([
    prisma.competition.findUniqueOrThrow({ where: { code: "fr.cup" }, select: { id: true } }),
    prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }),
    prisma.clubSave.findFirstOrThrow({ where: { saveId, club: { slug: "aj-auxerre" } }, select: { id: true } }),
  ]);
  const season = await prisma.season.create({ data: { saveId, competitionId: cup.id, startYear: 2026 }, select: { id: true } });
  await prisma.fixture.create({
    data: { saveId, seasonId: season.id, round: 6, scheduledAt: new Date("2026-08-12T00:00:00.000Z"), homeClubSaveId: auxerre.id, awayClubSaveId: managed.id },
  });
  console.log(saveId);
} finally {
  await prisma.$disconnect();
}
