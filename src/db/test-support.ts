import { seasonLabel, seasonStartYear, WORLD_START_YEAR } from "../engine/world";
import { prisma } from "./client";
import { playNextMatchday } from "./matchday";
import { createSave } from "./saves";
import { advanceToNextSeason } from "./season";

/** Seed and managed club of the demo save. */
export const DEMO_SEED = `demo-${seasonLabel(WORLD_START_YEAR)}`;
export const DEMO_CLUB_SLUG = "olympique-lyonnais";

/** With the seed, the name tells the demo save apart from the throwaway twins other tests create in parallel. */
export const DEMO_SAVE_NAME = `Partie de démo ${seasonLabel(WORLD_START_YEAR)}`;

/** The demo save stands at the kickoff of this season: its first season played, then advanced. */
export const DEMO_START_YEAR = WORLD_START_YEAR + 1;

/** The owner of the demo save and of the database tests' saves: a fixed id, the same in every test database. */
export const DEMO_USER_ID = "demo-user";

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

/**
 * Creates a throwaway save with the demo save's seed and club, owned by the demo user, so database tests can play
 * and advance seasons without touching the demo save itself.
 */
export async function createDemoTwin(name: string): Promise<string> {
  const [club, ownerId] = await Promise.all([
    prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } }),
    ensureDemoUser(),
  ]);
  const { id } = await createSave({ name, managerName: "Test", clubId: club.id, seed: DEMO_SEED, ownerId });
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
 * Returns the demo save, creating it when it is missing: the demo seed and club, its first season played, then
 * advanced to 1 July of the next one, owned by the demo user. Everything is deterministic, so every recreation gives
 * the same save. It is kept for later runs; a creation interrupted halfway resumes where it stopped.
 */
export async function ensureDemoSave(): Promise<string> {
  const existing = await prisma.save.findFirst({
    where: { seed: DEMO_SEED, name: DEMO_SAVE_NAME },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const saveId = existing?.id ?? (await createDemoTwin(DEMO_SAVE_NAME));
  // A demo save created before owners is attached to the demo user; one already owned stays with its owner.
  await prisma.save.updateMany({ where: { id: saveId, ownerId: null }, data: { ownerId: await ensureDemoUser() } });

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
