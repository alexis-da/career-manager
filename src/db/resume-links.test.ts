import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "./client";

// Resume links against DATABASE_URL: a twin of the demo save (worldVersion 1) and its throwaway anonymous owner, a
// throwaway owner without a career, and a Google account; all deleted at the end, the links with their users. Skipped
// without DATABASE_URL; modules are imported lazily because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("resume links, in the database", () => {
  let db: typeof prismaClient | undefined;
  let links: typeof import("./resume-links") | undefined;
  let saveId = "";
  let playerId = "";
  let savelessId = "";
  let accountId = "";
  const NOW = new Date("2026-11-12T10:00:00Z");
  const DAY_MS = 24 * 60 * 60 * 1000;

  const loaded = () => {
    if (db === undefined || links === undefined) {
      throw new Error("Modules not loaded");
    }
    return { db, links };
  };

  beforeAll(async () => {
    const [{ prisma }, linksModule, support] = await Promise.all([import("./client"), import("./resume-links"), import("./test-support")]);
    db = prisma;
    links = linksModule;
    saveId = await support.createDemoTwin("Lien de reprise");
    playerId = (await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { ownerId: true } })).ownerId ?? "";
    savelessId = await support.createTestOwner();
    accountId = (
      await prisma.user.create({
        data: { kind: "REGISTERED", email: `resume-${savelessId}@example.test`, googleSub: `resume-${savelessId}`, lastSeenAt: NOW },
        select: { id: true },
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await db?.save.deleteMany({ where: { id: saveId } });
    await db?.user.deleteMany({ where: { id: { in: [playerId, savelessId, accountId] } } });
    await db?.$disconnect();
  }, 120_000);

  it("gives an anonymous player with a career a token the database only keeps the hash of", async () => {
    const { db, links } = loaded();
    const link = await links.createResumeLink(db, playerId, NOW);
    if (!link.ok) {
      throw new Error(`no link: ${link.reason}`);
    }
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link.expiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY_MS));
    const rows = await db.resumeLink.findMany({ where: { userId: playerId }, select: { tokenHash: true } });
    expect(rows.map((row) => row.tokenHash)).toContain(links.resumeTokenHash(link.token));
    expect(JSON.stringify(rows)).not.toContain(link.token);
    expect(await links.readResumeLink(db, link.token, NOW)).toEqual({ status: "valid", userId: playerId, expiresAt: link.expiresAt });
  });

  it("gives none to a player without a career, nor to a Google account", async () => {
    const { db, links } = loaded();
    expect(await links.createResumeLink(db, savelessId, NOW)).toEqual({ ok: false, reason: "no-career" });
    expect(await links.createResumeLink(db, accountId, NOW)).toEqual({ ok: false, reason: "not-anonymous" });
    expect(await links.createResumeLink(db, "nobody", NOW)).toEqual({ ok: false, reason: "not-anonymous" });
  });

  it("opens once: reading spends nothing, the first spend gets the player, the second nothing", async () => {
    const { db, links } = loaded();
    const link = await links.createResumeLink(db, playerId, NOW);
    if (!link.ok) {
      throw new Error(`no link: ${link.reason}`);
    }
    await links.readResumeLink(db, link.token, NOW);
    const [first, second] = await Promise.all([
      links.consumeResumeLink(db, link.token, NOW),
      links.consumeResumeLink(db, link.token, NOW),
    ]);
    expect([first, second].sort()).toEqual([null, playerId].sort());
    expect(await links.readResumeLink(db, link.token, NOW)).toEqual({ status: "used", userId: playerId });
    expect(await links.consumeResumeLink(db, link.token, NOW)).toBeNull();
  });

  it("lasts seven days", async () => {
    const { db, links } = loaded();
    const link = await links.createResumeLink(db, playerId, NOW);
    if (!link.ok) {
      throw new Error(`no link: ${link.reason}`);
    }
    const later = new Date(NOW.getTime() + 7 * DAY_MS);
    expect(await links.readResumeLink(db, link.token, later)).toEqual({ status: "expired", userId: playerId });
    expect(await links.consumeResumeLink(db, link.token, later)).toBeNull();
    expect(await links.consumeResumeLink(db, link.token, new Date(later.getTime() - 1000))).toBe(playerId);
  });

  it("knows no token of another shape, nor one never given", async () => {
    const { db, links } = loaded();
    expect(await links.readResumeLink(db, "short", NOW)).toEqual({ status: "unknown" });
    expect(await links.readResumeLink(db, "A".repeat(43), NOW)).toEqual({ status: "unknown" });
    expect(await links.consumeResumeLink(db, "A".repeat(43), NOW)).toBeNull();
  });

  it("gives RESUME_LINKS_PER_HOUR an hour, then none until the hour has passed", async () => {
    const { db, links } = loaded();
    const hour = new Date(NOW.getTime() + 30 * DAY_MS);
    for (let index = 0; index < links.RESUME_LINKS_PER_HOUR; index += 1) {
      expect((await links.createResumeLink(db, playerId, hour)).ok).toBe(true);
    }
    expect(await links.createResumeLink(db, playerId, hour)).toEqual({ ok: false, reason: "limit" });
    expect((await links.createResumeLink(db, playerId, new Date(hour.getTime() + 60 * 60 * 1000 + 1))).ok).toBe(true);
  });

  it("leads to the player's last career", async () => {
    const { db, links } = loaded();
    expect(await links.lastCareerOf(db, playerId)).toBe(saveId);
    expect(await links.lastCareerOf(db, savelessId)).toBeNull();
  });
});
