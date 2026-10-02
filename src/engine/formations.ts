import type { Position } from "./positions";

/**
 * A slot of a formation: its position and where it stands on the pitch, in % of the pitch's width (x, 0 = left
 * touchline) and length (y, 0 = the opponent's goal line: the team attacks upwards).
 */
export type FormationSlot = { position: Position; x: number; y: number };

export const FORMATION_NAMES = ["4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1", "3-5-2", "3-4-3", "5-3-2"] as const;

export type FormationName = (typeof FORMATION_NAMES)[number];

/** The formation of AI clubs, and of the managed club until the manager picks another. */
export const DEFAULT_FORMATION_NAME: FormationName = "4-3-3";

const slot = (position: Position, x: number, y: number): FormationSlot => ({ position, x, y });

const GOALKEEPER = slot("GK", 50, 91);
const BACK_FOUR = [slot("RB", 85, 70), slot("CB", 62, 76), slot("CB", 38, 76), slot("LB", 15, 70)];
const BACK_THREE = [slot("CB", 72, 75), slot("CB", 50, 78), slot("CB", 28, 75)];

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
    slot("RB", 88, 62),
    slot("CB", 69, 76),
    slot("CB", 50, 79),
    slot("CB", 31, 76),
    slot("LB", 12, 62),
    slot("CM", 71, 47),
    slot("CDM", 50, 54),
    slot("CM", 29, 47),
    slot("ST", 61, 17),
    slot("ST", 39, 17),
  ],
};

export function isFormationName(value: string): value is FormationName {
  return (FORMATION_NAMES as readonly string[]).includes(value);
}

/** The positions of a formation's slots, in slot order. */
export function formationPositions(name: FormationName): Position[] {
  return FORMATIONS[name].map((formationSlot) => formationSlot.position);
}
