import { prisma } from "./client";
import { playNextMatchday } from "./matchday";
import { createSave } from "./saves";

/** Seed and managed club of the demo save. */
export const DEMO_SEED = "demo-2024-25";
export const DEMO_CLUB_SLUG = "olympique-lyonnais";

/**
 * Creates a throwaway twin of the demo save: same seed and club, hence the very same save, so database
 * tests can play and advance seasons without touching the demo save itself.
 */
export async function createDemoTwin(name: string): Promise<string> {
  const club = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id } = await createSave({ name, managerName: "Test", clubId: club.id, seed: DEMO_SEED });
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
