import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { ageInYears } from "../lib/dates";
import { makeRng, randomInt } from "../lib/rng";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "./generation";
import { selectLineup, type Lineup } from "./lineup";
import { simulateMatch, type MatchResult } from "./match";
import { competitionTier } from "./tiers";
import { WORLD_START_DATE } from "./world";

const SAVE_SEED = "match-test";
const MATCH_COUNT = 10_000;

// The cup's calibration: knockout matches between random pairs of clubs of the same country, first and second
// divisions mixed as in a cup draw, every player at neutral form, one fixed seed per match. Measured when extra time
// was balanced (EXTRA_TIME_INTENSITY 1): 79.3 % decided in 90 minutes, 10.5 % in extra time, 10.2 % in a shoot-out,
// 0.88 goals per extra time, 73 % of kicks scored. With the engine in segments and more draws after 90 minutes
// (gameplay v1, G1): 76.7 % in 90 minutes, 11.2 % in extra time, 12.1 % in a shoot-out, 0.77 goals per extra time.
const plan = buildWorldPlan();
const countries = new Map<string, Lineup[]>();
for (const { competition, clubs } of plan) {
  const country = competition.code.split(".")[0];
  const lineups = clubs.map((club) =>
    selectLineup(
      club.players.map((player) => ({
        ...generateAttributes(
          { position: player.position, age: ageInYears(player.birthDate, WORLD_START_DATE) },
          clubLevelFromRank(club.initialRank, clubs.length, competitionTier(competition.tier)),
          makeRng(attributeRngSeed(SAVE_SEED, club.slug, player.squadSlot)),
        ),
        id: `${club.slug}#${player.squadSlot}`,
        position: player.position,
        form: 50,
        morale: 50,
        injured: false,
      })),
    ),
  );
  countries.set(country, [...(countries.get(country) ?? []), ...lineups]);
}

const results: MatchResult[] = (() => {
  const pools = [...countries.values()];
  const rng = makeRng("cup-pairs");
  return Array.from({ length: MATCH_COUNT }, (_, index) => {
    const clubs = pools[index % pools.length];
    const homeIndex = randomInt(rng, 0, clubs.length - 1);
    const awayIndex = (homeIndex + randomInt(rng, 1, clubs.length - 1)) % clubs.length;
    return simulateMatch(clubs[homeIndex], clubs[awayIndex], `cup:${index}`, undefined, true);
  });
})();
const share = (decidedBy: MatchResult["decidedBy"]) => results.filter((result) => result.decidedBy === decidedBy).length / MATCH_COUNT;

describe("cup calibration", () => {
  it("sends about one tie in eight to a shoot-out, and as many to extra time alone", () => {
    expect(share("PENALTIES")).toBeGreaterThan(0.08);
    expect(share("PENALTIES")).toBeLessThan(0.14);
    expect(share("EXTRA_TIME")).toBeGreaterThan(0.08);
    expect(share("EXTRA_TIME")).toBeLessThan(0.13);
  });

  it("scores about three kicks in four", () => {
    const kicks = results.flatMap((result) => result.events.filter((event) => event.period === "SHOOTOUT"));
    const scored = kicks.filter((kick) => kick.type === "SHOOTOUT_GOAL").length / kicks.length;
    expect(scored).toBeGreaterThan(0.7);
    expect(scored).toBeLessThan(0.78);
  });
});
