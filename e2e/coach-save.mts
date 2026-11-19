/**
 * Run by e2e/national-coach.spec.ts with tsx, against the end-to-end tests' database (DATABASE_URL set by the spec): a
 * worldVersion 2 twin of the demo save (its seed, Lyon), owned by the user given, at the start of its first season:
 * - « offer »: the federation of Portugal offers its post (an offer of the season, as a transition makes them);
 * - « coach »: its player coaches Portugal, the save played up to its first match at stake, the qualifier of the
 *   first break (4 September), left for him: the dashboard leads there, his assistant's list ready.
 * Prints the save's id. Playwright's CommonJS loader cannot import the Prisma client, hence a script of its own.
 */
import { prisma } from "../src/db/client";
import { playNextMatchday } from "../src/db/matchday";
import { acceptCoachOffer } from "../src/db/national-coach";
import { createSave } from "../src/db/saves";
import { DEMO_CLUB_SLUG, DEMO_SEED } from "../src/db/test-support";
import { WORLD_START_YEAR } from "../src/engine/world";

const NATION = "POR";
const [ownerId, mode = "offer"] = process.argv.slice(2);
if (ownerId === undefined || !["offer", "coach"].includes(mode)) {
  throw new Error("Usage: tsx e2e/coach-save.mts <user id> [offer|coach]");
}
try {
  const lyon = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id: saveId } = await createSave({
    name: "E2E sélectionneur",
    managerName: "Test E2E",
    clubId: lyon.id,
    seed: DEMO_SEED,
    ownerId,
    worldVersion: 2,
  });
  await prisma.nationSave.updateMany({ where: { saveId, code: NATION }, data: { offeredIn: WORLD_START_YEAR } });
  if (mode === "coach") {
    await acceptCoachOffer(saveId, NATION);
    for (;;) {
      const step = await playNextMatchday(saveId, { untilNationalStop: true });
      if (step === null || step.national?.stopNext === true) {
        break;
      }
    }
  }
  console.log(saveId);
} finally {
  await prisma.$disconnect();
}
