import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { ageInYears } from "../lib/dates";
import { makeRng } from "../lib/rng";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "./generation";
import { selectLineup, type Lineup } from "./lineup";
import { matchRngSeed, simulateMatch } from "./match";
import { generateBalancedSchedule } from "./schedule";
import { competitionTier } from "./tiers";
import { firstMatchdayDate, WORLD_START_DATE } from "./world";

// A whole league matchday of the real world (round 1 of the ten competitions, 99 matches), every event and score
// reduced to a digest. Pinned before the cup's extra time and shoot-out: a league match must stay exactly the same,
// draw for draw, whatever the knockout matches add after the 90th minute.
const SAVE_SEED = "match-fingerprint";

const lineups = new Map<string, Lineup>();
const plan = buildWorldPlan();
for (const { competition, clubs } of plan) {
  for (const club of clubs) {
    lineups.set(
      club.slug,
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
  }
}

const lineupOf = (slug: string): Lineup => {
  const lineup = lineups.get(slug);
  if (lineup === undefined) {
    throw new Error(`No lineup for ${slug}`);
  }
  return lineup;
};

describe("league match fingerprint", () => {
  it("plays a league matchday exactly as before the cup", () => {
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
          result: simulateMatch(lineupOf(match.home), lineupOf(match.away), matchRngSeed(SAVE_SEED, 2026, 1, match.home, match.away)),
        })),
    );

    expect(results).toHaveLength(99);
    expect(createHash("sha256").update(JSON.stringify(results)).digest("hex")).toBe("b94ef8f432d6ee55a6659631260b13c3fc51d0ddf1a3095fd67146251881e593");
  });
});
