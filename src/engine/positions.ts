import { makeRng } from "../lib/rng";
import {
  GROUP_FAMILIARITY,
  SAME_POSITION_FAMILIARITY,
  SECONDARY_POSITION_COUNT_WEIGHTS,
  SECONDARY_POSITION_FAMILIARITY,
  SECONDARY_POSITION_NEIGHBOURS,
  SQUAD_ROLES,
  type SquadRole,
} from "./balance";

/** Positions from the goal outwards, right before left. Same values as the Prisma enum Position. */
export const POSITIONS = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"] as const;

export type Position = (typeof POSITIONS)[number];

/** Lines of the pitch, from the goal outwards: they carry the colors and the groupings of the squad. */
export const POSITION_GROUPS = ["GK", "DF", "MF", "FW"] as const;

export type PositionGroup = (typeof POSITION_GROUPS)[number];

const GROUP_OF: Readonly<Record<Position, PositionGroup>> = {
  GK: "GK",
  RB: "DF",
  CB: "DF",
  LB: "DF",
  CDM: "MF",
  CM: "MF",
  CAM: "MF",
  RM: "MF",
  LM: "MF",
  RW: "FW",
  LW: "FW",
  ST: "FW",
};

export function positionGroup(position: Position): PositionGroup {
  return GROUP_OF[position];
}

/** What placing a player in a slot needs to know: his identity (playerKey) and his primary position. */
export type PositionedPlayer = { id: string; position: Position };

/** Secondary positions already drawn, by primary position, then player key: drawing them is pure, so is caching. */
const secondaryCache = new Map<Position, Map<string, readonly Position[]>>();

/**
 * A player's secondary positions: none, one or two, drawn from his own stream (« secondary:playerKey ») among the
 * plausible neighbours of his primary position, the first among all of them, the second among those left. A
 * goalkeeper has none. Nothing is stored: the same key always gives the same positions, in every save.
 */
export function secondaryPositions(playerKey: string, primary: Position): readonly Position[] {
  let byKey = secondaryCache.get(primary);
  if (byKey === undefined) {
    byKey = new Map();
    secondaryCache.set(primary, byKey);
  }
  const cached = byKey.get(playerKey);
  if (cached !== undefined) {
    return cached;
  }
  const neighbours = [...SECONDARY_POSITION_NEIGHBOURS[primary]];
  const drawn: Position[] = [];
  if (neighbours.length > 0) {
    const rng = makeRng(`secondary:${playerKey}`);
    const roll = rng();
    const [none, one] = SECONDARY_POSITION_COUNT_WEIGHTS;
    const count = roll < none ? 0 : roll < none + one ? 1 : 2;
    for (let index = 0; index < count && neighbours.length > 0; index++) {
      const [position] = neighbours.splice(Math.floor(rng() * neighbours.length), 1);
      drawn.push(position);
    }
  }
  byKey.set(playerKey, drawn);
  return drawn;
}

/** Primary positions whose players may have `position` among their secondary ones. */
export function primariesWithSecondary(position: Position): Position[] {
  return POSITIONS.filter((primary) => SECONDARY_POSITION_NEIGHBOURS[primary].includes(position));
}

/**
 * How well a player of `position` plays in `slot`: 1 at their own position, 0.97 at one of their secondary
 * positions, less the further the slot.
 */
export function familiarity(position: Position, slot: Position, secondary: readonly Position[] = []): number {
  if (position === slot) {
    return SAME_POSITION_FAMILIARITY;
  }
  if (secondary.includes(slot)) {
    return SECONDARY_POSITION_FAMILIARITY;
  }
  return GROUP_FAMILIARITY[positionGroup(position)][positionGroup(slot)];
}

/** A player's familiarity with a slot, his secondary positions included. */
export function playerFamiliarity(player: PositionedPlayer, slot: Position): number {
  return familiarity(player.position, slot, secondaryPositions(player.id, player.position));
}

/** Rating of a player in a slot: their overall, reduced by their familiarity with the slot. */
export function ratingAt(player: PositionedPlayer & { overall: number }, slot: Position): number {
  return player.overall * playerFamiliarity(player, slot);
}

/** The squad role a position belongs to (every position is in exactly one role of SQUAD_ROLES). */
export function roleOf(position: Position): SquadRole {
  const role = SQUAD_ROLES.find((candidate) => candidate.positions.includes(position));
  if (role === undefined) {
    throw new Error(`Position ${position} is in no squad role`);
  }
  return role;
}

/** Players needed in each role for a group of `size` players: SQUAD_ROLES scaled, largest remainders first. */
export function roleCounts(size: number): number[] {
  const total = SQUAD_ROLES.reduce((sum, role) => sum + role.count, 0);
  const exact = SQUAD_ROLES.map((role) => (role.count * size) / total);
  const counts = exact.map(Math.floor);
  // Ties go to the earlier role, so the result never depends on the sort's stability.
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let left = size - counts.reduce((sum, count) => sum + count, 0), rank = 0; left > 0; left--, rank++) {
    counts[byRemainder[rank].index]++;
  }
  return counts;
}

/**
 * Positions of a group of `size` players in the proportions of SQUAD_ROLES, role after role; a role of several
 * positions alternates them (RM, RW, RM…). squadTemplate(23) is the squad template itself.
 */
export function squadTemplate(size: number): Position[] {
  const counts = roleCounts(size);
  return SQUAD_ROLES.flatMap((role, index) =>
    Array.from({ length: counts[index] }, (_, rank) => role.positions[rank % role.positions.length]),
  );
}
