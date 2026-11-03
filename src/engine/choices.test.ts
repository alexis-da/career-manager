import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import {
  EXHAUSTED_FITNESS_LOST,
  FREE_KICK_COMBINATION_GOALS,
  HOTHEAD_RED_CHANCE,
  KNOCK_INJURY_CHANCE,
  KNOCK_SHARE,
  POSITION_PROFILES,
  PROTEST_YELLOW_CHANCE,
  SEGMENT_MINUTES,
} from "./balance";
import {
  assistantChoices,
  ChoiceError,
  choiceEvent,
  choicePlan,
  decideChoice,
  isChoicePossible,
  withChoices,
  type ChoiceEvent,
  type ChoiceKind,
} from "./choices";
import { DEFAULT_FORMATION_NAME, formationPositions } from "./formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "./generation";
import type { Lineup, SquadPlayer } from "./lineup";
import { playOn } from "./live";
import { fitnessAt, liveStrength, matchResult, simulateMatch, startMatch, type MatchState, type Side } from "./match";
import type { Position } from "./positions";

function player(id: string, position: Position, level: number): SquadPlayer {
  const attributes = Object.fromEntries(
    ATTRIBUTE_NAMES.map((name) => [name, clampRating(level + POSITION_PROFILES[position][name])]),
  ) as Record<AttributeName, number>;
  return { id, position, overall: overallFor(position, attributes), injured: false, form: 50, morale: 50, fitness: 100, ...attributes };
}

const BENCH: readonly Position[] = ["GK", "CB", "RB", "CDM", "CM", "RW", "ST"];

/** A team of one level in the 4-3-3, its bench three points below. */
function team(name: string, level: number): Lineup {
  return {
    starters: formationPositions(DEFAULT_FORMATION_NAME).map((slot, index) => ({ player: player(`${name}#${index}`, slot, level), slot, index })),
    bench: BENCH.map((position, index) => player(`${name}#bench${index}`, position, level - 3)),
  };
}

const HOME = team("home", 70);
const AWAY = team("away", 70);

/** A match of the home side's choices played by its assistant: the decisions it took. */
const decisionsOf = (seed: string, knockout = false) =>
  simulateMatch(HOME, AWAY, seed, undefined, knockout, {}, assistantChoices("home", seed)).decisions ?? [];

/** The match at a boundary, played on segment by segment without choice events, as the managed club's. */
function stateAt(minute: number, seed: string): MatchState {
  let state = startMatch(HOME, AWAY);
  while (state.played < minute) {
    state = playOn(state, "home", seed, {}, "segment");
  }
  return state;
}

/** A state waiting on an event of a kind for the home side, built as openChoice builds it. */
function waitingOn(kind: ChoiceKind, state: MatchState, seed = "pick"): { state: MatchState; event: ChoiceEvent } {
  const event = choiceEvent(kind, state, "home", state.played, makeRng(seed));
  return {
    event,
    state: {
      ...state,
      choices: { side: "home", minutes: [state.played], pending: event, decisions: [] },
      modifiers: { goals: {}, instructions: {}, scheduled: [] },
    },
  };
}

const seeds = (count: number, prefix: string): string[] => Array.from({ length: count }, (_, index) => `${prefix}:${index}`);

describe("choice events", () => {
  it("come 1 to 3 times a match, 35 / 45 / 20 % of the time, at 15', 30', 60' or 75', and at 105' half the time", () => {
    const plans = seeds(4000, "plan").map(choicePlan);
    const regular = plans.map((plan) => plan.filter((minute) => minute <= 75));
    const share = (count: number) => regular.filter((plan) => plan.length === count).length / plans.length;

    expect(share(1)).toBeCloseTo(0.35, 1);
    expect(share(2)).toBeCloseTo(0.45, 1);
    expect(share(3)).toBeCloseTo(0.2, 1);
    expect(regular.every((plan) => new Set(plan).size === plan.length && plan.every((minute) => [15, 30, 60, 75].includes(minute)))).toBe(true);
    expect(plans.filter((plan) => plan.includes(105)).length / plans.length).toBeCloseTo(0.5, 1);
    expect(choicePlan("same")).toEqual(choicePlan("same"));
  });

  it("are decided by the assistant in a simulated match of the managed club only, the same for the same seed", () => {
    expect(decisionsOf("same")).toEqual(decisionsOf("same"));
    expect(decisionsOf("same").every((decision) => decision.assistant)).toBe(true);
    expect(simulateMatch(HOME, AWAY, "same").decisions).toBeUndefined();
    // Every decision at a boundary of its plan, numbered in order.
    for (const seed of seeds(200, "plan-match")) {
      const decisions = decisionsOf(seed, true);
      expect(decisions.map((decision) => decision.sequence)).toEqual(decisions.map((_, index) => index + 1));
      expect(decisions.every((decision) => choicePlan(seed).includes(decision.minute))).toBe(true);
    }
  });

  it("only come when possible: a hothead from 30', an exhausted player from 75', the score's events at 60' and 75'", () => {
    const decisions = seeds(1500, "kinds").flatMap((seed) => decisionsOf(seed, true));
    const minutesOf = (kind: ChoiceKind) => new Set(decisions.filter((decision) => decision.kind === kind).map((decision) => decision.minute));

    expect(new Set(decisions.map((decision) => decision.kind)).size).toBe(8);
    expect([...minutesOf("HOTHEAD")].every((minute) => minute >= 30)).toBe(true);
    expect([...minutesOf("EXHAUSTED")].every((minute) => minute >= 75)).toBe(true);
    expect([...minutesOf("LEADING"), ...minutesOf("CHASING")].every((minute) => minute === 60 || minute === 75)).toBe(true);
    expect(minutesOf("PENALTY").has(105)).toBe(true);
  });

  it("offer the best three shooters a penalty, the best chance first, a better taker scoring whenever a worse one does", () => {
    const at15 = stateAt(15, "penalty");
    const { event } = waitingOn("PENALTY", at15);
    expect(event.options).toHaveLength(3);
    expect(event.options.map((option) => option.chance ?? 0)).toEqual([...event.options.map((option) => option.chance ?? 0)].sort((a, b) => b - a));
    expect(event.assistant).toBe(0);

    let best = 0;
    let worst = 0;
    for (const seed of seeds(400, "kick")) {
      const scored = (taker: number) => {
        const { state, event: offered } = waitingOn("PENALTY", at15);
        const option = offered.options[taker];
        return decideChoice(state, seed, { option: option.option, playerId: option.playerId }).home.goals > at15.home.goals;
      };
      const [first, last] = [scored(0), scored(2)];
      expect(!last || first).toBe(true);
      best += first ? 1 : 0;
      worst += last ? 1 : 0;
    }
    expect(best / 400).toBeCloseTo(event.options[0].chance ?? 0, 1);
    expect(best).toBeGreaterThanOrEqual(worst);
  });

  it("let a free kick be shot, by the best shooter, or worked: the side's goals multiplied in the next segment only", () => {
    const at30 = stateAt(30, "free-kick");
    const { state, event } = waitingOn("FREE_KICK", at30);
    expect(event.options.map((option) => option.option)).toEqual(["SHOOT", "COMBINE"]);

    const combined = decideChoice(state, "free-kick", { option: "COMBINE" });
    expect(combined.modifiers?.goals.home).toBe(FREE_KICK_COMBINATION_GOALS);
    expect(combined.events).toEqual(at30.events);
    const next = playOn(combined, "home", "free-kick", {}, "segment");
    expect(next.modifiers?.goals).toEqual({});
  });

  it("send a booked player taken off away at once, and a kept one off in the next segment a quarter of the time", () => {
    const booked = bookedAt(30);
    const { state, event } = waitingOn("HOTHEAD", booked);
    const playerId = event.playerId ?? "";
    expect(booked.home.booked).toContain(playerId);

    const off = decideChoice(state, "hothead", { option: "TAKE_OFF" });
    expect(off.home.substitutions).toBe(booked.home.substitutions + 1);
    expect(off.events.at(-1)).toMatchObject({ minute: 31, type: "SUBSTITUTION", relatedPlayerId: playerId });

    let sentOff = 0;
    for (const seed of seeds(600, "temper")) {
      const kept = decideChoice(waitingOn("HOTHEAD", booked).state, seed, { option: "KEEP" });
      const [red] = kept.modifiers?.scheduled ?? [];
      if (red !== undefined) {
        sentOff++;
        expect(red).toMatchObject({ kind: "RED_CARD", playerId });
        expect(red.minute).toBeGreaterThan(30);
        expect(red.minute).toBeLessThanOrEqual(30 + SEGMENT_MINUTES);
        const played = playOn(kept, "home", seed, {}, "segment");
        expect(played.events).toContainEqual({ minute: red.minute, side: "home", type: "RED_CARD", playerId });
      }
    }
    expect(sentOff / 600).toBeCloseTo(HOTHEAD_RED_CHANCE, 1);
  });

  it("book the captain of a side that protests about three times in ten, and send him off if he was already booked", () => {
    const at15 = stateAt(15, "scuffle");
    const { event } = waitingOn("SCUFFLE", at15);
    const captain = event.playerId ?? "";
    let booked = 0;
    for (const seed of seeds(600, "protest")) {
      const protested = decideChoice(waitingOn("SCUFFLE", at15).state, seed, { option: "PROTEST" });
      booked += protested.home.booked.includes(captain) ? 1 : 0;
    }
    expect(booked / 600).toBeCloseTo(PROTEST_YELLOW_CHANCE, 1);
    expect(decideChoice(waitingOn("SCUFFLE", at15).state, "calm", { option: "CALM" }).home).toEqual(at15.home);

    const alreadyBooked: MatchState = { ...at15, home: { ...at15.home, booked: [captain] } };
    const seed = seeds(600, "protest").find(
      (candidate) => decideChoice(waitingOn("SCUFFLE", at15).state, candidate, { option: "PROTEST" }).home.booked.includes(captain),
    );
    const sentOff = decideChoice(waitingOn("SCUFFLE", alreadyBooked).state, seed ?? "", { option: "PROTEST" });
    expect(sentOff.home.pitch.find((entry) => entry.player.id === captain)?.status).toBe("SENT_OFF");
  });

  it("play a knocked player on at a share of his strength, injured later in a third of the matches", () => {
    const at60 = stateAt(60, "knock");
    const { state, event } = waitingOn("KNOCK", at60);
    const playerId = event.playerId ?? "";
    const hurt = decideChoice(state, "knock", { option: "PLAY_ON" });
    expect(hurt.home.pitch.find((entry) => entry.player.id === playerId)?.hurt).toBe(true);
    expect(liveStrength(hurt.home, 60).attack).toBeLessThan(liveStrength(at60.home, 60).attack);
    expect(KNOCK_SHARE).toBeLessThan(1);

    let injured = 0;
    for (const seed of seeds(600, "knocks")) {
      const [injury] = decideChoice(waitingOn("KNOCK", at60).state, seed, { option: "PLAY_ON" }).modifiers?.scheduled ?? [];
      if (injury !== undefined) {
        injured++;
        expect(injury).toMatchObject({ kind: "INJURY", playerId });
        expect(injury.minute).toBeGreaterThan(60);
        expect(injury.minute).toBeLessThanOrEqual(90);
      }
    }
    expect(injured / 600).toBeCloseTo(KNOCK_INJURY_CHANCE, 1);
  });

  it("find an exhausted player only once he has lost enough on the pitch, from 75'", () => {
    const at75 = stateAt(75, "tired");
    expect(isChoicePossible("EXHAUSTED", stateAt(60, "tired"), "home", 60)).toBe(false);
    expect(isChoicePossible("EXHAUSTED", at75, "home", 75)).toBe(true);
    const { state, event } = waitingOn("EXHAUSTED", at75);
    const entry = at75.home.pitch.find((candidate) => candidate.player.id === event.playerId);
    expect(entry?.from).toBe(0);
    expect(entry === undefined ? 0 : entry.player.fitness - fitnessAt(entry, 75)).toBeGreaterThanOrEqual(EXHAUSTED_FITNESS_LOST);
    expect(decideChoice(state, "tired", { option: "REPLACE" }).home.substitutions).toBe(at75.home.substitutions + 1);
  });

  it("set the side's instruction for the rest of regular time on a late tactical choice, the assistant following his rule", () => {
    const at60 = stateAt(60, "tactics");
    const level = at60.home.goals === at60.away.goals;
    const { state, event } = waitingOn(level || at60.home.goals < at60.away.goals ? "CHASING" : "LEADING", at60);
    const attack = decideChoice(state, "tactics", { option: "ATTACK" });
    expect(attack.modifiers?.instructions.home).toBe("ATTACK");
    // Carrying on is an instruction too, Équilibré whatever the score does: never the same match as another option.
    expect(decideChoice(state, "tactics", { option: "STEADY" }).modifiers?.instructions.home).toBe("BALANCED");
    const end = playOn(playOn(attack, "home", "tactics", {}, "segment"), "home", "tactics", {}, "segment");
    expect(end.modifiers?.instructions).toEqual({});
    expect(event.options[event.assistant].option).toBe(event.kind === "CHASING" && !level ? "ATTACK" : "STEADY");
  });

  it("refuse a decision without an open event, or one not offered", () => {
    const at15 = stateAt(15, "refuse");
    const { state } = waitingOn("PENALTY", at15);
    const issue = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return error instanceof ChoiceError ? error.issue : "other";
      }
      return null;
    };
    expect(issue(() => decideChoice(at15, "refuse", null))).toBe("no-event");
    expect(issue(() => decideChoice(state, "refuse", { option: "SHOOT" }))).toBe("unknown-option");
    expect(issue(() => decideChoice(state, "refuse", { option: "TAKER", playerId: "away#9" }))).toBe("unknown-option");
  });

  it("are played on from pause to pause as simulated, the assistant deciding: one segment, the next pause, the next break", () => {
    for (const seed of seeds(150, "watched")) {
      const knockout = seed.endsWith("1");
      const side: Side = seed.endsWith("2") ? "away" : "home";
      const simulated = simulateMatch(HOME, AWAY, seed, undefined, knockout, {}, assistantChoices(side, seed));
      for (const until of ["segment", "pause", "break"] as const) {
        let state = withChoices(startMatch(HOME, AWAY, undefined, knockout), side, seed);
        while (state.phase !== "FULL_TIME") {
          state = playOn(state, side, seed, {}, until);
          if (until === "break") {
            expect(state.choices?.pending ?? null).toBeNull();
          }
        }
        expect(matchResult(state)).toEqual(simulated);
      }
    }
  });
});

/** A match at a boundary with a booked outfield player on the home side, booked by hand when the draw booked none. */
function bookedAt(minute: number): MatchState {
  const state = stateAt(minute, "booked");
  if (state.home.booked.length > 0) {
    return state;
  }
  const entry = state.home.pitch.find((candidate) => candidate.status === "ON" && candidate.slot !== "GK");
  return { ...state, home: { ...state.home, booked: entry === undefined ? [] : [entry.player.id] } };
}
