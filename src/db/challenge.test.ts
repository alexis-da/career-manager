import "dotenv/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CHALLENGE_HORIZON_MATCHDAYS } from "../config/challenge";
import { drawChallengeClub, isChallengeClub, type ChallengeClubCandidate } from "../engine/challenge";
import { challengeSeed } from "../lib/challenge-seed";
import { isoWeekBounds, isoWeekKey } from "../lib/iso-week";
import type { prisma as prismaClient } from "./client";

// The week's challenge, against DATABASE_URL: weeks of a far year of their own, deleted at the end with what they hold
// (deleteTestChallenges). The endpoint creates the real week's challenge, as the Monday workflow would, and leaves it:
// the game never deletes a challenge. Skipped without DATABASE_URL; modules are imported lazily because the client
// throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the week's challenge, in the database", () => {
  let db: typeof prismaClient | undefined;
  let challenges: typeof import("./challenge") | undefined;
  let support: typeof import("./test-support") | undefined;
  let route: typeof import("@/app/api/maintenance/challenge/route") | undefined;
  let candidates: ChallengeClubCandidate[] = [];
  // Real time, not simulation code: a year of its own keeps parallel runs, and the real weeks, apart.
  const year = 2100 + (Date.now() % 800);
  const week = (number: number) => `${year}-W${String(number).padStart(2, "0")}`;
  const weekKeys = [1, 2, 10, 11].map(week);
  const SECRET = "test-challenge-secret-0123456789abcdef";
  const MAINTENANCE_SECRET = "test-maintenance-secret-0123456789";
  const maintenanceSecretBefore = process.env.MAINTENANCE_SECRET;

  const loaded = () => {
    if (db === undefined || challenges === undefined || support === undefined || route === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, challenges, support, route };
  };

  const call = (authorization: string | null) => {
    const headers = authorization === null ? undefined : { authorization };
    return loaded().route.POST(new Request("http://localhost/api/maintenance/challenge", { method: "POST", headers }));
  };

  beforeAll(async () => {
    const [{ prisma }, challengeModule, supportModule, routeModule] = await Promise.all([
      import("./client"),
      import("./challenge"),
      import("./test-support"),
      import("@/app/api/maintenance/challenge/route"),
    ]);
    db = prisma;
    challenges = challengeModule;
    support = supportModule;
    route = routeModule;
    const clubs = await prisma.club.findMany({
      where: { competition: { kind: "LEAGUE" } },
      select: { slug: true, initialRank: true, competition: { select: { tier: true } } },
    });
    candidates = clubs.flatMap(({ slug, initialRank, competition }) =>
      competition === null ? [] : [{ slug, tier: competition.tier, rank: initialRank }],
    );
  });

  afterEach(() => {
    if (maintenanceSecretBefore === undefined) {
      delete process.env.MAINTENANCE_SECRET;
    } else {
      process.env.MAINTENANCE_SECRET = maintenanceSecretBefore;
    }
  });

  afterAll(async () => {
    await support?.deleteTestChallenges(weekKeys);
    await db?.$disconnect();
  }, 60_000);

  const slugOf = async (clubId: string) =>
    (await loaded().db.club.findUniqueOrThrow({ where: { id: clubId }, select: { slug: true } })).slug;

  it("draws among the 137 clubs a challenge may give: the second divisions, and the 12th to 18th of the first", () => {
    expect(candidates.filter(isChallengeClub)).toHaveLength(137);
  });

  it("creates a week's challenge once: its bounds, its horizon, its seed from the secret, a club it may give", async () => {
    const { db, challenges } = loaded();

    const first = await challenges.ensureChallenge(week(1), SECRET);
    const again = await challenges.ensureChallenge(week(1), "another-secret-0123456789abcdefghij");

    expect(first.created).toBe(true);
    expect(again).toEqual({ ...first, created: false });
    expect(first).toMatchObject({ weekKey: week(1), horizonMatchdays: CHALLENGE_HORIZON_MATCHDAYS, ...isoWeekBounds(week(1)) });
    const stored = await db.challenge.findUniqueOrThrow({ where: { weekKey: week(1) }, select: { seed: true } });
    expect(stored.seed).toBe(challengeSeed(SECRET, week(1)));
    const slug = await slugOf(first.clubId);
    expect(slug).toBe(drawChallengeClub(candidates, null, stored.seed));
    expect(candidates.find((club) => club.slug === slug)).toSatisfy(
      (club: ChallengeClubCandidate | undefined) => club !== undefined && isChallengeClub(club),
    );
  });

  it("writes one row when several calls create the week at once", async () => {
    const { db, challenges } = loaded();

    const results = await Promise.all(Array.from({ length: 5 }, () => challenges.ensureChallenge(week(2), SECRET)));

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(await db.challenge.count({ where: { weekKey: week(2) } })).toBe(1);
  });

  it("never gives the previous week's club again", async () => {
    const { challenges } = loaded();
    // A secret whose seeds would draw the same club two weeks running, but for the rule.
    const secret = Array.from({ length: 5_000 }, (_, index) => `test-secret-${index}-0123456789abcdefghij`).find(
      (candidate) =>
        drawChallengeClub(candidates, null, challengeSeed(candidate, week(10))) ===
        drawChallengeClub(candidates, null, challengeSeed(candidate, week(11))),
    );
    if (secret === undefined) {
      throw new Error("No secret draws the same club two weeks running");
    }

    const before = await challenges.ensureChallenge(week(10), secret);
    const after = await challenges.ensureChallenge(week(11), secret);

    const previousSlug = await slugOf(before.clubId);
    expect(previousSlug).toBe(drawChallengeClub(candidates, null, challengeSeed(secret, week(11))));
    expect(await slugOf(after.clubId)).not.toBe(previousSlug);
    expect(await slugOf(after.clubId)).toBe(drawChallengeClub(candidates, previousSlug, challengeSeed(secret, week(11))));
  });

  it("answers 404 without MAINTENANCE_SECRET, and with a missing or wrong header", async () => {
    delete process.env.MAINTENANCE_SECRET;
    expect((await call(`Bearer ${MAINTENANCE_SECRET}`)).status).toBe(404);

    process.env.MAINTENANCE_SECRET = MAINTENANCE_SECRET;
    expect((await call(null)).status).toBe(404);
    expect((await call("Bearer wrong-secret")).status).toBe(404);
  });

  it("ensures the real week's challenge, answering neither its seed nor its club", async () => {
    process.env.MAINTENANCE_SECRET = MAINTENANCE_SECRET;

    const response = await call(`Bearer ${MAINTENANCE_SECRET}`);
    const again = await call(`Bearer ${MAINTENANCE_SECRET}`);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    // Not simulation code: the endpoint answers the real week, which may just have turned.
    expect(body).toMatchObject({ weekKey: isoWeekKey(new Date()), created: expect.any(Boolean), horizonMatchdays: CHALLENGE_HORIZON_MATCHDAYS });
    expect(Object.keys(body as object).sort()).toEqual(["created", "endsAt", "horizonMatchdays", "startsAt", "weekKey"]);
    expect(await again.json()).toMatchObject({ created: false });
  });
});
