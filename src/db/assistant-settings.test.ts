import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";
import { lineupByAssistantOf } from "./lineup";

const SAVED = { starters: [{ slot: 0, playerKey: "a#1" }], benchOrder: [] };

// What a career leaves to the assistant (docs/design/simplification.md § 3.3 and § 7), its rule first.
describe("lineupByAssistantOf", () => {
  it("follows the career's setting once it has one", () => {
    expect(lineupByAssistantOf(true, SAVED)).toBe(true);
    expect(lineupByAssistantOf(false, null)).toBe(false);
  });

  it("leaves a career from before the setting its saved line-up, and the assistant to one that has none", () => {
    expect(lineupByAssistantOf(null, SAVED)).toBe(false);
    expect(lineupByAssistantOf(null, null)).toBe(true);
    // A saved instruction alone is no line-up of the player's, nor is a value that no longer parses.
    expect(lineupByAssistantOf(null, { starters: [], benchOrder: [], instruction: "DEFEND" })).toBe(true);
    expect(lineupByAssistantOf(null, { starters: "?" })).toBe(true);
  });
});

// Runs against DATABASE_URL on a throwaway world-1 save. Skipped without it; modules are imported lazily because the client
// throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("the assistant's settings of a career", () => {
  let db: typeof prismaClient | undefined;
  let settings: typeof import("./assistant-settings") | undefined;
  let saveId = "";

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };
  const api = () => {
    if (settings === undefined) {
      throw new Error("Settings module not loaded");
    }
    return settings;
  };

  beforeAll(async () => {
    const [{ prisma }, { createSave }, settingsModule, { createTestOwner }] = await Promise.all([
      import("./client"),
      import("./saves"),
      import("./assistant-settings"),
      import("./test-support"),
    ]);
    db = prisma;
    settings = settingsModule;
    const { id: clubId } = await prisma.club.findUniqueOrThrow({ where: { slug: "olympique-lyonnais" }, select: { id: true } });
    saveId = (
      await createSave({ name: "Test réglages de l'adjoint", managerName: "Test", clubId, seed: "assistant-settings", ownerId: await createTestOwner(), worldVersion: 1 })
    ).id;
  }, 300_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.$disconnect();
  }, 120_000);

  it("gives a new career the assistant's line-up and contracts, « Meilleur onze », its announcement already closed", async () => {
    const save = await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { lineupByAssistant: true, assistantNoticeAt: true } });
    expect(save.lineupByAssistant).toBe(true);
    expect(save.assistantNoticeAt).not.toBeNull();
    expect(await api().getAssistantSettings(saveId)).toEqual({
      lineupByAssistant: true,
      contractsByAssistant: true,
      policy: "BEST",
      noticeOpen: false,
    });
  });

  it("reads a career from before the setting by its saved line-up, and announces the change to it once", async () => {
    const managed = await database().clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
    await database().save.update({ where: { id: saveId }, data: { lineupByAssistant: null, assistantNoticeAt: null } });
    await database().clubSave.update({ where: { id: managed.id, saveId }, data: { lineup: SAVED } });
    expect(await api().getAssistantSettings(saveId)).toEqual({
      lineupByAssistant: false,
      contractsByAssistant: true,
      policy: "BEST",
      noticeOpen: true,
    });

    await database().clubSave.update({ where: { id: managed.id, saveId }, data: { lineup: { starters: [], benchOrder: [], instruction: "ATTACK" } } });
    expect((await api().getAssistantSettings(saveId)).lineupByAssistant).toBe(true);

    await api().closeAssistantNotice(saveId);
    const closedAt = (await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { assistantNoticeAt: true } })).assistantNoticeAt;
    expect(closedAt).not.toBeNull();
    expect((await api().getAssistantSettings(saveId)).noticeOpen).toBe(false);
    // Closed once: a second « Compris » leaves its date.
    await api().closeAssistantNotice(saveId);
    expect((await database().save.findUniqueOrThrow({ where: { id: saveId }, select: { assistantNoticeAt: true } })).assistantNoticeAt).toEqual(closedAt);
  });

  it("turns each setting, and refuses while a match waits live", async () => {
    await api().setLineupByAssistant(saveId, false);
    await api().setContractsByAssistant(saveId, false);
    expect(await api().getAssistantSettings(saveId)).toMatchObject({ lineupByAssistant: false, contractsByAssistant: false });

    // Any id: the settings only read whether a match waits (Save.liveFixtureId has no foreign key).
    await database().save.update({ where: { id: saveId }, data: { liveFixtureId: "test-live-fixture" } });
    try {
      await expect(api().setLineupByAssistant(saveId, true)).rejects.toBeInstanceOf(api().AssistantSettingsError);
      await expect(api().setContractsByAssistant(saveId, true)).rejects.toBeInstanceOf(api().AssistantSettingsError);
      expect(await api().getAssistantSettings(saveId)).toMatchObject({ lineupByAssistant: false, contractsByAssistant: false });
    } finally {
      await database().save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
    }

    await api().setLineupByAssistant(saveId, true);
    await api().setContractsByAssistant(saveId, true);
    expect(await api().getAssistantSettings(saveId)).toMatchObject({ lineupByAssistant: true, contractsByAssistant: true });
  });

  it("chooses his policy, kept while he takes care of nothing, and refuses it while a match waits live", async () => {
    await api().setAssistantPolicy(saveId, "YOUTH");
    expect((await api().getAssistantSettings(saveId)).policy).toBe("YOUTH");
    // The player keeps both: the policy waits, unchanged.
    await api().setLineupByAssistant(saveId, false);
    await api().setContractsByAssistant(saveId, false);
    expect(await api().getAssistantSettings(saveId)).toMatchObject({ lineupByAssistant: false, contractsByAssistant: false, policy: "YOUTH" });

    await database().save.update({ where: { id: saveId }, data: { liveFixtureId: "test-live-fixture" } });
    try {
      await expect(api().setAssistantPolicy(saveId, "BEST")).rejects.toBeInstanceOf(api().AssistantSettingsError);
      expect((await api().getAssistantSettings(saveId)).policy).toBe("YOUTH");
    } finally {
      await database().save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
    }

    await api().setAssistantPolicy(saveId, "BEST");
    await api().setLineupByAssistant(saveId, true);
    await api().setContractsByAssistant(saveId, true);
    expect(await api().getAssistantSettings(saveId)).toMatchObject({ lineupByAssistant: true, contractsByAssistant: true, policy: "BEST" });
  });
});
