import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { ageInYears } from "../lib/dates";
import { makeRng } from "../lib/rng";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "./generation";
import { chooseFormation } from "./formation-choice";
import type { FormationName } from "./formations";
import type { Lineup } from "./lineup";
import { matchRngSeed, simulateMatch } from "./match";
import { generateBalancedSchedule } from "./schedule";
import { competitionTier } from "./tiers";
import { firstMatchdayDate, WORLD_START_DATE } from "./world";

// A whole league matchday of the real world (round 1 of the ten competitions, 99 matches), every event and score
// reduced to a digest. Pinned with the engine in segments of gameplay v1 (G1, docs/design/gameplay-v1.md), pinned again
// with the formations AI clubs choose (gameplay v2, V1: chooseFormation, the goals' base recalibrated): a league match
// must stay exactly the same, draw for draw, until a change of the engine means to change it, and pins it again.
const SAVE_SEED = "match-fingerprint";

const lineups = new Map<string, { formation: FormationName; lineup: Lineup }>();
const plan = buildWorldPlan();
for (const { competition, clubs } of plan) {
  for (const club of clubs) {
    lineups.set(
      club.slug,
      chooseFormation(
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
          fitness: 100,
          injured: false,
        })),
        competitionTier(competition.tier),
      ),
    );
  }
}

const lineupOf = (slug: string): { formation: FormationName; lineup: Lineup } => {
  const lineup = lineups.get(slug);
  if (lineup === undefined) {
    throw new Error(`No lineup for ${slug}`);
  }
  return lineup;
};

describe("league match fingerprint", () => {
  it("plays a league matchday exactly as pinned", () => {
    const results = plan.flatMap(({ competition, clubs }) =>
      generateBalancedSchedule(
        clubs.map((club) => club.slug).sort(),
        firstMatchdayDate(2026),
        makeRng(`${SAVE_SEED}:${competition.code}`),
      )
        .filter((match) => match.round === 1)
        .map((match) => ({
          code: competition.code,
          home: match.home,
          away: match.away,
          result: simulateMatch(lineupOf(match.home).lineup, lineupOf(match.away).lineup, matchRngSeed(SAVE_SEED, 2026, 1, match.home, match.away), {
            home: lineupOf(match.home).formation,
            away: lineupOf(match.away).formation,
          }),
        })),
    );

    expect(results).toHaveLength(99);
    // The instructions each team played, kept with the result since the match feed tells their changes, are pinned
    // apart: without them, the matchday is the very one pinned before.
    const draws = results.map((match) => ({ ...match, result: { ...match.result, instructions: undefined } }));
    expect(createHash("sha256").update(JSON.stringify(draws)).digest("hex")).toBe("bd13f5e4e8dc91e4d944197193399155dd8e42373ba7fc4534da09f3085b48e2");
    expect(createHash("sha256").update(JSON.stringify(results)).digest("hex")).toBe("9086ae996683d25db0667b05c7ff9b6882b6ebfb546642098bbea3311966bc1e");
  });
});
