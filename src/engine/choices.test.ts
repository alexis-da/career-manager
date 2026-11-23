import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import {
  EXHAUSTED_FITNESS_LOST,
  FREE_KICK_COMBINATION_GOALS,
  HOTHEAD_RED_CHANCE,
  KNOCK_INJURY_CHANCE,
  KNOCK_SHARE,
  PENALTY_EXPERIENCE_CHANCE,
  POSITION_PROFILES,
  PROTEST_BACKFIRE_GOALS,
  PROTEST_GOALS,
  PROTEST_SUCCESS_CHANCE,
  PROTEST_YELLOW_CHANCE,
  SEGMENT_MINUTES,
  SHOOTOUT_MAX_CHANCE,
  SHOOTOUT_MIN_CHANCE,
} from "./balance";
import {
  assistantChoices,
  ChoiceError,
  choiceEvent,
  choicePlan,
  decideChoice,
  isChoicePossible,
  penaltyChance,
  penaltyExperience,
  penaltyPressure,
  pressureLevel,
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

  it("offer the best three shooters a penalty, the best rated first, a better chance scoring whenever a worse one does", () => {
    const at15 = stateAt(15, "penalty");
    const { event } = waitingOn("PENALTY", at15);
    expect(event.options).toHaveLength(3);
    const shooting = (playerId: string | undefined) => at15.home.pitch.find((entry) => entry.player.id === playerId)?.player.shooting ?? 0;
    const ratings = event.options.map((option) => shooting(option.playerId));
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    // Teammates of the same form, fitness and age: the best rated has the best chance, the assistant's.
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

  it("give a penalty its chance from the taker as he is: form, fitness at that minute, the pressure and his experience of it", () => {
    const taker = { shooting: 80, form: 50, fitness: 85, age: 26 };
    const level75 = penaltyPressure(75, 0);
    const chance = (changes: Partial<typeof taker>, pressure = level75, keeper = 70) => penaltyChance({ ...taker, ...changes }, keeper, pressure);
    // The shoot-out's chance (0.79 against a goalkeeper of 70), to the whole percent, at an average pressure.
    expect(chance({}, 0.5)).toBe(0.79);
    expect(Math.round(100 * chance({ form: 50.4 }, 0.5))).toBe(100 * chance({}, 0.5));
    // Form counts for more under pressure, both ways; tired legs cost; a veteran keeps his calm, a youngster loses his.
    expect(chance({ form: 60 }) - chance({})).toBeGreaterThan(chance({ form: 60 }, 0.4) - chance({}, 0.4));
    expect(chance({ form: 40 })).toBeLessThan(chance({}));
    expect(chance({ fitness: 65 })).toBeLessThan(chance({}));
    expect(chance({ fitness: 100 })).toBeGreaterThan(chance({}));
    expect(chance({ age: 33 })).toBeCloseTo(chance({}) + PENALTY_EXPERIENCE_CHANCE * level75, 2);
    expect(chance({ age: 19 })).toBeCloseTo(chance({}) - PENALTY_EXPERIENCE_CHANCE * level75, 2);
    expect(chance({ age: undefined })).toBe(chance({}));
    expect([penaltyExperience(21), penaltyExperience(26), penaltyExperience(28.5), penaltyExperience(40)]).toEqual([-1, 0, 0.5, 1]);
    // The pressure lowers every taker's chance, within the shoot-out's bounds.
    expect(chance({}, 1)).toBeLessThan(chance({}, 0.4));
    expect(chance({ shooting: 99, form: 99, fitness: 100, age: 35 }, 1, 40)).toBe(SHOOTOUT_MAX_CHANCE);
    expect(chance({ shooting: 40, form: 1, fitness: 30, age: 18 }, 1, 95)).toBe(SHOOTOUT_MIN_CHANCE);
  });

  it("put the pressure of a penalty on its minute and its score, the most level or a goal behind at the end", () => {
    expect(penaltyPressure(15, 0)).toBeCloseTo(0.3 + 0.7 / 6, 5);
    expect(penaltyPressure(90, 0)).toBe(1);
    expect(penaltyPressure(105, -1)).toBe(1);
    expect(penaltyPressure(75, 1)).toBeLessThan(penaltyPressure(75, 0));
    expect(penaltyPressure(75, -2)).toBeLessThan(penaltyPressure(75, 1));
    expect(penaltyPressure(75, 2)).toBeLessThan(penaltyPressure(75, -2));
    expect(penaltyPressure(75, 3)).toBe(penaltyPressure(75, -4));
    expect([15, 30, 60, 75].map((minute) => pressureLevel(penaltyPressure(minute, 0)))).toEqual(["low", "medium", "high", "high"]);
  });

  it("let the assistant take the best chance, not always the best rated: a tired or young shooter at the end of a tight match", () => {
    const at75 = stateAt(75, "late-penalty");
    const level: MatchState = { ...at75, home: { ...at75.home, goals: 1 }, away: { ...at75.away, goals: 1 } };
    const best = [...level.home.pitch]
      .filter((entry) => entry.status === "ON" && entry.slot !== "GK")
      .sort((a, b) => b.player.shooting - a.player.shooting || (a.player.id < b.player.id ? -1 : 1))[0];
    const shaken: MatchState = {
      ...level,
      home: {
        ...level.home,
        pitch: level.home.pitch.map((entry) =>
          entry === best ? { ...entry, player: { ...entry.player, form: 35, fitness: 80, age: 20 } } : { ...entry, player: { ...entry.player, age: 30 } },
        ),
      },
    };
    const { event } = waitingOn("PENALTY", shaken);
    expect(event.options[0].playerId).toBe(best.player.id);
    expect(event.assistant).not.toBe(0);
    const chances = event.options.map((option) => option.chance ?? 0);
    expect(chances[event.assistant]).toBe(Math.max(...chances));
    // The chance played is the one shown: a kick scores when its draw is under it.
    const seed = seeds(300, "late-kick").find((candidate) =>
      decideChoice(waitingOn("PENALTY", shaken).state, candidate, { option: "TAKER", playerId: event.options[event.assistant].playerId }).home.goals > 1,
    );
    expect(seed).toBeDefined();
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

  it("make a protest a bet on the next two segments: the players fired up, or the opponent's goals up, half the time each", () => {
    const at30 = stateAt(30, "scuffle-bet");
    let firedUp = 0;
    for (const seed of seeds(600, "bet")) {
      const protested = decideChoice(waitingOn("SCUFFLE", at30).state, seed, { option: "PROTEST" });
      const [boost] = protested.modifiers?.boosts ?? [];
      expect(protested.modifiers?.boosts).toHaveLength(1);
      expect(boost.until).toBe(30 + 2 * SEGMENT_MINUTES);
      expect(boost).toEqual(
        boost.side === "home" ? { side: "home", factor: PROTEST_GOALS, until: 60 } : { side: "away", factor: PROTEST_BACKFIRE_GOALS, until: 60 },
      );
      firedUp += boost.side === "home" ? 1 : 0;
    }
    expect(firedUp / 600).toBeCloseTo(PROTEST_SUCCESS_CHANCE, 1);
    // Calming down changes nothing: no boost, no card.
    const calmed = decideChoice(waitingOn("SCUFFLE", at30).state, "calm", { option: "CALM" });
    expect(calmed.home).toEqual(at30.home);
    expect(calmed.modifiers?.boosts).toBeUndefined();

    // The boost runs over the segments that start before its minute, half-time between them, then goes; never past the 90th.
    const protested = decideChoice(waitingOn("SCUFFLE", at30).state, "bet:0", { option: "PROTEST" });
    const third = playOn(protested, "home", "bet:0", {}, "segment");
    expect(third.played).toBe(45);
    expect(third.modifiers?.boosts).toHaveLength(1);
    const fourth = playOn(third, "home", "bet:0", {}, "segment");
    expect(fourth.played).toBe(60);
    expect(fourth.modifiers?.boosts).toBeUndefined();
    const at75 = stateAt(75, "scuffle-late");
    const late = decideChoice(waitingOn("SCUFFLE", at75).state, "late", { option: "PROTEST" });
    expect(late.modifiers?.boosts?.[0].until).toBe(90);
  });

  it("score more goals for a fired-up side over the next two segments, and for its opponent when the protest backfires", () => {
    const at30 = stateAt(30, "scuffle-goals");
    const goalsOver = (side: Side, factor: number): number => {
      let goals = 0;
      for (const seed of seeds(1500, `goals-${side}-${factor}`)) {
        const boosted: MatchState = { ...at30, modifiers: { goals: {}, instructions: {}, scheduled: [], boosts: [{ side, factor, until: 60 }] } };
        let state = playOn(boosted, "home", seed, {}, "segment");
        state = playOn(state, "home", seed, {}, "segment");
        goals += state[side].goals - at30[side].goals;
      }
      return goals;
    };
    expect(goalsOver("home", PROTEST_GOALS)).toBeGreaterThan(1.5 * goalsOver("home", 1));
    expect(goalsOver("away", PROTEST_BACKFIRE_GOALS)).toBeGreaterThan(1.5 * goalsOver("away", 1));
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
    // The three instructions, each once, in the screens' order: Attaquer, Équilibré (STEADY), Fermer.
    expect(event.options.map((offered) => offered.option)).toEqual(["ATTACK", "STEADY", "DEFEND"]);
    const attack = decideChoice(state, "tactics", { option: "ATTACK" });
    expect(attack.modifiers?.instructions.home).toBe("ATTACK");
    expect(attack.modifiers?.givenBy?.home).toBe("EVENT");
    expect(decideChoice(state, "tactics", { option: "DEFEND" }).modifiers?.instructions.home).toBe("DEFEND");
    // Équilibré whatever the score does, and whatever the club started with: never the same match as another option.
    expect(decideChoice(state, "tactics", { option: "STEADY" }).modifiers?.instructions.home).toBe("BALANCED");
    const startedClosed: MatchState = { ...state, home: { ...state.home, startingInstruction: "DEFEND" } };
    expect(decideChoice(startedClosed, "tactics", { option: "STEADY" }).modifiers?.instructions.home).toBe("BALANCED");
    const end = playOn(playOn(attack, "home", "tactics", {}, "segment"), "home", "tactics", {}, "segment");
    expect(end.modifiers?.instructions).toEqual({});
    expect(event.options[event.assistant].option).toBe(event.kind === "CHASING" && !level ? "ATTACK" : "STEADY");
  });

  it("offer the three instructions to a late tactical card whatever the score, the assistant picking the one his rule plays", () => {
    const at75 = stateAt(75, "rule");
    const scored = (home: number, away: number, starting?: "ATTACK" | "DEFEND"): MatchState => ({
      ...at75,
      home: { ...at75.home, goals: home, ...(starting === undefined ? {} : { startingInstruction: starting }) },
      away: { ...at75.away, goals: away },
    });
    const pickOf = (kind: "LEADING" | "CHASING", state: MatchState): string => {
      const { event } = waitingOn(kind, state);
      expect(event.options.map((offered) => offered.option)).toEqual(["ATTACK", "STEADY", "DEFEND"]);
      return event.options[event.assistant].option;
    };
    // Unchanged from G4 for a club that started balanced: one goal ahead at 75', Fermer; two, Équilibré; behind, Attaquer;
    // level, Équilibré.
    expect(pickOf("LEADING", scored(2, 1))).toBe("DEFEND");
    expect(pickOf("LEADING", scored(3, 1))).toBe("STEADY");
    expect(pickOf("CHASING", scored(0, 1))).toBe("ATTACK");
    expect(pickOf("CHASING", scored(1, 1))).toBe("STEADY");
    // His rule comes back to the starting instruction when it has nothing to say.
    expect(pickOf("CHASING", scored(1, 1, "ATTACK"))).toBe("ATTACK");
    expect(pickOf("LEADING", scored(3, 1, "DEFEND"))).toBe("DEFEND");
    expect(pickOf("LEADING", scored(2, 1, "ATTACK"))).toBe("DEFEND");
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
