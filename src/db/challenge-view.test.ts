import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_CHALLENGE_SAVES_PER_WEEK } from "../config/challenge";
import type { prisma as prismaClient } from "./client";

// The page /challenge, against DATABASE_URL: two weeks of a far year of their own and throwaway users with entries
// written by hand (no save but bare ones: only scores and accounts matter here), deleted at the end with what they hold
// (deleteTestChallenges). Skipped without DATABASE_URL; modules are imported lazily because the client throws without
// it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the page of the weekly challenge, in the database", () => {
  let db: typeof prismaClient | undefined;
  let view: typeof import("./challenge-view") | undefined;
  let challenges: typeof import("./challenge") | undefined;
  let support: typeof import("./test-support") | undefined;
  // Real time, not simulation code: a year of its own keeps parallel runs, and the real weeks, apart.
  const run = `${Date.now()}`;
  const year = 2100 + (Number(run) % 800);
  const weekKey = `${year}-W21`;
  const previousKey = `${year}-W20`;
  const SECRET = "test-challenge-secret-0123456789abcdef";
  const user = (name: string) => `test-view-${run}-${name}`;
  const users = {
    ada: { id: user("ada"), kind: "REGISTERED", name: "Ada Lovelace" },
    grace: { id: user("grace"), kind: "REGISTERED", name: "Grace Hopper" },
    nameless: { id: user("nameless"), kind: "REGISTERED", name: null },
    late: { id: user("late"), kind: "REGISTERED", name: "Late Comer" },
    playing: { id: user("playing"), kind: "REGISTERED", name: "Still Playing" },
    viewer: { id: user("viewer"), kind: "ANONYMOUS", name: null },
    other: { id: user("other"), kind: "ANONYMOUS", name: null },
  } as const;
  let challenge: Awaited<ReturnType<typeof import("./challenge").ensureChallenge>> | undefined;

  const loaded = () => {
    if (db === undefined || view === undefined || challenges === undefined || support === undefined || challenge === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, view, challenges, support, challenge };
  };

  beforeAll(async () => {
    const [{ prisma }, viewModule, challengeModule, supportModule] = await Promise.all([
      import("./client"),
      import("./challenge-view"),
      import("./challenge"),
      import("./test-support"),
    ]);
    db = prisma;
    view = viewModule;
    challenges = challengeModule;
    support = supportModule;
    const [previous, current] = await Promise.all([
      challengeModule.ensureChallenge(previousKey, SECRET),
      challengeModule.ensureChallenge(weekKey, SECRET),
    ]);
    challenge = current;
    // Not simulation code: lastSeenAt is real time.
    await prisma.user.createMany({ data: Object.values(users).map(({ id, kind, name }) => ({ id, kind, name, lastSeenAt: new Date() })) });
    const at = (hours: number) => new Date(current.startsAt.getTime() + hours * 3_600_000);
    const entry = (userId: string, points: number, goalDiff: number, goalsFor: number, submittedAt: Date | null) => ({
      challengeId: current.id,
      userId,
      matchdaysPlayed: submittedAt === null ? 4 : 10,
      ...(submittedAt === null ? {} : { points, goalDiff, goalsFor, submittedAt }),
    });
    await prisma.challengeEntry.createMany({
      data: [
        entry(users.ada.id, 20, 5, 15, at(1)),
        entry(users.grace.id, 15, 2, 10, at(2)),
        entry(users.nameless.id, 15, 2, 10, at(3)),
        entry(users.late.id, 30, 9, 20, new Date(current.endsAt.getTime() + 3_600_000)),
        entry(users.playing.id, 0, 0, 0, null),
        entry(users.viewer.id, 18, 3, 12, at(4)),
        entry(users.other.id, 25, 6, 16, at(5)),
        { challengeId: previous.id, userId: users.grace.id, matchdaysPlayed: 10, points: 12, goalDiff: 1, goalsFor: 9, submittedAt: new Date(previous.startsAt.getTime() + 3_600_000) },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await support?.deleteTestChallenges([weekKey, previousKey]);
    await db?.user.deleteMany({ where: { id: { in: Object.values(users).map(({ id }) => id) } } });
    await db?.$disconnect();
  }, 60_000);

  const lines = (rows: { rank: number | null; name: string; points: number; isViewer: boolean }[]) =>
    rows.map(({ rank, name, points, isViewer }) => `${rank ?? "—"} ${name} ${points}${isViewer ? " *" : ""}`);

  it("ranks the Google accounts' entries submitted in time, by first name, and last week's", async () => {
    const { view, challenge } = loaded();

    const page = await view.getChallengePage(challenge, null);

    expect(lines(page.ranking)).toEqual(["1 Ada 20", "2 Grace 15", "3 Anonyme 15"]);
    expect(page).toMatchObject({ weekKey, weekNumber: 21, horizon: 10, full: false, own: null });
    expect(page.club.name).not.toBe("");
    expect(page.club.competitionName).toMatch(/Division [12]$/);
    expect(page.savesPurgedAt).toEqual(new Date(challenge.endsAt.getTime() + 24 * 3_600_000));
    expect(page.previous === null ? null : { weekNumber: page.previous.weekNumber, lines: lines(page.previous.ranking) }).toEqual({
      weekNumber: 20,
      lines: ["1 Grace 12"],
    });
  });

  it("shows an anonymous player their own entry where it would stand, without a rank; a Google account its own line", async () => {
    const { view, challenge } = loaded();

    const anonymous = await view.getChallengePage(challenge, { id: users.viewer.id, kind: "ANONYMOUS" });
    const grace = await view.getChallengePage(challenge, { id: users.grace.id, kind: "REGISTERED" });

    expect(lines(anonymous.ranking)).toEqual(["1 Ada 20", "— Toi 18 *", "2 Grace 15", "3 Anonyme 15"]);
    expect(anonymous.own).toEqual({ saveId: null, matchdaysPlayed: 10, submitted: true });
    expect(lines(grace.ranking)).toEqual(["1 Ada 20", "2 Grace 15 *", "3 Anonyme 15"]);
    expect((await view.getChallengePage(challenge, { id: users.playing.id, kind: "REGISTERED" })).own).toEqual({
      saveId: null,
      matchdaysPlayed: 4,
      submitted: false,
    });
  });

  it("is full once the week has its saves", async () => {
    const { db, view, challenge } = loaded();
    await db.save.createMany({
      data: Array.from({ length: MAX_CHALLENGE_SAVES_PER_WEEK }, () => ({
        name: "Test défi complet",
        managerName: "Test",
        seed: `test-view-${run}`,
        worldVersion: 2,
        currentDate: new Date("2026-07-01T00:00:00.000Z"),
        ownerId: users.nameless.id,
        challengeId: challenge.id,
      })),
    });

    expect((await view.getChallengePage(challenge, null)).full).toBe(true);
  });
});
