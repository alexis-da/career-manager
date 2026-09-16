import type { Position } from "@/src/engine/generation";

/** Positions from the goal outwards: the squad's default order. */
export const POSITION_ORDER: readonly Position[] = ["GK", "DF", "MF", "FW"];

export const POSITION_LABEL: Record<Position, string> = {
  GK: "Gardien",
  DF: "Défenseur",
  MF: "Milieu",
  FW: "Attaquant",
};

/** Fixed color of each position, whatever the managed club. */
export const POSITION_TEXT: Record<Position, string> = {
  GK: "text-position-gk",
  DF: "text-position-df",
  MF: "text-position-mf",
  FW: "text-position-fw",
};
