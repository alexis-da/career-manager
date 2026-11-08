import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { firstMatchdayDate, WORLD_START_YEAR } from "../engine/world";
import type { prisma as prismaClient } from "./client";

// Off for the twin that keeps every event, as before the filter: the same matchday then shows what the filter drops.
const filter = vi.hoisted(() => ({ enabled: true }));

vi.mock("../engine/match", async (importOriginal) => {
  const original = await importOriginal<typeof import("../engine/match")>();
  return {
    ...original,
    eventsToPersist: (...args: Parameters<typeof original.eventsToPersist>) =>
      filter.enabled ? original.eventsToPersist(...args) : [...args[0]],
  };
});

// Plays the first matchday of two throwaway twins of the demo save, the event filter on for one and off for the
// other, then compares them. Runs against DATABASE_URL and is skipped without it; modules are imported lazily
// because the client throws without it.
describe.skipIf(process.env.DATABASE_URL === undefined)("match events written for a matchday", () => {
  let db: typeof prismaClient | undefined;
  const saves = { filtered: "", unfiltered: "" };

  const database = (): typeof prismaClient => {
    if (db === undefined) {
      throw new Error("Database client not initialised");
    }
    return db;
  };

  /** Events of the first matchday by fixture (home and away slugs), in match order, players by playerKey. */
  const eventsByFixture = async (saveId: string) => {
    const fixtures = await database().fixture.findMany({
      where: { saveId, scheduledAt: firstMatchdayDate(WORLD_START_YEAR) },
      select: {
        goalTimes: true,
        homeClubSave: { select: { isManaged: true, club: { select: { slug: true } } } },
        awayClubSave: { select: { isManaged: true, club: { select: { slug: true } } } },
        events: {
          orderBy: [{ minute: "asc" }, { id: "asc" }],
          select: { minute: true, type: true, side: true, playerSave: { select: { playerKey: true } }, relatedPlayerSave: { select: { playerKey: true } } },
        },
      },
    });
    return new Map(
      fixtures.map((fixture) => [
        `${fixture.homeClubSave.club.slug}-${fixture.awayClubSave.club.slug}`,
        {
          managed: fixture.homeClubSave.isManaged || fixture.awayClubSave.isManaged,
          goalTimes: fixture.goalTimes,
          events: fixture.events.map((event) => ({
            minute: event.minute,
            type: event.type,
            side: event.side,
            player: event.playerSave?.playerKey ?? null,
            related: event.relatedPlayerSave?.playerKey ?? null,
          })),
        },
      ]),
    );
  };

  const seasonStats = (saveId: string) =>
    database().playerSeasonStats.findMany({
      where: { saveId },
      orderBy: { playerSave: { playerKey: "asc" } },
      select: {
        appearances: true,
        minutes: true,
        goals: true,
        assists: true,
        yellowCards: true,
        redCards: true,
        playerSave: { select: { playerKey: true, injuredUntil: true, form: true } },
      },
    });

  beforeAll(async () => {
    const [{ prisma }, support, { playNextMatchday }] = await Promise.all([
      import("./client"),
      import("./test-support"),
      import("./matchday"),
    ]);
    db = prisma;
    [saves.filtered, saves.unfiltered] = await Promise.all([
      support.createDemoTwin("Test événements filtrés"),
      support.createDemoTwin("Test événements complets"),
    ]);
    filter.enabled = true;
    await playNextMatchday(saves.filtered);
    filter.enabled = false;
    await playNextMatchday(saves.unfiltered);
    filter.enabled = true;
  }, 240_000);

  afterAll(async () => {
    for (const saveId of Object.values(saves)) {
      if (saveId !== "") {
        await db?.save.delete({ where: { id: saveId } });
      }
    }
    await db?.$disconnect();
  }, 120_000);

  it("writes no event of the matches without the managed club, their goals in their goal times, all events of its own", async () => {
    const [filtered, unfiltered] = await Promise.all([eventsByFixture(saves.filtered), eventsByFixture(saves.unfiltered)]);
    const others = [...filtered.entries()].filter(([, fixture]) => !fixture.managed);
    const managed = [...filtered.entries()].filter(([, fixture]) => fixture.managed);

    expect(filtered.size).toBe(48);
    expect(managed).toHaveLength(1);
    // Without the filter, the other matches do have cards, substitutions or injuries: the filter has work to do.
    expect([...unfiltered.values()].some((fixture) => !fixture.managed && fixture.events.some((event) => event.type !== "GOAL"))).toBe(
      true,
    );
    for (const [key, fixture] of others) {
      const goals = unfiltered.get(key)?.events.filter((event) => event.type === "GOAL") ?? [];
      expect(fixture.events).toEqual([]);
      // The first matchday has no extra time: each goal is its minute, negative for the away side.
      expect(fixture.goalTimes).toEqual(goals.map((event) => (event.side === "HOME" ? event.minute : -event.minute)));
    }
    expect([...filtered.values()].some((fixture) => fixture.goalTimes.length > 0)).toBe(true);
    const [managedKey, managedFixture] = managed[0];
    expect(managedFixture.goalTimes).toEqual([]);
    expect(managedFixture.events).toEqual(unfiltered.get(managedKey)?.events);
    expect(new Set(managedFixture.events.map((event) => event.type)).size).toBeGreaterThan(1);
  });

  it("keeps the same season stats, form and injuries as without the filter, cards included", async () => {
    const [filtered, unfiltered] = await Promise.all([seasonStats(saves.filtered), seasonStats(saves.unfiltered)]);
    const cards = filtered.reduce((sum, row) => sum + row.yellowCards + row.redCards, 0);
    const cardEvents = await database().matchEvent.count({
      where: { type: { in: ["YELLOW_CARD", "RED_CARD"] }, fixture: { saveId: saves.filtered } },
    });

    expect(filtered).toEqual(unfiltered);
    expect(filtered.length).toBeGreaterThan(0);
    // The stats count every card of the matchday, many more than the managed club's match keeps as events.
    expect(cards).toBeGreaterThan(cardEvents);
  });
});
