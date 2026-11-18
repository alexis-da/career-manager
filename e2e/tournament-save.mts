/**
 * Run by e2e/tournaments.spec.ts with tsx, against the end-to-end tests' database (DATABASE_URL set by the spec): a
 * worldVersion 2 twin of the demo save (its seed, Lyon), owned by the user given, its national teams' first cycle played
 * as far as asked, the assistant managing its contracts:
 * - « played »: its first two seasons and their transitions, the second playing the Old Continent Cup 2028;
 * - « drawn »: its first season and its transition, then its second season played to its end: the qualifiers over, the
 *   tournament drawn, still to play;
 * - « qualifiers »: the same, its second season played to its November break included: the qualifiers at 7 breaks of 8.
 * Prints the save's id, then, for « played », the PlayerSave id of one of the tournament's champions of our clubs.
 * Playwright's CommonJS loader cannot import the Prisma client, hence a script of its own.
 */
import { prisma } from "../src/db/client";
import { playNextMatchday } from "../src/db/matchday";
import { createSave } from "../src/db/saves";
import { advanceToNextSeason } from "../src/db/season";
import { DEMO_CLUB_SLUG, DEMO_SEED, playRemainingMatchdays } from "../src/db/test-support";
import { breakWindows } from "../src/engine/schedule";
import { WORLD_START_YEAR } from "../src/engine/world";

const [ownerId, mode = "played"] = process.argv.slice(2);
if (ownerId === undefined || !["played", "drawn", "qualifiers"].includes(mode)) {
  throw new Error("Usage: tsx e2e/tournament-save.mts <user id> [played|drawn|qualifiers]");
}
try {
  const lyon = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id: saveId } = await createSave({
    name: "E2E tournoi d'été",
    managerName: "Test E2E",
    clubId: lyon.id,
    seed: DEMO_SEED,
    ownerId,
    worldVersion: 2,
  });
  await playRemainingMatchdays(saveId);
  await advanceToNextSeason(saveId, { assistantContracts: true });
  if (mode === "qualifiers") {
    // Up to the second season's November break, played.
    const [, tuesday] = breakWindows(WORLD_START_YEAR + 1)[2].dates;
    for (;;) {
      const { currentDate } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
      if (currentDate >= tuesday || (await playNextMatchday(saveId)) === null) {
        break;
      }
    }
  } else {
    await playRemainingMatchdays(saveId);
    if (mode === "played") {
      await advanceToNextSeason(saveId, { assistantContracts: true });
    }
  }
  console.log(saveId);
  if (mode === "played") {
    const champion = await prisma.playerSave.findFirstOrThrow({
      where: { saveId, clubSaveId: { not: null }, internationalTitles: { isEmpty: false } },
      orderBy: { overall: "desc" },
      select: { id: true },
    });
    console.log(champion.id);
  }
} finally {
  await prisma.$disconnect();
}
