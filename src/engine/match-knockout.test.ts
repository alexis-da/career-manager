import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { ageInYears } from "../lib/dates";
import { makeRng } from "../lib/rng";
import { EXTRA_TIME_END_MINUTE, EXTRA_TIME_SUBSTITUTIONS, MAX_SUBSTITUTIONS, SHOOTOUT_KICKS } from "./balance";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "./generation";
import { selectLineup, type Lineup } from "./lineup";
import {
  applyAutomaticHalfTime,
  applyHalfTimeChoice,
  breakSubstitutionLimit,
  cupMatchRngSeed,
  finishKnockout,
  HalfTimeChoiceError,
  knockoutWinner,
  matchResult,
  matchRngSeed,
  playPeriod,
  shootoutChance,
  simulateMatch,
  startMatch,
  type MatchResult,
} from "./match";
import { competitionTier } from "./tiers";
import { WORLD_START_DATE } from "./world";

// Knockout matches between two clubs of the real world: a second division's middle and a first division's middle,
// close enough for many of them to go to extra time.
const plan = buildWorldPlan();
const lineupOf = (slug: string): Lineup => {
  for (const { competition, clubs } of plan) {
    const club = clubs.find((candidate) => candidate.slug === slug);
    if (club !== undefined) {
      return selectLineup(
        club.players.map((player) => ({
          ...generateAttributes(
            { position: player.position, age: ageInYears(player.birthDate, WORLD_START_DATE) },
            clubLevelFromRank(club.initialRank, clubs.length, competitionTier(competition.tier)),
            makeRng(attributeRngSeed("knockout-test", club.slug, player.squadSlot)),
          ),
          id: `${club.slug}#${player.squadSlot}`,
          position: player.position,
          form: 50,
          morale: 50,
          injured: false,
        })),
      );
    }
  }
  throw new Error(`No club ${slug}`);
};
const HOME = lineupOf("fc-metz");
const AWAY = lineupOf("toulouse-fc");

const knockout = (index: number): MatchResult => simulateMatch(HOME, AWAY, `knockout-test:${index}`, undefined, true);
const results = Array.from({ length: 400 }, (_, index) => knockout(index));
const ofKind = (decidedBy: MatchResult["decidedBy"]) => results.filter((result) => result.decidedBy === decidedBy);

describe("knockout matches", () => {
  it("always have a winner, decided in 90 minutes, in extra time or in a shoot-out", () => {
    expect(results.every((result) => ["home", "away"].includes(knockoutWinner(result)))).toBe(true);
    expect(ofKind("REGULATION").length).toBeGreaterThan(0);
    expect(ofKind("EXTRA_TIME").length).toBeGreaterThan(0);
    expect(ofKind("PENALTIES").length).toBeGreaterThan(0);
    for (const result of ofKind("REGULATION")) {
      expect(result.homeGoals).not.toBe(result.awayGoals);
      expect(result.events.some((event) => event.period !== undefined)).toBe(false);
    }
  });

  it("plays the same 90 minutes as a league match of the same seed, and only adds what follows", () => {
    for (let index = 0; index < 100; index++) {
      const league = simulateMatch(HOME, AWAY, `knockout-test:${index}`);
      const cup = knockout(index);
      const regular = cup.events.filter((event) => event.period === undefined);
      expect(regular).toEqual(league.events);
      if (cup.decidedBy === "REGULATION") {
        expect({ ...cup, decidedBy: undefined }).toEqual({ ...league, decidedBy: undefined });
      }
    }
  });

  it("plays extra time from 91' to 120', marked, with one more substitution at most", () => {
    for (const result of [...ofKind("EXTRA_TIME"), ...ofKind("PENALTIES")]) {
      const extra = result.events.filter((event) => event.period === "EXTRA_TIME");
      expect(extra.every((event) => event.minute >= 91 && event.minute <= EXTRA_TIME_END_MINUTE)).toBe(true);
      expect(result.fullTime).toBe(EXTRA_TIME_END_MINUTE);
      for (const side of ["home", "away"] as const) {
        const substitutions = result.events.filter((event) => event.type === "SUBSTITUTION" && event.side === side);
        expect(substitutions.length).toBeLessThanOrEqual(MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS);
      }
      // A starter who played the whole match is credited with 120 minutes.
      expect(Math.max(...result.appearances.map((appearance) => appearance.minutes))).toBe(EXTRA_TIME_END_MINUTE);
    }
    for (const result of ofKind("EXTRA_TIME")) {
      expect(result.homeGoals).not.toBe(result.awayGoals);
      expect(result.homePenalties).toBeUndefined();
    }
  });

  it("ends a shoot-out with a winner: five kicks each unless decided before, then one each, numbered from 1", () => {
    for (const result of ofKind("PENALTIES")) {
      const kicks = result.events.filter((event) => event.period === "SHOOTOUT");
      const scoredBy = (side: string) => kicks.filter((kick) => kick.side === side && kick.type === "SHOOTOUT_GOAL").length;
      const takenBy = (side: string) => kicks.filter((kick) => kick.side === side).length;

      expect(result.homeGoals).toBe(result.awayGoals);
      expect([scoredBy("home"), scoredBy("away")]).toEqual([result.homePenalties, result.awayPenalties]);
      expect(result.homePenalties).not.toBe(result.awayPenalties);
      expect(kicks.map((kick) => kick.minute)).toEqual(kicks.map((_, index) => index + 1));
      expect(Math.abs(takenBy("home") - takenBy("away"))).toBeLessThanOrEqual(1);
      if (takenBy("home") > SHOOTOUT_KICKS) {
        expect(takenBy("home")).toBe(takenBy("away")); // sudden death: both kick in each round
      }
      expect(kicks.every((kick) => kick.relatedPlayerId !== undefined)).toBe(true);
    }
  });

  it("bounds a kick's chance between 55 % and 90 %, around 75 % for ordinary players", () => {
    expect(shootoutChance(70, 70)).toBeCloseTo(0.75);
    expect(shootoutChance(95, 40)).toBe(0.9);
    expect(shootoutChance(30, 95)).toBe(0.55);
    expect(shootoutChance(85, 70)).toBeGreaterThan(shootoutChance(60, 70));
    expect(shootoutChance(70, 85)).toBeLessThan(shootoutChance(70, 60));
  });

  it("is the same for the same seed", () => {
    expect(knockout(7)).toEqual(results[7]);
  });

  it("stops a level tie at the end of regulation time, where a team may make one more substitution than at half-time", () => {
    // The first seed of the 400 whose tie is level after 90 minutes, played as the live match plays it.
    const index = results.findIndex((result) => result.decidedBy !== "REGULATION");
    const seed = `knockout-test:${index}`;
    const halfTime = playPeriod(startMatch(HOME, AWAY, undefined, true), seed, "h1");
    const regulationEnd = playPeriod(applyAutomaticHalfTime(halfTime), seed, "h2");
    expect(regulationEnd.phase).toBe("REGULATION_END");
    expect(breakSubstitutionLimit(halfTime)).toBe(MAX_SUBSTITUTIONS);
    expect(breakSubstitutionLimit(regulationEnd)).toBe(MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS);

    // No change at the break: the very match played without a pause.
    expect(matchResult(finishKnockout(regulationEnd, seed))).toEqual(results[index]);

    // A substitution at the break: on at 91', in extra time; the player going off leaves at 90'.
    const team = regulationEnd.home;
    const [incoming] = team.bench;
    const leaving = team.pitch.find((entry) => entry.status === "ON" && entry.slot !== "GK");
    if (incoming === undefined || leaving === undefined) {
      throw new Error("No substitution possible in this match");
    }
    const starters = team.pitch
      .filter((entry) => entry.status === "ON")
      .map((entry) => ({ slot: entry.index, playerKey: entry === leaving ? incoming.id : entry.player.id }));
    const changed = applyHalfTimeChoice(regulationEnd, "home", {
      formation: team.formation,
      starters,
      substitutions: [{ in: incoming.id, out: leaving.player.id }],
    });
    expect(changed.events.at(-1)).toEqual({
      minute: 91,
      side: "home",
      type: "SUBSTITUTION",
      playerId: incoming.id,
      relatedPlayerId: leaving.player.id,
      period: "EXTRA_TIME",
    });
    const played = matchResult(finishKnockout(changed, seed));
    expect(played.appearances.find((appearance) => appearance.playerId === leaving.player.id)?.to).toBe(90);
    expect(played.appearances.find((appearance) => appearance.playerId === incoming.id)?.minutes).toBe(30);

    // Beyond the break's limit, and at no other phase.
    const tooMany = { ...regulationEnd, home: { ...team, substitutions: MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS } };
    expect(() =>
      applyHalfTimeChoice(tooMany, "home", { formation: team.formation, starters, substitutions: [{ in: incoming.id, out: leaving.player.id }] }),
    ).toThrow(HalfTimeChoiceError);
    expect(() => applyHalfTimeChoice(finishKnockout(regulationEnd, seed), "home", { formation: team.formation, starters, substitutions: [] })).toThrow(
      HalfTimeChoiceError,
    );
  });

  it("gives a cup tie a seed of its own, apart from the league match of the same round", () => {
    expect(cupMatchRngSeed("save", 2026, 3, "a", "b")).not.toBe(matchRngSeed("save", 2026, 3, "a", "b"));
  });
});
