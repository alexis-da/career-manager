/**
 * Run by e2e/objectives.spec.ts with tsx, against the end-to-end tests' database (DATABASE_URL set by the spec): a
 * worldVersion 1 twin of the demo save (its seed, Lyon), owned by the user given, its whole first season played, the
 * assistant choosing its objective at the first kick-off, so that it waits at the end of its season for « Passer à la
 * saison suivante ». Prints the save's id. Playwright's CommonJS loader cannot import the Prisma client, hence a script of
 * its own.
 */
import { prisma } from "../src/db/client";
import { createSave } from "../src/db/saves";
import { DEMO_CLUB_SLUG, DEMO_SEED, playRemainingMatchdays } from "../src/db/test-support";

const ownerId = process.argv[2];
if (ownerId === undefined) {
  throw new Error("Usage: tsx e2e/season-end-save.mts <user id>");
}
try {
  const lyon = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id: saveId } = await createSave({
    name: "E2E fin de saison",
    managerName: "Test E2E",
    clubId: lyon.id,
    seed: DEMO_SEED,
    ownerId,
    worldVersion: 1,
  });
  await playRemainingMatchdays(saveId);
  console.log(saveId);
} finally {
  await prisma.$disconnect();
}
