import { randomUUID } from "node:crypto";
import { seasonLabel, seasonStartYear, WORLD_START_YEAR } from "../engine/world";
import type { WorldVersion } from "../engine/world-version";
import { prisma } from "./client";
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

/** Deletes the throwaway owners of test saves that no longer own any save; how many were deleted. */
export async function deleteSavelessTestOwners(): Promise<number> {
  const { count } = await prisma.user.deleteMany({
    where: { id: { startsWith: TEST_OWNER_PREFIX }, kind: "ANONYMOUS", saves: { none: {} } },
  });
  return count;
}

/**
 * Creates a throwaway save with the demo save's seed and club, owned by a throwaway user of its own, so database
 * tests can play and advance seasons without touching the demo save itself.
 */
export async function createDemoTwin(name: string, worldVersion: WorldVersion = 1): Promise<string> {
  const [club, ownerId] = await Promise.all([
    prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } }),
    createTestOwner(),
  ]);
  const { id } = await createSave({ name, managerName: "Test", clubId: club.id, seed: DEMO_SEED, ownerId, worldVersion });
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

/** Plays matchdays until every fixture of the save is played; returns how many were played. */
export async function playRemainingMatchdays(saveId: string): Promise<number> {
  let matchdays = 0;
  while ((await playNextMatchday(saveId)) !== null) {
    matchdays++;
  }
  return matchdays;
}

/**
 * Returns the demo save of a world, creating it when it is missing: the demo seed and club, its first season played,
 * then advanced to 1 July of the next one, owned by its demo user. Everything is deterministic, so every recreation
 * gives the same save. It is kept for later runs; a creation interrupted halfway resumes where it stopped. The tests
 * use the worldVersion 1 demo; the worldVersion 2 one, with the second divisions, only where they matter: a season of
 * it is twice as heavy.
 */
export async function ensureDemoSave(worldVersion: WorldVersion = 1): Promise<string> {
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
