import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import {
  FREE_AGENT_POOL_OVERALL_MAX,
  FREE_AGENT_POOL_OVERALL_MIN,
  FREE_AGENT_POOL_TOP_OVERALL_MAX,
  FREE_AGENT_POOL_TOP_SHARE,
} from "./balance";
import { FREE_AGENT_POOL_SLUG, freeAgentPlayerKey, generateFreeAgentAttributes } from "./free-agents";
import { ATTRIBUTE_NAMES, attributeRngSeed, RATING_MAX, RATING_MIN, type Position } from "./generation";

const POSITIONS: Position[] = ["GK", "DF", "MF", "FW"];

/** Every position and age of the pool, over many save seeds. */
const sample = Array.from({ length: 2_000 }, (_, index) => {
  const position = POSITIONS[index % POSITIONS.length];
  const age = 24 + (index % 11);
  const attributes = generateFreeAgentAttributes(
    { position, age },
    makeRng(attributeRngSeed(`save-${index}`, FREE_AGENT_POOL_SLUG, (index % 120) + 1)),
  );
  return { position, age, ...attributes };
});

describe("generateFreeAgentAttributes", () => {
  it("is deterministic for the same stream", () => {
    const generate = () => generateFreeAgentAttributes({ position: "MF", age: 28 }, makeRng("save:attributes:free-agents:7"));
    expect(generate()).toEqual(generate());
  });

  it("rates every free agent 50 to 70, most of them no higher than 66", () => {
    const overalls = sample.map((player) => player.overall);
    const top = overalls.filter((overall) => overall > FREE_AGENT_POOL_OVERALL_MAX).length / overalls.length;

    expect(Math.min(...overalls)).toBe(FREE_AGENT_POOL_OVERALL_MIN);
    expect(Math.max(...overalls)).toBe(FREE_AGENT_POOL_TOP_OVERALL_MAX);
    expect(top).toBeGreaterThan(FREE_AGENT_POOL_TOP_SHARE - 0.03);
    expect(top).toBeLessThan(FREE_AGENT_POOL_TOP_SHARE + 0.03);
  });

  it("keeps attributes within 1–99, potential never below overall, and the profile of the position", () => {
    for (const player of sample) {
      for (const name of [...ATTRIBUTE_NAMES, "potential"] as const) {
        expect(player[name]).toBeGreaterThanOrEqual(RATING_MIN);
        expect(player[name]).toBeLessThanOrEqual(RATING_MAX);
      }
      expect(player.potential).toBeGreaterThanOrEqual(player.overall);
    }
    const keepers = sample.filter((player) => player.position === "GK");
    const outfield = sample.filter((player) => player.position !== "GK");
    const meanOf = (players: typeof sample, pick: (player: (typeof sample)[number]) => number) =>
      players.reduce((sum, player) => sum + pick(player), 0) / players.length;
    expect(meanOf(keepers, (player) => player.goalkeeping)).toBeGreaterThan(meanOf(outfield, (player) => player.goalkeeping) + 20);
  });

  it("gives the pool players a key built like a world player's", () => {
    expect(freeAgentPlayerKey(12)).toBe("free-agents#12");
  });
});
