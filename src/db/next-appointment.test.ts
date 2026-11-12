import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The « À demain » card's reading against DATABASE_URL: a twin of the demo save (worldVersion 1) and a challenge of a
// far week of its own (deleteTestChallenges); deleted at the end. Skipped without DATABASE_URL; modules are imported
// lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the next appointment, in the database", () => {
  let db: typeof prismaClient | undefined;
  let appointments: typeof import("./next-appointment") | undefined;
  let matchday: typeof import("./matchday") | undefined;
  let support: typeof import("./test-support") | undefined;
  let saveId = "";
  let challengeStart = new Date(0);
  // Real time, not simulation code: a year of its own keeps parallel runs, and the real weeks, apart.
  const year = 2100 + (Date.now() % 800);
  const weekKey = `${year}-W30`;
  const SECRET = "test-challenge-secret-0123456789abcdef";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const loaded = () => {
    if (db === undefined || appointments === undefined || matchday === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, appointments, matchday };
  };

  beforeAll(async () => {
    const [{ prisma }, appointmentModule, matchdayModule, supportModule, challengeModule] = await Promise.all([
      import("./client"),
      import("./next-appointment"),
      import("./matchday"),
      import("./test-support"),
      import("./challenge"),
    ]);
    db = prisma;
    appointments = appointmentModule;
    matchday = matchdayModule;
    support = supportModule;
    saveId = await supportModule.createDemoTwin("Prochain rendez-vous");
    challengeStart = (await challengeModule.ensureChallenge(weekKey, SECRET)).startsAt;
  }, 120_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await support?.deleteTestChallenges([weekKey]);
    await db?.$disconnect();
  }, 120_000);

  it("before the first match: that match, the season's opening one, no word to say yet, and the week's challenge", async () => {
    const { db, appointments } = loaded();
    const now = new Date(challengeStart.getTime() + 2 * DAY_MS + 60_000);
    const appointment = await appointments.getNextAppointment(saveId, now);
    const first = await db.fixture.findFirstOrThrow({
      where: { saveId, played: false, OR: [{ homeClubSave: { isManaged: true } }, { awayClubSave: { isManaged: true } }] },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, round: true },
    });
    expect(appointment.match).toMatchObject({ scheduledAt: first.scheduledAt, round: first.round, cup: false, stake: { kind: "opening" } });
    expect(appointment.leaguePlayed).toBe(0);
    // Five days left in the week: the challenge's, an ordinary save not its own.
    expect(appointment.challenge).toMatchObject({ weekNumber: 30, daysLeft: 5, own: null });
    expect(await appointments.lastManagedResult(saveId)).toBeNull();
  });

  it("after a match: the next one, its stake read in the table, and the match played as the assistant reads it", async () => {
    const { appointments, matchday } = loaded();
    await matchday.playNextMatchday(saveId);
    const appointment = await appointments.getNextAppointment(saveId, new Date(challengeStart.getTime() + 8 * DAY_MS));
    expect(appointment.leaguePlayed).toBe(1);
    expect(appointment.match?.round).toBe(2);
    expect(["rival", "climb", "rank"]).toContain(appointment.match?.stake.kind);
    // The challenge's week is over: nothing to say of it.
    expect(appointment.challenge).toBeNull();
    const last = await appointments.lastManagedResult(saveId);
    // A league match: no extra time, no decision kept.
    expect(last).toMatchObject({ cup: false, decidedBy: null, homePenalties: null });
    expect(typeof last?.homeGoals).toBe("number");
  }, 60_000);

  it("leaves out the live match itself, still unplayed until its end", async () => {
    const { db, appointments } = loaded();
    const next = await db.fixture.findFirstOrThrow({
      where: { saveId, played: false, OR: [{ homeClubSave: { isManaged: true } }, { awayClubSave: { isManaged: true } }] },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, round: true },
    });
    const appointment = await appointments.getNextAppointment(saveId, new Date(challengeStart.getTime() + 8 * DAY_MS), next.id);
    expect(appointment.match?.round).toBe(next.round + 1);
  });
});
