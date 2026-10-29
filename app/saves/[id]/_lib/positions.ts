import {
  POSITIONS,
  positionGroup,
  secondaryPositions,
  type Position,
  type PositionedPlayer,
  type PositionGroup,
} from "@/src/engine/positions";

/** Positions from the goal outwards, grouped by line: the squad's default order. */
export const POSITION_ORDER: readonly Position[] = POSITIONS;

// A position's names, short (« DC », « CB ») and long, are messages: positions.short and positions.label.

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

/**
 * How a player fits a slot: his own position, one of his secondary positions, another position of his line, or
 * another line. Only the last two are « hors poste ».
 */
export type PositionFit = "exact" | "secondary" | "line" | "other-line";

export function positionFit(player: PositionedPlayer, slot: Position): PositionFit {
  if (player.position === slot) {
    return "exact";
  }
  if (secondaryPositions(player.id, player.position).includes(slot)) {
    return "secondary";
  }
  return positionGroup(player.position) === positionGroup(slot) ? "line" : "other-line";
}

/** Whether a fit counts as « hors poste »: a secondary position does not. */
export const isOffPosition = (fit: PositionFit): boolean => fit === "line" || fit === "other-line";
