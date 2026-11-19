import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// The first career's tutorial in the database (docs/design/tutoriel.md, src/db/tutorial.ts), against DATABASE_URL: users
// of its own (deleted at the end, their saves and tutorials with them), bare saves for the rules of the rows, and one
// career created as the game creates it. Skipped without DATABASE_URL; modules are imported lazily because the client
// throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the first career's tutorial, in the database", () => {
  let db: typeof prismaClient | undefined;
  let tutorials: typeof import("./tutorial") | undefined;
  let rules: typeof import("../lib/tutorial") | undefined;
  let saves: typeof import("./saves") | undefined;
  const userIds: string[] = [];
  const NOW = new Date();

  const loaded = () => {
    if (db === undefined || tutorials === undefined || rules === undefined || saves === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, tutorials, rules, saves };
  };

  /** A user of this file's: new (no career yet) unless told otherwise. */
  const user = async (data: { kind?: "ANONYMOUS" | "REGISTERED"; firstSaveAt?: Date; createdAt?: Date; firstLiveMatchAt?: Date } = {}) => {
    const { id } = await loaded().db.user.create({
      data: { id: `tutorial-test-${randomUUID()}`, kind: data.kind ?? "ANONYMOUS", lastSeenAt: NOW, ...data },
      select: { id: true },
    });
    userIds.push(id);
    return id;
  };

  /** A bare save of a user's: its row alone, enough for a tutorial to follow it. */
  const bareSave = async (ownerId: string) => {
    const { id } = await loaded().db.save.create({
      data: { ownerId, name: "Tutoriel", managerName: "Coach", seed: "tutorial", worldVersion: 1, currentDate: NOW },
      select: { id: true },
    });
    return id;
  };

  const start = (userId: string, saveId: string) => loaded().db.$transaction((tx) => loaded().tutorials.startTutorial(tx, userId, saveId));
  const read = (userId: string, saveId: string) => loaded().tutorials.readTutorial(loaded().db, userId, saveId);
  const record = (userId: string, saveId: string, events: import("../lib/tutorial").TutorialEvent[], matchesPlayed = 0, away = false) =>
    loaded().tutorials.recordTutorialEvents(loaded().db, { userId, saveId, events, now: new Date(), matchesPlayed, away });
  const row = (userId: string) => loaded().db.tutorial.findUnique({ where: { userId } });

  beforeAll(async () => {
    const [{ prisma }, tutorialModule, rulesModule, savesModule] = await Promise.all([
      import("./client"),
      import("./tutorial"),
      import("../lib/tutorial"),
      import("./saves"),
    ]);
    db = prisma;
    tutorials = tutorialModule;
    rules = rulesModule;
    saves = savesModule;
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: userIds } } });
    await db?.$disconnect();
  }, 60_000);

  it("begins with a new player's first career, as the game creates it, inside its transaction", async () => {
    const { db, saves } = loaded();
    const ownerId = await user();
    const club = await db.club.findUniqueOrThrow({ where: { slug: "olympique-lyonnais" }, select: { id: true } });
    const { id } = await saves.createSave({ name: "Tutoriel", managerName: "Coach", clubId: club.id, seed: "tutorial", ownerId, worldVersion: 1, tutorial: true });
    const created = await read(ownerId, id);
    expect(created).toMatchObject({ version: loaded().rules.TUTORIAL_VERSION, day1At: null, endedBy: null, steps: {} });
    // The first step was written after it: the same player's next careers are an old player's.
    expect((await db.user.findUniqueOrThrow({ where: { id: ownerId } })).firstSaveAt).not.toBeNull();
  }, 60_000);

  it("is never a test's, a script's nor the demo's: createSave alone does not ask for it", async () => {
    const { db, saves } = loaded();
    const ownerId = await user();
    const club = await db.club.findUniqueOrThrow({ where: { slug: "olympique-lyonnais" }, select: { id: true } });
    await saves.createSave({ name: "Sans tutoriel", managerName: "Coach", clubId: club.id, seed: "tutorial", ownerId, worldVersion: 1 });
    expect(await row(ownerId)).toBeNull();
  }, 60_000);

  it("is only a new player's first career: never an old player's, nor beside another career", async () => {
    const newcomer = await user();
    await start(newcomer, await bareSave(newcomer));
    expect(await row(newcomer)).not.toBeNull();

    // An old player, whose first career was before the tutorial: nothing, even after deleting it.
    const old = await user({ firstSaveAt: new Date("2026-10-01T00:00:00Z"), createdAt: new Date("2026-10-01T00:00:00Z") });
    await start(old, await bareSave(old));
    expect(await row(old)).toBeNull();

    // A new player come by the challenge: their first career has it.
    const challenger = await user({ firstSaveAt: NOW, createdAt: NOW });
    await start(challenger, await bareSave(challenger));
    expect(await row(challenger)).not.toBeNull();

    // An account with a career already: its next one has none.
    const account = await user({ kind: "REGISTERED" });
    await bareSave(account);
    await start(account, await bareSave(account));
    expect(await row(account)).toBeNull();
  });

  it("closes the live steps of a player who has already played a match live", async () => {
    const owner = await user({ firstLiveMatchAt: NOW });
    const saveId = await bareSave(owner);
    await start(owner, saveId);
    const progress = await read(owner, saveId);
    expect(progress?.steps).toEqual({
      speed: { shows: 0, outcome: "ADAPTED" },
      choice: { shows: 0, outcome: "ADAPTED" },
      "half-time": { shows: 0, outcome: "ADAPTED" },
    });
  });

  it("follows the player's next career when theirs is deleted before its end, never once over", async () => {
    const { db } = loaded();
    const owner = await user({ kind: "REGISTERED" });
    const first = await bareSave(owner);
    await start(owner, first);
    await db.save.delete({ where: { id: first } });
    expect((await row(owner))?.saveId).toBeNull();
    const next = await bareSave(owner);
    await start(owner, next);
    expect((await row(owner))?.saveId).toBe(next);

    // Over: the career after it has none.
    await db.tutorial.update({ where: { userId: owner }, data: { endedBy: "FINISHED", endedAt: NOW } });
    await db.save.delete({ where: { id: next } });
    await start(owner, await bareSave(owner));
    expect((await row(owner))?.saveId).toBeNull();
  });

  it("is read only by the save it follows", async () => {
    const owner = await user({ kind: "REGISTERED" });
    const followed = await bareSave(owner);
    await start(owner, followed);
    const other = await bareSave(owner);
    expect(await read(owner, followed)).not.toBeNull();
    expect(await read(owner, other)).toBeNull();
    expect(await loaded().tutorials.readTutorial(loaded().db, null, followed)).toBeNull();
  });

  it("counts a step's shows while it is open, keeps its first outcome, and dates the first day at its « À demain »", async () => {
    const owner = await user();
    const saveId = await bareSave(owner);
    await start(owner, saveId);
    await record(owner, saveId, [{ step: "welcome", event: "show" }]);
    await record(owner, saveId, [{ step: "welcome", event: "show" }]);
    await record(owner, saveId, [{ step: "welcome", event: "done" }]);
    await record(owner, saveId, [{ step: "welcome", event: "pass" }, { step: "welcome", event: "show" }]);
    const step = await loaded().db.tutorialStep.findUniqueOrThrow({ where: { userId_step: { userId: owner, step: "welcome" } } });
    expect(step).toMatchObject({ shows: 2, outcome: "DONE" });
    expect(step.shownAt).not.toBeNull();

    await record(owner, saveId, [{ step: "full-time", event: "show" }], 1);
    expect((await row(owner))?.day1At).not.toBeNull();
  });

  it("closes by itself what is due, and finishes once every step is closed", async () => {
    const owner = await user();
    const saveId = await bareSave(owner);
    await start(owner, saveId);
    await record(owner, saveId, [{ step: "welcome", event: "show" }]);
    // The first match simulated: the welcome made another way, written with the next event.
    await record(owner, saveId, [{ step: "full-time", event: "show" }], 1);
    expect((await read(owner, saveId))?.steps.welcome).toEqual({ shows: 1, outcome: "ADAPTED" });
    for (const step of ["speed", "choice", "half-time"] as const) {
      await record(owner, saveId, [{ step, event: "adapt" }], 1);
    }
    expect((await row(owner))?.endedBy).toBeNull();
    // The « À demain » seen, left without its links: adapted on the dashboard, and the tutorial over.
    await record(owner, saveId, [], 1, true);
    expect(await row(owner)).toMatchObject({ endedBy: "FINISHED" });
    expect((await read(owner, saveId))?.steps["full-time"]).toEqual({ shows: 1, outcome: "ADAPTED" });
  });

  it("is passed for good, then taken up again with what can still come, nothing hidden again", async () => {
    const { tutorials, db } = loaded();
    const owner = await user();
    const saveId = await bareSave(owner);
    await start(owner, saveId);
    await record(owner, saveId, [{ step: "welcome", event: "pass" }]);
    expect(await tutorials.skipTutorial(db, owner, saveId, "speed")).toBe(true);
    expect(await row(owner)).toMatchObject({ endedBy: "SKIPPED", skippedStep: "speed" });
    // Over: its events change nothing.
    await record(owner, saveId, [{ step: "speed", event: "show" }]);
    expect((await read(owner, saveId))?.steps.speed).toBeUndefined();

    expect(await tutorials.resumeTutorial(db, owner, saveId, { now: new Date(), matchesPlayed: 0 })).toBe(true);
    const resumed = await row(owner);
    expect(resumed).toMatchObject({ endedBy: null, endedAt: null, skippedStep: "speed" });
    expect(resumed?.resumedAt).not.toBeNull();
    expect(resumed?.skippedAt).not.toBeNull();
    expect((await read(owner, saveId))?.steps.welcome).toEqual({ shows: 0, outcome: null });

    // Passed again once the first day is over, all its steps closed: nothing left to take up.
    for (const step of loaded().rules.DAY_ONE_STEPS) {
      await record(owner, saveId, [{ step, event: "pass" }], 1);
    }
    await db.tutorial.update({ where: { userId: owner }, data: { endedBy: "SKIPPED", endedAt: NOW, day1At: NOW } });
    expect(await tutorials.resumeTutorial(db, owner, saveId, { now: new Date(), matchesPlayed: 1 })).toBe(false);
  });

  it("follows a player into their Google account, over when the account had a career of its own", async () => {
    const { tutorials, db } = loaded();
    const move = (from: string, to: string) => db.$transaction((tx) => tutorials.moveTutorial(tx, from, to));

    // A new account: the anonymous player's tutorial follows, its steps with it.
    const anonymous = await user();
    const career = await bareSave(anonymous);
    await start(anonymous, career);
    await record(anonymous, career, [{ step: "welcome", event: "show" }]);
    const account = await user({ kind: "REGISTERED" });
    await db.save.updateMany({ where: { ownerId: anonymous }, data: { ownerId: account } });
    await move(anonymous, account);
    expect(await row(account)).toMatchObject({ saveId: career, endedBy: null });
    expect(await db.tutorialStep.count({ where: { userId: account } })).toBe(1);
    expect(await row(anonymous)).toBeNull();

    // An account with a career of its own: the tutorial follows, over.
    const second = await user();
    const secondCareer = await bareSave(second);
    await start(second, secondCareer);
    const veteran = await user({ kind: "REGISTERED" });
    await bareSave(veteran);
    await db.save.updateMany({ where: { ownerId: second }, data: { ownerId: veteran } });
    await move(second, veteran);
    expect(await row(veteran)).toMatchObject({ saveId: secondCareer, endedBy: "MERGED" });

    // An account with its own tutorial keeps it: the anonymous one stays with its user, who goes.
    const third = await user();
    const thirdCareer = await bareSave(third);
    await start(third, thirdCareer);
    await db.save.updateMany({ where: { ownerId: third }, data: { ownerId: account } });
    await move(third, account);
    expect(await row(account)).toMatchObject({ saveId: career });
    expect(await row(third)).toMatchObject({ saveId: thirdCareer });
  });
});
