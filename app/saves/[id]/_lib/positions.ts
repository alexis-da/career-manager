import {
  POSITIONS,
  positionGroup,
  ratingAt,
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
 * How a player fits a slot, each with its label (positions.fit): his own position (« À son poste »), one of his
 * secondary positions (« Poste secondaire »), another position of his line (« Dépanne »), or another line (« Hors
 * poste »). Only the last two put him off position.
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

/** Whether a fit puts a player off position, filling in or out of position: a secondary position does not. */
export const isOffPosition = (fit: PositionFit): boolean => fit === "line" || fit === "other-line";

/** The alert colours already used for a fit, and no other: amber filling in, red out of position, none otherwise. */
const FIT_TEXT: Record<PositionFit, string> = {
  exact: "",
  secondary: "",
  line: "text-warning",
  "other-line": "text-loss",
};

/** Colour of a fit's label, and of the rating it costs on the pitch. */
export function fitTextClass(fit: PositionFit): string {
  return FIT_TEXT[fit];
}

/** A player's rating in a slot as every screen shows it, whole: his own at his position, « 65 » for a 71 filling in. */
export const slotRating = (player: PositionedPlayer & { overall: number }, slot: Position): number =>
  Math.round(ratingAt(player, slot));
