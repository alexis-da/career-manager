import { positionGroup, type Position } from "./positions";

/**
 * A slot of a formation: its position and where it stands on the pitch, in % of the pitch's width (x, 0 = left
 * touchline) and length (y, 0 = the opponent's goal line: the team attacks upwards).
 */
export type FormationSlot = { position: Position; x: number; y: number };

/**
 * The formations, from the most attacking profile to the most defensive (docs/design/gameplay-v2.md, V1). A name is an
 * identifier, stored with a saved lineup (ClubSave.formation, ClubSave.lineup by slot index) and in a match paused live:
 * never rename one, never reorder its slots. Only its label, a message (formations.label), may change: the « 4-3-3 » is
 * the « 4-3-3 sentinelle », the « 4-2-3-1 » the « 4-2-3-1 large », the « 4-4-2 » the « 4-4-2 à plat ». The order of this
 * list is the screens' within a family, and settles a tie between two formations.
 */
export const FORMATION_NAMES = [
  "3-4-3",
  "4-3-3-attacking",
  "3-4-2-1",
  "4-2-3-1-narrow",
  "4-3-3",
  "4-3-3-flat",
  "4-2-3-1",
  "3-4-1-2",
  "3-5-2",
  "4-4-2-diamond",
  "4-4-2",
  "4-4-1-1",
  "4-3-3-defensive",
  "4-1-4-1",
  "4-4-2-defensive",
  "5-3-2",
  "5-4-1",
] as const;

export type FormationName = (typeof FORMATION_NAMES)[number];

/**
 * The managed club's formation until its manager picks another, and the one the average opponent of a division plays
 * when an AI club chooses its own (chooseFormation, formation-choice.ts).
 */
export const DEFAULT_FORMATION_NAME: FormationName = "4-3-3";

/** The families of formations, by their defenders, in the order the screens group them. */
export const FORMATION_FAMILIES = [4, 3, 5] as const;

export type FormationFamily = (typeof FORMATION_FAMILIES)[number];

const slot = (position: Position, x: number, y: number): FormationSlot => ({ position, x, y });

const GOALKEEPER = slot("GK", 50, 91);
const BACK_FOUR = [slot("RB", 85, 70), slot("CB", 62, 76), slot("CB", 38, 76), slot("LB", 15, 70)];
const BACK_THREE = [slot("CB", 72, 75), slot("CB", 50, 78), slot("CB", 28, 75)];
const BACK_FIVE = [slot("RB", 88, 62), slot("CB", 69, 76), slot("CB", 50, 79), slot("CB", 31, 76), slot("LB", 12, 62)];

/**
 * The 11 slots of each formation, in the order the automatic lineup fills them: the goal, then the lines from
 * the back, each from right to left. A save stores the managed club's lineup by slot index: never reorder a
 * formation's slots.
 */
export const FORMATIONS: Readonly<Record<FormationName, readonly FormationSlot[]>> = {
  "4-3-3": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("CDM", 50, 58),
    slot("CM", 68, 47),
    slot("CM", 32, 47),
    slot("RW", 80, 24),
    slot("ST", 50, 15),
    slot("LW", 20, 24),
  ],
  "4-4-2": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("RM", 84, 45),
    slot("CM", 61, 50),
    slot("CM", 39, 50),
    slot("LM", 16, 45),
    slot("ST", 61, 17),
    slot("ST", 39, 17),
  ],
  "4-2-3-1": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("CDM", 62, 57),
    slot("CDM", 38, 57),
    slot("RW", 80, 31),
    slot("CAM", 50, 36),
    slot("LW", 20, 31),
    slot("ST", 50, 14),
  ],
  "4-1-4-1": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("CDM", 50, 60),
    slot("RM", 84, 40),
    slot("CM", 62, 44),
    slot("CM", 38, 44),
    slot("LM", 16, 40),
    slot("ST", 50, 15),
  ],
  "3-5-2": [
    GOALKEEPER,
    ...BACK_THREE,
    slot("CDM", 62, 58),
    slot("CDM", 38, 58),
    slot("RM", 87, 43),
    slot("CAM", 50, 37),
    slot("LM", 13, 43),
    slot("ST", 61, 16),
    slot("ST", 39, 16),
  ],
  "3-4-3": [
    GOALKEEPER,
    ...BACK_THREE,
    slot("RM", 85, 47),
    slot("CM", 61, 52),
    slot("CM", 39, 52),
    slot("LM", 15, 47),
    slot("RW", 78, 22),
    slot("ST", 50, 15),
    slot("LW", 22, 22),
  ],
  "5-3-2": [
    GOALKEEPER,
    ...BACK_FIVE,
    slot("CM", 71, 47),
    slot("CDM", 50, 54),
    slot("CM", 29, 47),
    slot("ST", 61, 17),
    slot("ST", 39, 17),
  ],
  // The formations of gameplay v2 (V1), each line from right to left.
  "4-3-3-attacking": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("CM", 68, 50),
    slot("CAM", 50, 38),
    slot("CM", 32, 50),
    slot("RW", 80, 22),
    slot("ST", 50, 14),
    slot("LW", 20, 22),
  ],
  "3-4-2-1": [
    GOALKEEPER,
    ...BACK_THREE,
    slot("RM", 85, 49),
    slot("CM", 61, 54),
    slot("CM", 39, 54),
    slot("LM", 15, 49),
    slot("CAM", 64, 32),
    slot("CAM", 36, 32),
    slot("ST", 50, 14),
  ],
  "4-2-3-1-narrow": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("CDM", 62, 57),
    slot("CDM", 38, 57),
    slot("CAM", 72, 36),
    slot("CAM", 50, 33),
    slot("CAM", 28, 36),
    slot("ST", 50, 14),
  ],
  "4-3-3-flat": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("CM", 72, 48),
    slot("CM", 50, 50),
    slot("CM", 28, 48),
    slot("RW", 80, 24),
    slot("ST", 50, 15),
    slot("LW", 20, 24),
  ],
  "3-4-1-2": [
    GOALKEEPER,
    ...BACK_THREE,
    slot("RM", 85, 49),
    slot("CM", 61, 54),
    slot("CM", 39, 54),
    slot("LM", 15, 49),
    slot("CAM", 50, 35),
    slot("ST", 62, 16),
    slot("ST", 38, 16),
  ],
  "4-4-2-diamond": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("CDM", 50, 59),
    slot("CM", 70, 47),
    slot("CM", 30, 47),
    slot("CAM", 50, 35),
    slot("ST", 61, 17),
    slot("ST", 39, 17),
  ],
  "4-4-1-1": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("RM", 84, 46),
    slot("CM", 61, 51),
    slot("CM", 39, 51),
    slot("LM", 16, 46),
    slot("CAM", 50, 32),
    slot("ST", 50, 15),
  ],
  "4-3-3-defensive": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("CDM", 62, 58),
    slot("CDM", 38, 58),
    slot("CM", 50, 46),
    slot("RW", 80, 25),
    slot("ST", 50, 15),
    slot("LW", 20, 25),
  ],
  "4-4-2-defensive": [
    GOALKEEPER,
    ...BACK_FOUR,
    slot("RM", 84, 47),
    slot("CDM", 61, 55),
    slot("CDM", 39, 55),
    slot("LM", 16, 47),
    slot("ST", 61, 18),
    slot("ST", 39, 18),
  ],
  "5-4-1": [
    GOALKEEPER,
    ...BACK_FIVE,
    slot("RM", 85, 44),
    slot("CM", 61, 49),
    slot("CM", 39, 49),
    slot("LM", 15, 44),
    slot("ST", 50, 16),
  ],
};

export function isFormationName(value: string): value is FormationName {
  return (FORMATION_NAMES as readonly string[]).includes(value);
}

/** The positions of a formation's slots, in slot order. */
export function formationPositions(name: FormationName): Position[] {
  return FORMATIONS[name].map((formationSlot) => formationSlot.position);
}

/** A formation's family: its number of defenders, three, four or five. */
export function formationFamily(name: FormationName): FormationFamily {
  const defenders = formationPositions(name).filter((position) => positionGroup(position) === "DF").length;
  const family = FORMATION_FAMILIES.find((count) => count === defenders);
  if (family === undefined) {
    throw new Error(`Formation ${name} has ${defenders} defenders: no family`);
  }
  return family;
}
