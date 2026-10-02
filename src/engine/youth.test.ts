import { describe, expect, it } from "vitest";
import { ageInYears } from "../lib/dates";
import { makeRng } from "../lib/rng";
import { YOUTH_OVERALL_MAX, YOUTH_OVERALL_MIN, YOUTH_POTENTIAL_GAP_MIN } from "./balance";
import { ATTRIBUTE_NAMES, RATING_MAX, RATING_MIN } from "./generation";
import { squadTemplate, type Position } from "./positions";
import { NAME_BANK } from "./names";
import { generateYouthPlayer, youthPlayerKey, youthPositions, youthRngSeed } from "./youth";
import { seasonStartDate } from "./world";

const START_YEAR = 2025;

const youngster = (reputation: number, index: number, position: Position = "CM") =>
  generateYouthPlayer(
    {
      club: { slug: `club-${reputation}`, country: "France", reputation },
      position,
      startYear: START_YEAR,
      index,
      takenNames: new Set(),
    },
    NAME_BANK,
    makeRng(youthRngSeed("youth-test", START_YEAR, `club-${reputation}`, index)),
  );

const batch = (reputation: number, count = 500) => Array.from({ length: count }, (_, index) => youngster(reputation, index + 1));

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe("generateYouthPlayer", () => {
  it("is deterministic for the same seed", () => {
    expect(youngster(70, 1)).toEqual(youngster(70, 1));
    expect(youngster(70, 1)).not.toEqual(youngster(70, 2));
  });

  it("arrives on 1 July aged 16 to 18, rated 45 to 60 with a potential at least 15 higher", () => {
    const violations: string[] = [];
    for (const reputation of [55, 70, 90]) {
      for (const player of batch(reputation)) {
        const age = ageInYears(player.birthDate, seasonStartDate(START_YEAR));
        if (age < 16 || age > 18) {
          violations.push(`${player.key}: age ${age}`);
        }
        if (player.overall < YOUTH_OVERALL_MIN || player.overall > YOUTH_OVERALL_MAX) {
          violations.push(`${player.key}: overall ${player.overall}`);
        }
        if (player.potential < Math.min(RATING_MAX, player.overall + YOUTH_POTENTIAL_GAP_MIN)) {
          violations.push(`${player.key}: potential ${player.potential} for overall ${player.overall}`);
        }
        for (const name of ATTRIBUTE_NAMES) {
          if (player[name] < RATING_MIN || player[name] > RATING_MAX) {
            violations.push(`${player.key}: ${name} ${player[name]}`);
          }
        }
        if (player.contractUntil.toISOString() !== "2028-06-30T00:00:00.000Z" || player.wage <= 0) {
          violations.push(`${player.key}: contract until ${player.contractUntil.toISOString()}, wage ${player.wage}`);
        }
      }
    }

    expect(violations.slice(0, 10)).toEqual([]);
  });

  it("is better at a more reputed club", () => {
    expect(mean(batch(90).map((player) => player.overall))).toBeGreaterThan(
      mean(batch(55).map((player) => player.overall)) + 8,
    );
  });

  it("holds the nationality of the club's country about 85 % of the time", () => {
    const players = batch(70, 2_000);
    const share = players.filter((player) => player.nationality === "France").length / players.length;

    expect(share).toBeGreaterThan(0.81);
    expect(share).toBeLessThan(0.89);
  });

  it("gets a stable key built from the season, the club and the rank", () => {
    expect(youngster(70, 2).key).toBe(youthPlayerKey(START_YEAR, "club-70", 2));
    expect(youthPlayerKey(2025, "olympique-lyonnais", 1)).toBe("youth:2025:olympique-lyonnais:1");
  });
});

describe("youthPositions", () => {
  const TEMPLATE = squadTemplate(23);

  /** The squad template without the given players (one entry per player removed). */
  const without = (...removed: Position[]): Position[] => {
    const squad = [...TEMPLATE];
    for (const position of removed) {
      squad.splice(squad.indexOf(position), 1);
    }
    return squad;
  };

  it("makes the first young player a goalkeeper when the squad has fewer than 2", () => {
    expect(youthPositions(without("GK"))[0]).toBe("GK");
    expect(youthPositions(without("GK", "GK"))).toEqual(["GK", "GK"]);
  });

  it("otherwise fills the roles furthest below the template, at their least filled position", () => {
    expect(youthPositions(without("CM", "CM"))).toEqual(["CM", "CM"]);
    expect(youthPositions(without("LB", "ST"))).toEqual(["LB", "ST"]);
    // RM and RW share a role: the missing winger comes back, then the largest role takes the next one.
    expect(youthPositions(without("RW"))).toEqual(["RW", "CB"]);
  });

  it("sends young players to the largest roles when the squad is complete", () => {
    expect(youthPositions(TEMPLATE)).toEqual(["CB", "CM"]);
  });
});
