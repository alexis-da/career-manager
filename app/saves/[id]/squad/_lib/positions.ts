import type { Position } from "@/src/engine/generation";

/** Positions from the goal outwards: the squad's default grouping. */
export const POSITION_ORDER: readonly Position[] = ["GK", "DF", "MF", "FW"];

export const POSITION_SHORT: Record<Position, string> = { GK: "G", DF: "D", MF: "M", FW: "A" };

export const POSITION_LABEL: Record<Position, string> = {
  GK: "Gardien",
  DF: "Défenseur",
  MF: "Milieu",
  FW: "Attaquant",
};

export const POSITION_GROUP: Record<Position, string> = {
  GK: "Gardiens",
  DF: "Défenseurs",
  MF: "Milieux",
  FW: "Attaquants",
};
