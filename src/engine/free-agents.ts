import { randomInt, type Rng } from "../lib/rng";
import {
  FREE_AGENT_POOL_OVERALL_MAX,
  FREE_AGENT_POOL_OVERALL_MIN,
  FREE_AGENT_POOL_TOP_OVERALL_MAX,
  FREE_AGENT_POOL_TOP_SHARE,
} from "./balance";
import { clampRating, generateAttributes, shiftToOverall, type PlayerAttributes, type PlayerProfile } from "./generation";
import { worldPlayerKey } from "./identity";

/** Stands for the initial club of the free agent pool in player keys and attribute seeds; no club has this slug. */
export const FREE_AGENT_POOL_SLUG = "free-agents";

/** Stable key of a free agent of the initial pool in a save: « free-agents#12 ». */
export function freeAgentPlayerKey(squadSlot: number): string {
  return worldPlayerKey(FREE_AGENT_POOL_SLUG, squadSlot);
}

/**
 * Attributes of a free agent of the initial pool: an overall drawn from FREE_AGENT_POOL_OVERALL_MIN to _MAX, or
 * above up to FREE_AGENT_POOL_TOP_OVERALL_MAX for FREE_AGENT_POOL_TOP_SHARE of them, whatever the save seed, with
 * the attribute profile of the position moved to that overall. Pass the stream of
 * attributeRngSeed(save.seed, FREE_AGENT_POOL_SLUG, squadSlot).
 */
export function generateFreeAgentAttributes(player: PlayerProfile, rng: Rng): PlayerAttributes {
  const overall =
    rng() < FREE_AGENT_POOL_TOP_SHARE
      ? randomInt(rng, FREE_AGENT_POOL_OVERALL_MAX + 1, FREE_AGENT_POOL_TOP_OVERALL_MAX)
      : randomInt(rng, FREE_AGENT_POOL_OVERALL_MIN, FREE_AGENT_POOL_OVERALL_MAX);
  const drawn = generateAttributes(player, overall, rng);
  const attributes = shiftToOverall(player.position, drawn, overall);
  // The growth room drawn for his age is kept above the final overall.
  return { ...attributes, potential: clampRating(attributes.overall + drawn.potential - drawn.overall) };
}
