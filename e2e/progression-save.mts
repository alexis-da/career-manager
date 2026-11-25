/**
 * Run by e2e/progression.spec.ts with tsx, against the end-to-end tests' database (DATABASE_URL set by the spec): a
 * worldVersion 1 twin of the demo save (its seed, Lyon), owned by the user given, its first season played and turned,
 * then six dates of its second played: every player has his rating of before the turn (PlayerSave.previousOverall), the
 * club's relevé of 2026-27 its squad with their potentials, and its players league minutes with a rhythm. Prints the
 * save's id. Playwright's CommonJS loader cannot import the Prisma client, hence a script of its own.
 */
import { prisma } from "../src/db/client";
import { playNextMatchday } from "../src/db/matchday";
import { createSave } from "../src/db/saves";
import { advanceToNextSeason } from "../src/db/season";
import { DEMO_CLUB_SLUG, DEMO_SEED, playRemainingMatchdays } from "../src/db/test-support";

/** The second season's dates played: its league under way, mid-September. */
const SECOND_SEASON_DATES = 6;

const ownerId = process.argv[2];
if (ownerId === undefined) {
  throw new Error("Usage: tsx e2e/progression-save.mts <user id>");
}
try {
  const lyon = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id: saveId } = await createSave({
    name: "E2E progression",
    managerName: "Test E2E",
    clubId: lyon.id,
    seed: DEMO_SEED,
    ownerId,
    worldVersion: 1,
  });
  await playRemainingMatchdays(saveId);
  await advanceToNextSeason(saveId);
  for (let date = 0; date < SECOND_SEASON_DATES; date++) {
    await playNextMatchday(saveId);
  }
  console.log(saveId);
} finally {
  await prisma.$disconnect();
}
