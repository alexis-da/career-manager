import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { seasonLabel, seasonStartYear, WORLD_START_YEAR } from "../engine/world";
import type { WorldVersion } from "../engine/world-version";
import type { LivePause } from "../engine/live";
import { decodeGoalTimes } from "../engine/match";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";
import { assertLocalDatabase, pgConnection } from "./database-url";
import { advanceLiveMatch, getLivePause } from "./live-match";
import { playNextMatchday } from "./matchday";
import { createSave } from "./saves";
import { advanceToNextSeason } from "./season";

/** Seed and managed club of the demo save. */
export const DEMO_SEED = `demo-${seasonLabel(WORLD_START_YEAR)}`;
export const DEMO_CLUB_SLUG = "olympique-lyonnais";

/** With the seed, the name tells the demo save apart from the throwaway twins other tests create in parallel. */
export const DEMO_SAVE_NAME = `Partie de démo ${seasonLabel(WORLD_START_YEAR)}`;

/** The demo save of the world with the second divisions (worldVersion 2): the same seed and club, a name of its own. */
export const DEMO_V2_SAVE_NAME = `Partie de démo ${seasonLabel(WORLD_START_YEAR)}, deux divisions`;

/** The demo save stands at the kickoff of this season: its first season played, then advanced. */
export const DEMO_START_YEAR = WORLD_START_YEAR + 1;

/** The owner of the demo save and of the database tests' saves: a fixed id, the same in every test database. */
export const DEMO_USER_ID = "demo-user";

/** The owner of the worldVersion 2 demo save: an anonymous user owns one save at most (src/lib/limits.ts). */
export const DEMO_V2_USER_ID = "demo-user-v2";

const DEMO_SAVES: Record<WorldVersion, { name: string; ownerId: string }> = {
  1: { name: DEMO_SAVE_NAME, ownerId: DEMO_USER_ID },
  2: { name: DEMO_V2_SAVE_NAME, ownerId: DEMO_V2_USER_ID },
};

/**
 * The demo user, created when missing; reused as it is otherwise. INSERT … ON CONFLICT DO NOTHING rather than an
 * upsert, which Prisma runs as a read then a write: the database test files run in parallel, and on a fresh database
 * several of them create the demo user at once. Another id is for tests of this function only.
 */
export async function ensureDemoUser(id: string = DEMO_USER_ID): Promise<string> {
  await prisma.user.createMany({
    // Not simulation code: lastSeenAt is real time.
    data: [{ id, kind: "ANONYMOUS", lastSeenAt: new Date() }],
    skipDuplicates: true,
  });
  return id;
}

/** Prefix of the throwaway owners of test saves, which the database tests' teardown deletes once saveless. */
export const TEST_OWNER_PREFIX = "test-owner-";

/**
 * A throwaway anonymous user to own one test save: an anonymous user may own a single save (src/lib/limits.ts), and
 * database tests create many at once. Deleting the save leaves the user; src/db/test-global-setup.ts deletes it.
 */
export async function createTestOwner(): Promise<string> {
  // Not simulation code: a random id and real time.
  const { id } = await prisma.user.create({
    data: { id: `${TEST_OWNER_PREFIX}${randomUUID()}`, kind: "ANONYMOUS", lastSeenAt: new Date() },
    select: { id: true },
  });
  return id;
}

/**
 * Deletes test challenges, their entries and their saves first: the game never deletes a challenge, and both refer to
 * it with Restrict. Their owners stay, for src/db/test-global-setup.ts to delete once saveless.
 */
export async function deleteTestChallenges(weekKeys: readonly string[]): Promise<void> {
  const ofTheseWeeks = { challenge: { weekKey: { in: [...weekKeys] } } };
  await prisma.challengeEntry.deleteMany({ where: ofTheseWeeks });
  await prisma.save.deleteMany({ where: ofTheseWeeks });
  await prisma.challenge.deleteMany({ where: { weekKey: { in: [...weekKeys] } } });
}

/** Deletes the throwaway owners of test saves that no longer own any save; how many were deleted. */
export async function deleteSavelessTestOwners(): Promise<number> {
  const { count } = await prisma.user.deleteMany({
    where: { id: { startsWith: TEST_OWNER_PREFIX }, kind: "ANONYMOUS", saves: { none: {} } },
  });
  return count;
}

/**
 * Creates a throwaway save with the demo save's seed and club, owned by a throwaway user of its own, so database
 * tests can play and advance seasons without touching the demo save itself. cups and europe: the national cups and the
 * European competitions of a worldVersion 2 save, as the game gives them (CUPS_ENABLED, EUROPE_ENABLED) when left out.
 */
export async function createDemoTwin(name: string, worldVersion: WorldVersion = 1, cups?: boolean, europe?: boolean): Promise<string> {
  const [club, ownerId] = await Promise.all([
    prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } }),
    createTestOwner(),
  ]);
  const { id } = await createSave({ name, managerName: "Test", clubId: club.id, seed: DEMO_SEED, ownerId, worldVersion, cups, europe });
  return id;
}

/** A demo save itself, owned by its demo user: that user's one save. */
async function createDemoSave(worldVersion: WorldVersion): Promise<string> {
  const { name, ownerId } = DEMO_SAVES[worldVersion];
  const [club] = await Promise.all([
    prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } }),
    ensureDemoUser(ownerId),
  ]);
  const { id } = await createSave({ name, managerName: "Test", clubId: club.id, seed: DEMO_SEED, ownerId, worldVersion });
  return id;
}

/**
 * Plays the save's live match on, its assistant deciding the choice events and no change at the breaks, to its next
 * break ("break": half-time, the end of regulation time of a level cup tie, or the end) or to its end ("end"): the pause
 * it waits at then, null once over.
 */
export async function playLiveMatch(saveId: string, until: "break" | "end"): Promise<LivePause | null> {
  for (let pause: LivePause | null = await getLivePause(saveId); pause !== null; ) {
    const { pause: next } = await advanceLiveMatch(saveId, pause, {}, "break");
    if (until === "break" || next === null) {
      return next;
    }
    pause = next;
  }
  return null;
}

/** Plays matchdays until every fixture of the save is played; returns how many were played. */
export async function playRemainingMatchdays(saveId: string): Promise<number> {
  let matchdays = 0;
  while ((await playNextMatchday(saveId)) !== null) {
    matchdays++;
  }
  return matchdays;
}

/** Key of the advisory lock that lets one test process at a time make or finish a demo save. Any fixed number. */
const DEMO_SAVE_LOCK_KEY = 2_026_102_501;

/**
 * Runs `work` holding the demo saves' advisory lock, waiting for it while another process holds it. A session lock on
 * a connection of its own, not a transaction lock: making a demo save takes many transactions (creation, then a whole
 * season played and advanced), and the lock must cover them all. It goes with the connection, even if the process dies.
 */
async function withDemoSaveLock<T>(work: () => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is not set");
  }
  assertLocalDatabase(url, "DATABASE_URL");
  const lock = new Client(pgConnection(url));
  await lock.connect();
  try {
    await lock.query("SELECT pg_advisory_lock($1)", [DEMO_SAVE_LOCK_KEY]);
    return await work();
  } finally {
    await lock.end();
  }
}

/**
 * Returns the demo save of a world, creating it when it is missing: the demo seed and club, its first season played,
 * then advanced to 1 July of the next one, owned by its demo user. Everything is deterministic, so every recreation
 * gives the same save. It is kept for later runs; a creation interrupted halfway resumes where it stopped. The tests
 * use the worldVersion 1 demo; the worldVersion 2 one, with the second divisions, only where they matter: a season of
 * it is twice as heavy. Serialized across the test files running at once (withDemoSaveLock): on a fresh database, the
 * first one makes the save while the others wait, then find it ready; its anonymous owner may hold one save only.
 */
export async function ensureDemoSave(worldVersion: WorldVersion = 1): Promise<string> {
  return withDemoSaveLock(() => ensureDemoSaveNow(worldVersion));
}

async function ensureDemoSaveNow(worldVersion: WorldVersion): Promise<string> {
  const { name, ownerId } = DEMO_SAVES[worldVersion];
  const existing = await prisma.save.findFirst({
    where: { seed: DEMO_SEED, name, worldVersion },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const saveId = existing?.id ?? (await createDemoSave(worldVersion));
  // A demo save created before owners is attached to its demo user; one already owned stays with its owner.
  await prisma.save.updateMany({ where: { id: saveId, ownerId: null }, data: { ownerId: await ensureDemoUser(ownerId) } });

  const currentStartYear = async (): Promise<number> => {
    const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
    return seasonStartYear(save.currentDate);
  };
  while ((await currentStartYear()) < DEMO_START_YEAR) {
    await playRemainingMatchdays(saveId);
    await advanceToNextSeason(saveId);
  }
  return saveId;
}

/**
 * Gives the matches without the managed club played on the dates chosen their goals as the game kept them before
 * Fixture.goalTimes (chantier « fiabilité », 08/11): one GOAL MatchEvent per goal, at its minute, period and side, scored
 * by a player of the scoring club (one goal in two with an assist), and no goal times left. A save played before the
 * change, as production holds it, for the tests of the event cleanup. Returns how many events were written.
 */
export async function keepOtherGoalsAsEvents(saveId: string, scheduledAt: Prisma.DateTimeFilter): Promise<number> {
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const fixtures = await prisma.fixture.findMany({
    where: {
      saveId,
      played: true,
      scheduledAt,
      goalTimes: { isEmpty: false },
      homeClubSaveId: { not: managed.id },
      awayClubSaveId: { not: managed.id },
    },
    select: { id: true, goalTimes: true, homeClubSaveId: true, awayClubSaveId: true },
  });
  const clubIds = [...new Set(fixtures.flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]))];
  const players = await prisma.playerSave.findMany({
    where: { saveId, clubSaveId: { in: clubIds } },
    orderBy: { playerKey: "asc" },
    select: { id: true, clubSaveId: true },
  });
  const squads = Map.groupBy(players, (player) => player.clubSaveId);
  const events: Prisma.MatchEventCreateManyInput[] = fixtures.flatMap((fixture) =>
    decodeGoalTimes(fixture.goalTimes).map((goal, index) => {
      const squad = squads.get(goal.side === "home" ? fixture.homeClubSaveId : fixture.awayClubSaveId) ?? [];
      return {
        fixtureId: fixture.id,
        minute: goal.minute,
        period: goal.period,
        type: "GOAL" as const,
        side: goal.side === "home" ? ("HOME" as const) : ("AWAY" as const),
        playerSaveId: squad.at(index % Math.max(1, squad.length))?.id ?? null,
        relatedPlayerSaveId: index % 2 === 0 ? (squad.at((index + 1) % Math.max(1, squad.length))?.id ?? null) : null,
      };
    }),
  );
  for (let start = 0; start < events.length; start += 1_000) {
    await prisma.matchEvent.createMany({ data: events.slice(start, start + 1_000) });
  }
  await prisma.fixture.updateMany({ where: { saveId, id: { in: fixtures.map((fixture) => fixture.id) } }, data: { goalTimes: [] } });
  return events.length;
}
