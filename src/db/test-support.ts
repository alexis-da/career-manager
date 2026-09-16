import { seasonStartYear } from "../engine/world";
import { prisma } from "./client";
import { playNextMatchday } from "./matchday";
import { createSave } from "./saves";
import { advanceToNextSeason } from "./season";

/** Seed and managed club of the demo save. */
export const DEMO_SEED = "demo-2024-25";
export const DEMO_CLUB_SLUG = "olympique-lyonnais";

/** With the seed, the name tells the demo save apart from the throwaway twins other tests create in parallel. */
export const DEMO_SAVE_NAME = "Partie de démo 2024-25";

/** The demo save stands at the kickoff of this season: its first season played, then advanced. */
export const DEMO_START_YEAR = 2025;

/**
 * Creates a throwaway save with the demo save's seed and club, so database tests can play and advance seasons
 * without touching the demo save itself.
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

/**
 * Returns the demo save, creating it when it is missing: the demo seed and club, the 2024-25 season played, then
 * advanced to 1 July 2025. Everything is deterministic, so every recreation gives the same save. It is kept for
 * later runs; a creation interrupted halfway resumes where it stopped.
 */
export async function ensureDemoSave(): Promise<string> {
  const existing = await prisma.save.findFirst({
    where: { seed: DEMO_SEED, name: DEMO_SAVE_NAME },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const saveId = existing?.id ?? (await createDemoTwin(DEMO_SAVE_NAME));

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
