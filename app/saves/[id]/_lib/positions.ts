import { POSITIONS, positionGroup, type Position, type PositionGroup } from "@/src/engine/positions";

/** Positions from the goal outwards, grouped by line: the squad's default order. */
export const POSITION_ORDER: readonly Position[] = POSITIONS;

/** Short label of a position, shown in tables. */
export const POSITION_SHORT: Record<Position, string> = {
  GK: "G",
  RB: "DD",
  CB: "DC",
  LB: "DG",
  CDM: "MDC",
  CM: "MC",
  CAM: "MOC",
  RM: "MD",
  LM: "MG",
  RW: "AD",
  LW: "AG",
  ST: "BU",
};

export const POSITION_LABEL: Record<Position, string> = {
  GK: "Gardien",
  RB: "Arrière droit",
  CB: "Défenseur central",
  LB: "Arrière gauche",
  CDM: "Milieu défensif",
  CM: "Milieu central",
  CAM: "Milieu offensif",
  RM: "Milieu droit",
  LM: "Milieu gauche",
  RW: "Ailier droit",
  LW: "Ailier gauche",
  ST: "Buteur",
};

/** Fixed color of each line, whatever the managed club. */
const GROUP_TEXT: Record<PositionGroup, string> = {
  GK: "text-position-gk",
  DF: "text-position-df",
  MF: "text-position-mf",
  FW: "text-position-fw",
};

/** Color of a position: the color of its line. */
export function positionTextClass(position: Position): string {
  return GROUP_TEXT[positionGroup(position)];
}
