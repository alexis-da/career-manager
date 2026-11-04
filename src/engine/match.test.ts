import { describe, expect, it } from "vitest";
import { buildWorldPlan } from "../../prisma/seed/seed";
import { ageInYears } from "../lib/dates";
import { makeRng, randomInt } from "../lib/rng";
import {
  FORMATION_PROFILES,
  HALF_TIME_MINUTE,
  INSTRUCTION_EFFECTS,
  MAX_STOPPAGE_MINUTES,
  MAX_SUBSTITUTIONS,
  REGULATION_MINUTES,
  SEGMENT_MINUTES,
} from "./balance";
import { formationPositions } from "./formations";
import { attributeRngSeed, clubLevelFromRank, generateAttributes } from "./generation";
import { selectLineup, type Lineup, type SquadPlayer } from "./lineup";
import {
  applyAutomaticHalfTime,
  assistantInstruction,
  eventsToPersist,
  applyHalfTimeChoice,
  automaticHalfTimeChoice,
  fitnessAt,
  HalfTimeChoiceError,
  liveStrength,
  matchResult,
  nextForm,
  playerMatchStats,
  playPeriod,
  simulateMatch,
  simulateSegment,
  startMatch,
  stateExpectedGoals,
  type HalfTimeChoice,
  type Instruction,
  type MatchResult,
  type MatchState,
  type Outcome,
  type Segment,
} from "./match";
import { ratingAt } from "./positions";
import { expectedGoals, formationStrength, teamStrength } from "./strength";
import { WORLD_START_DATE } from "./world";

const SAVE_SEED = "match-test";
const MATCH_COUNT = 10_000;

// The real 2024-25 first divisions, with attributes generated for one save and every player at neutral form: the
// calibration below is the one of the first divisions, as before the second ones.
const competitions = buildWorldPlan()
  .filter(({ competition }) => competition.tier === 1)
  .map(({ competition, clubs }) => ({
  code: competition.code,
  clubs: clubs.map((club) => ({
    slug: club.slug,
    lineup: selectLineup(
      club.players.map(
        (player): SquadPlayer => ({
          ...generateAttributes(
            { position: player.position, age: ageInYears(player.birthDate, WORLD_START_DATE) },
            clubLevelFromRank(club.initialRank, clubs.length, 1),
            makeRng(attributeRngSeed(SAVE_SEED, club.slug, player.squadSlot)),
          ),
          id: `${club.slug}#${player.squadSlot}`,
          position: player.position,
          form: 50,
          morale: 50,
          fitness: 100,
          injured: false,
        }),
      ),
    ),
  })),
}));

function lineupOf(slug: string): Lineup {
  const club = competitions.flatMap((competition) => competition.clubs).find((candidate) => candidate.slug === slug);
  if (club === undefined) {
    throw new Error(`Unknown club ${slug}`);
  }
  return club.lineup;
}

/** League matches between random pairs of clubs of the same competition, one fixed seed per match. */
const leagueResults: MatchResult[] = (() => {
  const rng = makeRng("league-pairs");
  return Array.from({ length: MATCH_COUNT }, (_, index) => {
    const { clubs } = competitions[index % competitions.length];
    const homeIndex = randomInt(rng, 0, clubs.length - 1);
    const awayIndex = (homeIndex + randomInt(rng, 1, clubs.length - 1)) % clubs.length;
    return simulateMatch(clubs[homeIndex].lineup, clubs[awayIndex].lineup, `league:${index}`);
  });
})();

/** Bayern against Monza, alternating home and away. */
const bayernMonza = Array.from({ length: MATCH_COUNT }, (_, index) => {
  const bayernAtHome = index % 2 === 0;
  const [home, away] = bayernAtHome
    ? [lineupOf("fc-bayern-munchen"), lineupOf("ac-monza")]
    : [lineupOf("ac-monza"), lineupOf("fc-bayern-munchen")];
  return { bayernAtHome, result: simulateMatch(home, away, `bayern-monza:${index}`) };
});

describe("simulateMatch", () => {
  it("gives the same match sheet for the same seed", () => {
    const play = (seed: string) => simulateMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc"), seed);

    expect(play("same")).toEqual(play("same"));
    expect(play("same")).not.toEqual(play("other"));
  });

  it("averages 2.5 to 2.8 goals per match over 10 000 league matches", () => {
    const goals = leagueResults.reduce((sum, result) => sum + result.homeGoals + result.awayGoals, 0);

    expect(goals / MATCH_COUNT).toBeGreaterThanOrEqual(2.5);
    expect(goals / MATCH_COUNT).toBeLessThanOrEqual(2.8);
  });

  it("gives the home team 42 to 46 % of wins", () => {
    const homeWins = leagueResults.filter((result) => result.homeGoals > result.awayGoals).length;

    expect(homeWins / MATCH_COUNT).toBeGreaterThanOrEqual(0.42);
    expect(homeWins / MATCH_COUNT).toBeLessThanOrEqual(0.46);
  });

  it("ends 23 to 27 % of matches level", () => {
    const draws = leagueResults.filter((result) => result.homeGoals === result.awayGoals).length;

    expect(draws / MATCH_COUNT).toBeGreaterThanOrEqual(0.23);
    expect(draws / MATCH_COUNT).toBeLessThanOrEqual(0.27);
  });

  it("scores more late in a match: 12 to 16 % of the goals in the first quarter of an hour, 19 to 23 % in the last", () => {
    const quarters = [0, 0, 0, 0, 0, 0];
    for (const event of leagueResults.flatMap((result) => result.events)) {
      if (event.type === "GOAL") {
        // Stoppage time goes with the last quarter of an hour.
        quarters[Math.min(5, Math.floor((Math.min(event.minute, REGULATION_MINUTES) - 1) / SEGMENT_MINUTES))]++;
      }
    }
    const goals = quarters.reduce((sum, count) => sum + count, 0);
    const shares = quarters.map((count) => count / goals);

    expect(shares[0]).toBeGreaterThanOrEqual(0.12);
    expect(shares[0]).toBeLessThanOrEqual(0.16);
    expect(shares[5]).toBeGreaterThanOrEqual(0.19);
    expect(shares[5]).toBeLessThanOrEqual(0.23);
    // No dip on the way: each quarter of an hour scores at least about as much as the one before.
    shares.slice(1).forEach((share, index) => expect(share).toBeGreaterThan(shares[index] - 0.005));
  });

  it("lets Bayern beat Monza in more than 75 % of 10 000 matches", () => {
    const bayernWins = bayernMonza.filter(({ bayernAtHome, result }) =>
      bayernAtHome ? result.homeGoals > result.awayGoals : result.awayGoals > result.homeGoals,
    ).length;

    expect(bayernWins / MATCH_COUNT).toBeGreaterThan(0.75);
  });

  it("keeps scores, minutes, scorers and appearances consistent", () => {
    const violations: string[] = [];
    [...leagueResults, ...bayernMonza.map(({ result }) => result)].forEach((result, index) => {
      const report = (message: string) => violations.push(`match ${index}: ${message}`);
      const onPitch = (playerId: string, side: string, minute: number) =>
        result.appearances.some(
          (appearance) =>
            appearance.playerId === playerId &&
            appearance.side === side &&
            appearance.from < minute &&
            minute <= appearance.to,
        );

      if (result.fullTime < REGULATION_MINUTES || result.fullTime > REGULATION_MINUTES + MAX_STOPPAGE_MINUTES) {
        report(`final whistle at ${result.fullTime}`);
      }
      for (const [side, goals] of [["home", result.homeGoals], ["away", result.awayGoals]] as const) {
        const goalEvents = result.events.filter((event) => event.type === "GOAL" && event.side === side).length;
        if (!Number.isInteger(goals) || goals < 0 || goalEvents !== goals) {
          report(`${side} scored ${goals} with ${goalEvents} goal events`);
        }
        const players = result.appearances.filter((appearance) => appearance.side === side);
        if (players.filter((appearance) => appearance.from === 0).length !== 11) {
          report(`${side} did not start with 11 players`);
        }
        if (players.length > 11 + MAX_SUBSTITUTIONS) {
          report(`${side} used ${players.length} players`);
        }
        const substitutions = result.events.filter((event) => event.type === "SUBSTITUTION" && event.side === side).length;
        if (substitutions > MAX_SUBSTITUTIONS) {
          report(`${side} made ${substitutions} substitutions`);
        }
        const halfTimeGoals = side === "home" ? result.homeHalfTimeGoals : result.awayHalfTimeGoals;
        const firstHalfGoals = result.events.filter(
          (event) => event.type === "GOAL" && event.side === side && event.minute <= HALF_TIME_MINUTE,
        ).length;
        if (halfTimeGoals !== firstHalfGoals || halfTimeGoals > goals) {
          report(`${side} led ${halfTimeGoals} at half-time with ${firstHalfGoals} first-half goals`);
        }
      }
      for (const event of result.events) {
        if (!Number.isInteger(event.minute) || event.minute < 1 || event.minute > result.fullTime) {
          report(`${event.type} at minute ${event.minute}`);
        }
        if (event.type === "GOAL") {
          for (const playerId of [event.playerId, event.relatedPlayerId]) {
            if (playerId !== undefined && !onPitch(playerId, event.side, event.minute)) {
              report(`goal involving ${playerId} off the pitch at ${event.minute}`);
            }
          }
          if (event.relatedPlayerId === event.playerId) {
            report(`${event.playerId} assisted their own goal`);
          }
        }
        if (event.type === "SUBSTITUTION" && event.relatedPlayerId === undefined) {
          report(`substitution at ${event.minute} without the player going off`);
        }
      }
      for (const appearance of result.appearances) {
        if (appearance.minutes < 1 || appearance.minutes > REGULATION_MINUTES || appearance.to < appearance.from) {
          report(`${appearance.playerId} played ${appearance.minutes} minutes`);
        }
      }
    });

    expect(violations.slice(0, 10)).toEqual([]);
  });

  it("produces cards, injuries and substitutions, but rarely red cards and injuries", () => {
    const count = (type: string) =>
      leagueResults.reduce((sum, result) => sum + result.events.filter((event) => event.type === type).length, 0) /
      MATCH_COUNT;

    expect(count("YELLOW_CARD")).toBeGreaterThan(2);
    expect(count("RED_CARD")).toBeLessThan(0.3);
    expect(count("INJURY")).toBeLessThan(0.5);
    expect(count("SUBSTITUTION")).toBeGreaterThan(4);
  });
});

describe("eventsToPersist", () => {
  // A match with every kind of event: goals with and without an assist, cards, an injury, substitutions.
  const full = leagueResults.find((result) => {
    const types = new Set(result.events.map((event) => event.type));
    const goals = result.events.filter((event) => event.type === "GOAL");
    return (
      types.size === 5 &&
      goals.some((event) => event.relatedPlayerId === undefined) &&
      goals.some((event) => event.relatedPlayerId !== undefined)
    );
  });

  it("keeps every event of a match of the managed club", () => {
    if (full === undefined) {
      throw new Error("No match with every kind of event");
    }
    expect(eventsToPersist(full.events, true)).toEqual(full.events);
  });

  it("keeps only the goals of another match, with their assists, in match order", () => {
    if (full === undefined) {
      throw new Error("No match with every kind of event");
    }
    const kept = eventsToPersist(full.events, false);

    expect(kept).toEqual(full.events.filter((event) => event.type === "GOAL"));
    expect(kept.length).toBe(full.homeGoals + full.awayGoals);
    expect(kept.some((event) => event.relatedPlayerId !== undefined)).toBe(true);
  });

  it("changes neither the match nor its stats, computed from every event", () => {
    if (full === undefined) {
      throw new Error("No match with every kind of event");
    }
    const before = structuredClone(full);
    const stats = playerMatchStats(full);
    eventsToPersist(full.events, false);

    expect(full).toEqual(before);
    expect(playerMatchStats(full)).toEqual(stats);
    expect(stats.reduce((sum, player) => sum + player.yellowCards, 0)).toBe(
      full.events.filter((event) => event.type === "YELLOW_CARD").length,
    );
  });
});

describe("nextForm", () => {
  it("rises for a winning scorer, falls after a defeat, drifts to neutral without playing", () => {
    const stats = { playerId: "p", side: "home" as const, minutes: 90, goals: 1, assists: 0, yellowCards: 0, redCards: 0 };

    expect(nextForm(60, stats, "win")).toBeGreaterThan(60);
    expect(nextForm(60, { ...stats, goals: 0 }, "loss")).toBeLessThan(60);
    // 59, then 94 % of its gap to neutral.
    expect(nextForm(60, undefined, "win")).toBe(58);
    expect(nextForm(99, { ...stats, goals: 3 }, "win")).toBe(99);
  });

  it("keeps a whole season of the same result away from the bounds", () => {
    const starter = { playerId: "p", side: "home" as const, minutes: 90, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
    const season = (outcome: Outcome, stats = starter): number =>
      Array.from({ length: 38 }).reduce<number>((form) => nextForm(form, stats, outcome), 50);

    expect(season("win")).toBe(74);
    expect(season("loss")).toBe(27);
    expect(season("draw")).toBe(50);
    expect(season("win", { ...starter, goals: 1 })).toBeLessThan(99);
  });

  it("is fed by the stats of the match, assists coming from the goal events", () => {
    const result = leagueResults.find((candidate) => candidate.homeGoals + candidate.awayGoals >= 3);
    if (result === undefined) {
      throw new Error("No match with 3 goals or more");
    }
    const stats = playerMatchStats(result);
    const goals = result.events.filter((event) => event.type === "GOAL");

    expect(stats).toHaveLength(result.appearances.length);
    expect(stats.reduce((sum, player) => sum + player.goals, 0)).toBe(goals.length);
    expect(stats.reduce((sum, player) => sum + player.assists, 0)).toBe(
      goals.filter((goal) => goal.relatedPlayerId !== undefined).length,
    );
  });
});

describe("a match in two halves", () => {
  const firstHalf = (seed: string): MatchState =>
    playPeriod(startMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc")), seed, "h1");
  const secondHalf = (state: MatchState, seed: string): MatchResult => matchResult(playPeriod(state, seed, "h2"));
  const seeds = (count: number, prefix: string): string[] => Array.from({ length: count }, (_, index) => `${prefix}:${index}`);

  /** A first half after which the home side still has its eleven, for half-time choices built by hand. */
  const intactFirstHalf = (prefix: string): { seed: string; state: MatchState } => {
    for (const seed of seeds(100, prefix)) {
      const state = firstHalf(seed);
      if (state.home.pitch.every((entry) => entry.status === "ON")) {
        return { seed, state };
      }
    }
    throw new Error("No first half without a home injury or red card");
  };

  /** The home side's eleven as it is, as half-time starters. */
  const homeStarters = (state: MatchState): HalfTimeChoice["starters"] =>
    state.home.pitch.filter((entry) => entry.status === "ON").map((entry) => ({ slot: entry.index, playerKey: entry.player.id }));

  /** Home's striker (slot 9 of the 4-3-3) off, its backup goalkeeper on in his place: a much weaker attack. */
  const goalkeeperUpFront = (state: MatchState): HalfTimeChoice => {
    const striker = state.home.pitch.find((entry) => entry.index === 9);
    const goalkeeper = state.home.bench.find((player) => player.position === "GK");
    if (striker === undefined || goalkeeper === undefined) {
      throw new Error("No striker or backup goalkeeper");
    }
    return {
      formation: state.home.formation,
      starters: homeStarters(state).map((starter) => (starter.slot === 9 ? { slot: 9, playerKey: goalkeeper.id } : starter)),
      substitutions: [{ in: goalkeeper.id, out: striker.player.id }],
    };
  };

  /** The home side with the player of a slot gone off, injured or sent off. */
  const withHomeSlot = (state: MatchState, index: number, status: "INJURED" | "SENT_OFF"): MatchState => ({
    ...state,
    home: { ...state.home, pitch: state.home.pitch.map((entry) => (entry.index === index ? { ...entry, status } : entry)) },
  });

  const issueOf = (play: () => unknown): string | undefined => {
    try {
      play();
    } catch (error) {
      if (error instanceof HalfTimeChoiceError) {
        return error.issue;
      }
      throw error;
    }
    return undefined;
  };

  it("plays a whole match as the first half, the automatic half-time changes and the second half", () => {
    for (const seed of seeds(50, "halves")) {
      const halfTime = firstHalf(seed);
      const result = secondHalf(applyAutomaticHalfTime(halfTime), seed);

      expect(result).toEqual(simulateMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc"), seed));
      expect(halfTime.phase).toBe("HALF_TIME");
      expect(halfTime.events.every((event) => event.minute >= 1 && event.minute <= HALF_TIME_MINUTE)).toBe(true);
      expect(result.events.slice(halfTime.events.length).every((event) => event.minute > HALF_TIME_MINUTE)).toBe(true);
      expect([result.homeHalfTimeGoals, result.awayHalfTimeGoals]).toEqual([halfTime.home.goals, halfTime.away.goals]);
    }
  });

  it("replays the same second half from a half-time state stored as JSON", () => {
    for (const seed of seeds(20, "stored")) {
      const halfTime = firstHalf(seed);
      const stored: MatchState = JSON.parse(JSON.stringify(halfTime));

      expect(stored).toEqual(halfTime);
      expect(secondHalf(applyAutomaticHalfTime(stored), seed)).toEqual(secondHalf(applyAutomaticHalfTime(halfTime), seed));
    }
  });

  it("changes the second half with a half-time substitution, the same way at every replay", () => {
    const { seed, state } = intactFirstHalf("substitution");
    const choice = goalkeeperUpFront(state);
    const changed = applyHalfTimeChoice(state, "home", choice);
    const [substitution] = choice.substitutions;

    expect(changed.events.at(-1)).toEqual({
      minute: HALF_TIME_MINUTE + 1,
      side: "home",
      type: "SUBSTITUTION",
      playerId: substitution.in,
      relatedPlayerId: substitution.out,
    });
    expect(changed.home.substitutions).toBe(1);
    expect(liveStrength(changed.home, HALF_TIME_MINUTE).attack).toBeLessThan(liveStrength(state.home, HALF_TIME_MINUTE).attack);
    expect(secondHalf(changed, seed)).toEqual(secondHalf(applyHalfTimeChoice(state, "home", choice), seed));

    const striker = secondHalf(changed, seed).appearances.find((appearance) => appearance.playerId === substitution.out);
    expect(striker).toMatchObject({ from: 0, to: HALF_TIME_MINUTE, minutes: HALF_TIME_MINUTE });

    // Over many second halves from the same break, the weaker attack scores less.
    const goals = (from: MatchState) =>
      seeds(2000, "second-halves").reduce((sum, second) => sum + secondHalf(from, second).homeGoals - from.home.goals, 0);
    expect(goals(applyAutomaticHalfTime(changed, ["away"]))).toBeLessThan(goals(applyAutomaticHalfTime(state)));
    // 4 000 second halves: longer than the default 5 s while other files run.
  }, 30_000);

  it("moves players between slots for free, and switches formation", () => {
    const { state } = intactFirstHalf("moves");
    const starters = homeStarters(state);
    const swapped = starters.map((starter) =>
      starter.slot === 6 ? { ...starter, slot: 7 } : starter.slot === 7 ? { ...starter, slot: 6 } : starter,
    );
    const moved = applyHalfTimeChoice(state, "home", { formation: state.home.formation, starters: swapped, substitutions: [] });

    expect(moved.home.substitutions).toBe(0);
    expect(moved.events).toEqual(state.events);
    expect(moved.home.pitch.find((entry) => entry.index === 6)?.player.id).toBe(state.home.pitch[7].player.id);

    const fourFourTwo = applyHalfTimeChoice(state, "home", { formation: "4-4-2", starters, substitutions: [] });
    expect(fourFourTwo.home.formation).toBe("4-4-2");
    expect(fourFourTwo.home.pitch.map((entry) => entry.slot)).toEqual(["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"]);
    expect(fourFourTwo.home.pitch.every((entry) => entry.from === 0)).toBe(true);
  });

  it("plays a team down to ten weaker, its sent-off player's slot left empty and never filled", () => {
    const { seed, state } = intactFirstHalf("ten");
    const sentOff = withHomeSlot(state, 7, "SENT_OFF");
    const full = { home: liveStrength(state.home, HALF_TIME_MINUTE), away: liveStrength(state.away, HALF_TIME_MINUTE) };
    const ten = liveStrength(sentOff.home, HALF_TIME_MINUTE);

    expect(ten.attack).toBeLessThan(full.home.attack);
    expect(ten.defense).toBeLessThan(full.home.defense);
    expect(expectedGoals(full.away, ten, 1)).toBeGreaterThan(expectedGoals(full.away, full.home, 1));

    const automatic = automaticHalfTimeChoice(sentOff, "home");
    expect(automatic.substitutions).toEqual([]);
    expect(automatic.starters.map((starter) => starter.slot)).not.toContain(7);

    const cm = state.home.pitch[7].player.id;
    const resumed = secondHalf(applyAutomaticHalfTime(sentOff), seed);
    expect(resumed.events.some((event) => event.relatedPlayerId === cm && event.type === "SUBSTITUTION")).toBe(false);

    const substitute = sentOff.home.bench[1].id;
    const starters = homeStarters(sentOff);
    expect(
      issueOf(() =>
        applyHalfTimeChoice(sentOff, "home", {
          formation: sentOff.home.formation,
          starters: [...starters, { slot: 7, playerKey: substitute }],
          substitutions: [{ in: substitute, out: cm }],
        }),
      ),
    ).toBe("sent-off-player");
    expect(
      issueOf(() =>
        applyHalfTimeChoice(sentOff, "home", {
          formation: sentOff.home.formation,
          starters: starters.map((starter) => (starter.slot === 6 ? { ...starter, slot: 7 } : starter)),
          substitutions: [],
        }),
      ),
    ).toBe("sent-off-slot");

    // Over many second halves, ten score less and concede more than eleven.
    const totals = (from: MatchState) =>
      seeds(2000, "ten-halves").reduce(
        (sum, second) => {
          const result = secondHalf(applyAutomaticHalfTime(from), second);
          return {
            scored: sum.scored + result.homeGoals - from.home.goals,
            conceded: sum.conceded + result.awayGoals - from.away.goals,
          };
        },
        { scored: 0, conceded: 0 },
      );
    const withTen = totals(sentOff);
    const withEleven = totals(state);
    expect(withTen.scored).toBeLessThan(withEleven.scored);
    expect(withTen.conceded).toBeGreaterThan(withEleven.conceded);
    // 4 000 second halves: longer than the default 5 s while other files run.
  }, 30_000);

  it("allows five substitutions in a match, half-time ones included", () => {
    const { seed, state } = intactFirstHalf("five");
    const outfield = state.home.pitch.filter((entry) => entry.slot !== "GK");
    const substitutes = state.home.bench.filter((player) => player.position !== "GK");
    const choiceWith = (count: number): HalfTimeChoice => {
      const changes = substitutes.slice(0, count).map((player, index) => ({ in: player.id, out: outfield[index].player.id }));
      const replaced = new Map(changes.map((change) => [change.out, change.in]));
      return {
        formation: state.home.formation,
        starters: homeStarters(state).map((starter) => ({ ...starter, playerKey: replaced.get(starter.playerKey) ?? starter.playerKey })),
        substitutions: changes,
      };
    };

    expect(substitutes.length).toBeGreaterThanOrEqual(MAX_SUBSTITUTIONS + 1);
    expect(issueOf(() => applyHalfTimeChoice(state, "home", choiceWith(MAX_SUBSTITUTIONS + 1)))).toBe("too-many-substitutions");

    const allUsed = applyAutomaticHalfTime(applyHalfTimeChoice(state, "home", choiceWith(MAX_SUBSTITUTIONS)), ["away"]);
    for (const second of [seed, ...seeds(300, "five-halves")]) {
      const homeSubstitutions = secondHalf(allUsed, second).events.filter(
        (event) => event.type === "SUBSTITUTION" && event.side === "home",
      );
      expect(homeSubstitutions).toHaveLength(MAX_SUBSTITUTIONS);
      expect(homeSubstitutions.every((event) => event.minute === HALF_TIME_MINUTE + 1)).toBe(true);
    }
  });

  it("replaces a player injured in the first half at half-time with the substitute rated best in his slot", () => {
    const { state } = intactFirstHalf("injured");
    const injured = withHomeSlot(state, 1, "INJURED");
    const best = [...injured.home.bench].sort((a, b) => ratingAt(b, "RB") - ratingAt(a, "RB") || (a.id < b.id ? -1 : 1))[0];
    const automatic = automaticHalfTimeChoice(injured, "home");

    expect(automatic.substitutions).toEqual([{ in: best.id, out: injured.home.pitch[1].player.id }]);
    expect(automatic.starters).toContainEqual({ slot: 1, playerKey: best.id });
    expect(applyHalfTimeChoice(injured, "home", automatic).home.pitch[1]).toMatchObject({
      player: { id: best.id },
      from: HALF_TIME_MINUTE,
      status: "ON",
    });

    // Leaving his slot empty while substitutes remain is refused.
    expect(
      issueOf(() =>
        applyHalfTimeChoice(injured, "home", {
          ...automatic,
          starters: automatic.starters.filter((starter) => starter.slot !== 1),
          substitutions: [],
        }),
      ),
    ).toBe("incomplete-lineup");
  });

  it("refuses a player who went off, a player who is not a substitute, and an eleven that does not match", () => {
    const { state } = intactFirstHalf("refusals");
    const choice = goalkeeperUpFront(state);
    const [substitution] = choice.substitutions;
    const onPitch = choice.starters.find((starter) => starter.slot === 5)?.playerKey ?? "";
    const refusal = (from: MatchState, changed: HalfTimeChoice) => issueOf(() => applyHalfTimeChoice(from, "home", changed));

    expect(refusal(state, { ...choice, substitutions: [{ in: onPitch, out: substitution.out }] })).toBe("unknown-substitute");
    expect(
      refusal(state, {
        ...choice,
        starters: choice.starters.map((starter) => (starter.slot === 9 ? { slot: 9, playerKey: substitution.out } : starter)),
      }),
    ).toBe("lineup-mismatch");
    expect(refusal(state, { ...choice, starters: choice.starters.slice(1) })).toBe("lineup-mismatch");
    // The striker went off at half-time: he cannot come back on.
    const after = applyHalfTimeChoice(state, "home", choice);
    expect(
      refusal(after, {
        formation: after.home.formation,
        starters: choice.starters.map((starter) => (starter.slot === 5 ? { slot: 5, playerKey: substitution.out } : starter)),
        substitutions: [{ in: substitution.out, out: onPitch }],
      }),
    ).toBe("unknown-substitute");
    expect(refusal(startMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc")), choice)).toBe("not-half-time");
  });
});

describe("a match in segments", () => {
  const SEGMENTS: readonly Segment[] = ["s1", "s2", "s3", "s4", "s5", "s6"];
  const seeds = (count: number, prefix: string): string[] => Array.from({ length: count }, (_, index) => `${prefix}:${index}`);
  const kickOff = (): MatchState => startMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc"));

  it("plays six segments of 15 minutes, each from the state at its start: the very match simulateMatch plays", () => {
    for (const seed of seeds(50, "segments")) {
      let state = kickOff();
      for (const [index, segment] of SEGMENTS.entries()) {
        const before = index === 3 ? applyAutomaticHalfTime(state) : state;
        state = simulateSegment(before, seed, segment);
        const first = index * SEGMENT_MINUTES + 1;
        const last = segment === "s6" ? REGULATION_MINUTES + MAX_STOPPAGE_MINUTES : (index + 1) * SEGMENT_MINUTES;
        const minutes = state.events.slice(before.events.length).map((event) => event.minute);
        expect(minutes.every((minute) => minute >= first && minute <= last)).toBe(true);
        expect(state.phase).toBe(segment === "s3" ? "HALF_TIME" : segment === "s6" ? "FULL_TIME" : "IN_PLAY");
      }
      expect(matchResult(state)).toEqual(simulateMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc"), seed));
    }
  });

  it("refuses a segment out of order", () => {
    expect(() => simulateSegment(kickOff(), "order", "s2")).toThrow();
    expect(() => simulateSegment(playPeriod(kickOff(), "order", "h1"), "order", "s3")).toThrow();
  });

  it("counts a red card from the next segment, not from the next half: ten score less and concede more at once", () => {
    // The 15 minutes after the first segment, from the same state, with the home side's centre midfielder sent off or not.
    const totals = (sentOff: boolean) =>
      seeds(3000, "next-segment").reduce(
        (sum, seed) => {
          const afterFirst = simulateSegment(kickOff(), seed, "s1");
          const from: MatchState = sentOff
            ? {
                ...afterFirst,
                home: {
                  ...afterFirst.home,
                  pitch: afterFirst.home.pitch.map((entry) => (entry.index === 7 ? { ...entry, status: "SENT_OFF" } : entry)),
                },
              }
            : afterFirst;
          const next = simulateSegment(from, seed, "s2");
          return {
            scored: sum.scored + next.home.goals - from.home.goals,
            conceded: sum.conceded + next.away.goals - from.away.goals,
          };
        },
        { scored: 0, conceded: 0 },
      );
    const ten = totals(true);
    const eleven = totals(false);

    expect(ten.scored).toBeLessThan(eleven.scored);
    expect(ten.conceded).toBeGreaterThan(eleven.conceded);
    // 12 000 segments: longer than the default 5 s while other files run.
  }, 30_000);

  it("replaces an injured player at once, while substitutions remain", () => {
    let injuries = 0;
    for (const result of leagueResults) {
      result.events.forEach((event, index) => {
        if (event.type !== "INJURY") {
          return;
        }
        const made = result.events
          .slice(0, index)
          .filter((other) => other.type === "SUBSTITUTION" && other.side === event.side).length;
        if (made < MAX_SUBSTITUTIONS) {
          injuries++;
          expect(result.events[index + 1]).toMatchObject({
            minute: event.minute,
            side: event.side,
            type: "SUBSTITUTION",
            relatedPlayerId: event.playerId,
          });
        }
      });
    }
    expect(injuries).toBeGreaterThan(100);
  });
});

describe("instructions", () => {
  const seeds = (count: number, prefix: string): string[] => Array.from({ length: count }, (_, index) => `${prefix}:${index}`);
  const scored = (home: number, away: number): MatchState => {
    const state = startMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc"));
    return { ...state, home: { ...state.home, goals: home }, away: { ...state.away, goals: away } };
  };

  it("follow the assistant's rule: Attaquer behind from the 60th minute, Fermer one goal ahead from the 75th", () => {
    expect(assistantInstruction(scored(0, 1), "home", 45)).toBe("BALANCED");
    expect(assistantInstruction(scored(0, 1), "home", 60)).toBe("ATTACK");
    expect(assistantInstruction(scored(0, 3), "home", 90)).toBe("ATTACK");
    expect(assistantInstruction(scored(0, 1), "away", 60)).toBe("BALANCED");
    expect(assistantInstruction(scored(0, 1), "away", 75)).toBe("DEFEND");
    expect(assistantInstruction(scored(2, 1), "home", 105)).toBe("DEFEND");
    expect(assistantInstruction(scored(0, 2), "away", 75)).toBe("BALANCED");
    expect(assistantInstruction(scored(1, 1), "home", 75)).toBe("BALANCED");
  });

  it("multiply the side's own expected goals and its opponent's", () => {
    const state = scored(0, 0);
    const balanced = stateExpectedGoals(state, { home: "BALANCED", away: "BALANCED" }, 0);
    for (const instruction of ["ATTACK", "DEFEND"] as const) {
      const given = stateExpectedGoals(state, { home: instruction, away: "BALANCED" }, 0);
      expect(given.home).toBeCloseTo(balanced.home * INSTRUCTION_EFFECTS[instruction].own, 10);
      expect(given.away).toBeCloseTo(balanced.away * INSTRUCTION_EFFECTS[instruction].opponent, 10);
    }
    expect(INSTRUCTION_EFFECTS.BALANCED).toEqual({ own: 1, opponent: 1 });
    // Attaquer opens the match and Fermer closes it: more goals on both sides, or fewer on both.
    expect(Math.min(INSTRUCTION_EFFECTS.ATTACK.own, INSTRUCTION_EFFECTS.ATTACK.opponent)).toBeGreaterThan(1);
    expect(Math.max(INSTRUCTION_EFFECTS.DEFEND.own, INSTRUCTION_EFFECTS.DEFEND.opponent)).toBeLessThan(1);
  });

  it("change the match they are given for: Attaquer scores and concedes more, Fermer less", () => {
    const totals = (instruction: Instruction) =>
      seeds(2000, "instructions").reduce(
        (sum, seed) => {
          const result = simulateMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc"), seed, undefined, false, { home: instruction });
          return { scored: sum.scored + result.homeGoals, conceded: sum.conceded + result.awayGoals };
        },
        { scored: 0, conceded: 0 },
      );
    const attack = totals("ATTACK");
    const balanced = totals("BALANCED");
    const defend = totals("DEFEND");

    expect(attack.scored).toBeGreaterThan(balanced.scored);
    expect(attack.conceded).toBeGreaterThan(balanced.conceded);
    expect(defend.scored).toBeLessThan(balanced.scored);
    expect(defend.conceded).toBeLessThan(balanced.conceded);
    // 6 000 matches: longer than the default 5 s while other files run.
  }, 30_000);

  it("are the assistant's when none is given: a side left out follows the rule", () => {
    for (const seed of seeds(30, "rule")) {
      const home = lineupOf("liverpool-fc");
      const away = lineupOf("arsenal-fc");
      expect(simulateMatch(home, away, seed, undefined, false, {})).toEqual(simulateMatch(home, away, seed));
    }
  });

  it("start from the lineup's starting instruction, the assistant's rule coming back to it when it has nothing to say", () => {
    const started = (instruction: Instruction, home: number, away: number): MatchState => {
      const state = scored(home, away);
      return { ...state, home: { ...state.home, startingInstruction: instruction } };
    };
    expect(assistantInstruction(started("ATTACK", 0, 0), "home", 0)).toBe("ATTACK");
    expect(assistantInstruction(started("ATTACK", 2, 0), "home", 75)).toBe("ATTACK");
    expect(assistantInstruction(started("ATTACK", 1, 0), "home", 75)).toBe("DEFEND");
    expect(assistantInstruction(started("DEFEND", 0, 0), "home", 60)).toBe("DEFEND");
    expect(assistantInstruction(started("DEFEND", 0, 1), "home", 60)).toBe("ATTACK");
    // The other side keeps its own: Équilibré.
    expect(assistantInstruction(started("DEFEND", 0, 0), "away", 0)).toBe("BALANCED");

    const home = lineupOf("liverpool-fc");
    const away = lineupOf("arsenal-fc");
    expect(startMatch({ ...home, instruction: "ATTACK" }, away).home.startingInstruction).toBe("ATTACK");
    // Équilibré leaves the state and the match as they always were.
    expect(startMatch({ ...home, instruction: "BALANCED" }, away)).toEqual(startMatch(home, away));
    for (const seed of seeds(20, "balanced-start")) {
      expect(simulateMatch({ ...home, instruction: "BALANCED" }, away, seed)).toEqual(simulateMatch(home, away, seed));
    }
  });

  it("keep the instructions each side played with, from kick-off, and who set them", () => {
    const state = (instruction: Instruction, seed: string): MatchState => {
      let current = startMatch({ ...lineupOf("liverpool-fc"), instruction }, lineupOf("arsenal-fc"));
      for (const segment of ["s1", "s2", "s3", "s4", "s5", "s6"] as const) {
        current = simulateSegment(segment === "s4" ? applyAutomaticHalfTime(current) : current, seed, segment);
      }
      return current;
    };
    let switched = 0;
    for (const seed of seeds(200, "spans")) {
      const played = state("DEFEND", seed);
      const spans = played.home.instructions ?? [];
      expect(spans[0]).toEqual({ from: 0, instruction: "DEFEND", source: "START" });
      expect(played.away.instructions?.[0]).toEqual({ from: 0, instruction: "BALANCED", source: "START" });
      // A span at each change only, at a boundary: its starting instruction, or his assistant's other one.
      for (const [index, span] of spans.entries()) {
        expect(span.from % 15).toBe(0);
        expect(span.source === "START" ? span.instruction === "DEFEND" : span.source === "ASSISTANT" && span.instruction !== "DEFEND").toBe(true);
        expect(index === 0 || spans[index - 1].instruction !== span.instruction).toBe(true);
      }
      switched += spans.some((span) => span.source === "ASSISTANT") ? 1 : 0;
    }
    expect(switched).toBeGreaterThan(20);
  });

  it("change the match from kick-off when they start it: Attaquer scores and concedes more than Équilibré, Fermer less", () => {
    const totals = (instruction: Instruction) =>
      seeds(2000, "starting").reduce(
        (sum, seed) => {
          const result = simulateMatch({ ...lineupOf("liverpool-fc"), instruction }, lineupOf("arsenal-fc"), seed);
          return { scored: sum.scored + result.homeGoals, conceded: sum.conceded + result.awayGoals };
        },
        { scored: 0, conceded: 0 },
      );
    const attack = totals("ATTACK");
    const balanced = totals("BALANCED");
    const defend = totals("DEFEND");

    expect(attack.scored).toBeGreaterThan(balanced.scored);
    expect(attack.conceded).toBeGreaterThan(balanced.conceded);
    expect(defend.scored).toBeLessThan(balanced.scored);
    expect(defend.conceded).toBeLessThan(balanced.conceded);
    // 6 000 matches: longer than the default 5 s while other files run.
  }, 30_000);
});

describe("formation profiles", () => {
  it("multiply the attack and the defense of the eleven, the 4-4-2 neutral", () => {
    const lineup = lineupOf("liverpool-fc");
    const plain = teamStrength(lineup, formationPositions("4-3-3"));
    const profiled = formationStrength(lineup, "4-3-3");

    expect(profiled.attack).toBeCloseTo(plain.attack * FORMATION_PROFILES["4-3-3"].attack, 10);
    expect(profiled.defense).toBeCloseTo(plain.defense * FORMATION_PROFILES["4-3-3"].defense, 10);
    expect(FORMATION_PROFILES["4-4-2"]).toEqual({ attack: 1, defense: 1 });
    // More attack always costs defense, and the other way round.
    for (const { attack, defense } of Object.values(FORMATION_PROFILES)) {
      expect((attack - 1) * (defense - 1)).toBeLessThanOrEqual(0);
    }
  });
});

describe("fatigue", () => {
  const seeds = (count: number, prefix: string): string[] => Array.from({ length: count }, (_, index) => `${prefix}:${index}`);
  /** Liverpool with every player, starters and substitutes, at a fitness; Arsenal rested. */
  const tiredLiverpool = (fitness: number, only?: string): Lineup => {
    const lineup = lineupOf("liverpool-fc");
    const tire = (player: SquadPlayer): SquadPlayer => (only === undefined || player.id === only ? { ...player, fitness } : player);
    return { starters: lineup.starters.map((starter) => ({ ...starter, player: tire(starter.player) })), bench: lineup.bench.map(tire) };
  };

  it("plays a tired eleven weaker: it expects fewer goals, its opponent more", () => {
    const expected = (fitness: number) =>
      stateExpectedGoals(startMatch(tiredLiverpool(fitness), lineupOf("arsenal-fc")), { home: "BALANCED", away: "BALANCED" }, 0);

    expect(expected(85).home).toBeLessThan(expected(100).home);
    expect(expected(85).away).toBeGreaterThan(expected(100).away);
    expect(expected(75).home).toBeLessThan(expected(85).home);
  });

  it("tires the players on the pitch as the match goes, the goalkeeper less, and a substitute from his entry only", () => {
    const state = playPeriod(startMatch(lineupOf("liverpool-fc"), lineupOf("arsenal-fc")), "fatigue", "h1");
    const starter = state.home.pitch.find((entry) => entry.slot !== "GK" && entry.from === 0 && entry.status === "ON");
    const keeper = state.home.pitch.find((entry) => entry.slot === "GK");
    if (starter === undefined || keeper === undefined) {
      throw new Error("No starter or goalkeeper on the pitch");
    }

    expect(fitnessAt(starter, 0)).toBe(100);
    expect(fitnessAt(starter, HALF_TIME_MINUTE)).toBe(85);
    expect(fitnessAt(starter, 75)).toBe(75);
    expect(fitnessAt(keeper, 75)).toBe(92.5);
    expect(fitnessAt({ ...starter, from: 60 }, 75)).toBe(95);
  });

  it("takes off the most tired starter at a tactical substitution", () => {
    const weary = lineupOf("liverpool-fc").starters.find((starter) => starter.slot === "CB")?.player.id ?? "";
    let checked = 0;
    for (const seed of seeds(60, "tired-off")) {
      const result = simulateMatch(tiredLiverpool(60, weary), lineupOf("arsenal-fc"), seed);
      const injuredMinutes = new Map(
        result.events.filter((event) => event.type === "INJURY").map((event) => [event.playerId, event.minute]),
      );
      // The home side's first substitution that does not replace an injured player.
      const tactical = result.events.find(
        (event) =>
          event.type === "SUBSTITUTION" &&
          event.side === "home" &&
          injuredMinutes.get(event.relatedPlayerId ?? "") !== event.minute,
      );
      const sentOff = result.events.some((event) => event.type === "RED_CARD" && event.playerId === weary);
      const injured = injuredMinutes.has(weary);
      if (tactical === undefined || sentOff || (injured && (injuredMinutes.get(weary) ?? 0) <= tactical.minute)) {
        continue;
      }
      checked++;
      expect(tactical.relatedPlayerId).toBe(weary);
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("gets tired players injured more often", () => {
    const injuries = (fitness: number) =>
      seeds(2000, "tired-injuries").reduce(
        (sum, seed) =>
          sum +
          simulateMatch(tiredLiverpool(fitness), lineupOf("arsenal-fc"), seed).events.filter(
            (event) => event.type === "INJURY" && event.side === "home",
          ).length,
        0,
      );

    expect(injuries(40)).toBeGreaterThan(injuries(100) * 1.5);
    // 30 000 segments in all: longer than the default 5 s while other files run.
  }, 30_000);
});
