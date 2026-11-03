import { makeRng, pick, randomInt, weightedIndex, type Rng } from "../lib/rng";
import {
  CHOICE_EVENT_COUNT_WEIGHTS,
  CHOICE_EVENT_MINUTES,
  CHOICE_EVENT_WEIGHTS,
  EXHAUSTED_FITNESS_LOST,
  EXHAUSTED_INJURY_CHANCE,
  EXHAUSTED_MINUTE,
  EXTRA_TIME_CHOICE_EVENT_CHANCE,
  EXTRA_TIME_END_MINUTE,
  EXTRA_TIME_PERIOD_MINUTES,
  FREE_KICK_ASSISTANT_SHOOTING,
  FREE_KICK_BASE_CHANCE,
  FREE_KICK_COMBINATION_GOALS,
  FREE_KICK_KEEPER_FACTOR,
  FREE_KICK_KICKER_FACTOR,
  FREE_KICK_MAX_CHANCE,
  FREE_KICK_MIN_CHANCE,
  FREE_KICK_REFERENCE_GOALKEEPING,
  FREE_KICK_REFERENCE_SHOOTING,
  HOTHEAD_MINUTE,
  HOTHEAD_RED_CHANCE,
  INJURY_DAYS_MAX,
  INJURY_DAYS_MIN,
  KNOCK_INJURY_CHANCE,
  KNOCK_INJURY_DAYS_MAX,
  KNOCK_INJURY_DAYS_MIN,
  LEADING_MAX_MARGIN,
  PENALTY_TAKERS,
  PROTEST_GOALS,
  PROTEST_GOALS_CHANCE,
  PROTEST_YELLOW_CHANCE,
  REGULATION_MINUTES,
  SEGMENT_MINUTES,
  TACTICAL_CHOICE_MINUTES,
} from "./balance";
import {
  assistantInstruction,
  bookingAt,
  fitnessAt,
  goalAt,
  shootoutChance,
  substitutionAt,
  substitutionsLeft,
  type BoundaryHook,
  type Instruction,
  type MatchModifiers,
  type MatchState,
  type PitchEntry,
  type ScheduledIncident,
  type Side,
} from "./match";
import { ratingAt } from "./positions";

/**
 * Choice events (gameplay v1, G4): moments of the managed club's matches where its manager decides, at a boundary between
 * two segments. The catalogue v1: a penalty for the club (its taker), a dangerous free kick (a shot or a combination),
 * a booked player losing his temper (taken off or kept), a scuffle (calm down or protest), a player knocked (taken off
 * or played on), an exhausted player (replaced or kept), and late in the match, ahead (close the game, look for the
 * goal that settles it, or carry on balanced) or not (all out attack, or carry on balanced): an instruction for the rest
 * of regular time, whatever the score does.
 */
export const CHOICE_KINDS = ["PENALTY", "FREE_KICK", "HOTHEAD", "SCUFFLE", "KNOCK", "EXHAUSTED", "LEADING", "CHASING"] as const;
export type ChoiceKind = (typeof CHOICE_KINDS)[number];

export const CHOICE_OPTIONS = [
  "TAKER",
  "SHOOT",
  "COMBINE",
  "TAKE_OFF",
  "KEEP",
  "CALM",
  "PROTEST",
  "PLAY_ON",
  "REPLACE",
  "DEFEND",
  "ATTACK",
  "STEADY",
] as const;
export type ChoiceOption = (typeof CHOICE_OPTIONS)[number];

/** An option offered: the player it is about (a penalty's taker), and a kick's chance when there is one. */
export type OfferedOption = { option: ChoiceOption; playerId?: string; chance?: number };

/** A choice event waiting for the manager's decision at a boundary of his club's match. */
export type ChoiceEvent = {
  minute: number; // the boundary it comes at: 15, 30, 60, 75 or 105
  kind: ChoiceKind;
  playerId?: string; // the player it is about: booked, knocked, exhausted, the captain
  options: OfferedOption[];
  assistant: number; // index of the assistant's option
};

/** The manager's decision: an option, and for a penalty its taker. */
export type Decision = { option: ChoiceOption; playerId?: string };

/** A decision made, kept with the match: its order in it, the event, the option taken, the player, the assistant's or not. */
export type MatchDecision = {
  sequence: number;
  minute: number;
  kind: ChoiceKind;
  option: ChoiceOption;
  playerId?: string;
  assistant: boolean;
};

/** A match's choice events, for the side that gets them: the boundaries drawn at kick-off, the open event, the decisions. */
export type MatchChoices = {
  side: Side;
  minutes: number[];
  pending: ChoiceEvent | null;
  decisions: MatchDecision[];
};

export type ChoiceIssue = "no-event" | "unknown-option";

export class ChoiceError extends Error {
  constructor(readonly issue: ChoiceIssue) {
    super(`Invalid decision: ${issue}`);
    this.name = "ChoiceError";
  }
}

/** Streams of a match's choice events: the plan, each event's kind and players, each event's outcome. */
const planSeed = (matchSeed: string): string => `${matchSeed}:events`;
const eventSeed = (matchSeed: string, minute: number): string => `${matchSeed}:event:${minute}`;
const outcomeSeed = (matchSeed: string, minute: number): string => `${matchSeed}:event:${minute}:outcome`;

/**
 * The boundaries a match's choice events come at, drawn at kick-off from its stream …:events, whatever happens in the
 * match: 1 to 3 of 15', 30', 60' and 75' (CHOICE_EVENT_COUNT_WEIGHTS), and 105' half the time, if extra time is played.
 */
export function choicePlan(matchSeed: string): number[] {
  const rng = makeRng(planSeed(matchSeed));
  const count = weightedIndex(rng, CHOICE_EVENT_COUNT_WEIGHTS) + 1;
  const pool = [...CHOICE_EVENT_MINUTES];
  const minutes = Array.from({ length: count }, () => pool.splice(randomInt(rng, 0, pool.length - 1), 1)[0]);
  if (rng() < EXTRA_TIME_CHOICE_EVENT_CHANCE) {
    minutes.push(REGULATION_MINUTES + EXTRA_TIME_PERIOD_MINUTES);
  }
  return minutes.sort((a, b) => a - b);
}

/** A match before kick-off with its choice events for one side, the managed club's: their plan, nothing decided yet. */
export function withChoices(state: MatchState, side: Side, matchSeed: string): MatchState {
  return {
    ...state,
    choices: { side, minutes: choicePlan(matchSeed), pending: null, decisions: [] },
    modifiers: { goals: {}, instructions: {}, scheduled: [] },
  };
}

/** A direct free kick's chance: the taker's shooting against the goalkeeper's goalkeeping, within the bounds. */
export function freeKickChance(shooting: number, goalkeeping: number): number {
  const chance =
    FREE_KICK_BASE_CHANCE +
    FREE_KICK_KICKER_FACTOR * (shooting - FREE_KICK_REFERENCE_SHOOTING) -
    FREE_KICK_KEEPER_FACTOR * (goalkeeping - FREE_KICK_REFERENCE_GOALKEEPING);
  return Math.min(FREE_KICK_MAX_CHANCE, Math.max(FREE_KICK_MIN_CHANCE, chance));
}

const byId = (a: { player: { id: string } }, b: { player: { id: string } }): number =>
  a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0;

const onPitch = (state: MatchState, side: Side): PitchEntry[] => state[side].pitch.filter((entry) => entry.status === "ON");

const outfieldOnPitch = (state: MatchState, side: Side): PitchEntry[] =>
  onPitch(state, side)
    .filter((entry) => entry.slot !== "GK")
    .sort(byId);

/** The goalkeeper a kick is taken against: the one in goal, or the best at it on the pitch if he is gone. */
function goalkeepingOf(state: MatchState, side: Side): number {
  const players = onPitch(state, side);
  const inGoal = players.find((entry) => entry.slot === "GK");
  return inGoal?.player.goalkeeping ?? Math.max(0, ...players.map((entry) => entry.player.goalkeeping));
}

const otherSide = (side: Side): Side => (side === "home" ? "away" : "home");

/** The fitness a player has lost on the pitch so far. */
const lostAt = (entry: PitchEntry, minute: number): number => entry.player.fitness - fitnessAt(entry, minute);

/** The player of the side who has lost the most fitness on the pitch, ties to the one rated lowest in his slot. */
function mostExhausted(entries: readonly PitchEntry[], minute: number): PitchEntry | undefined {
  return [...entries].sort(
    (a, b) =>
      lostAt(b, minute) - lostAt(a, minute) || ratingAt(a.player, a.slot) - ratingAt(b.player, b.slot) || byId(a, b),
  )[0];
}

/** Whether an event of a kind may come at a boundary, from the match as it stands. */
export function isChoicePossible(kind: ChoiceKind, state: MatchState, side: Side, minute: number): boolean {
  const outfield = outfieldOnPitch(state, side);
  const canChange = substitutionsLeft(state, side, minute) > 0;
  const margin = state[side].goals - state[otherSide(side)].goals;
  switch (kind) {
    case "PENALTY":
    case "FREE_KICK":
    case "SCUFFLE":
      return outfield.length > 0 && onPitch(state, otherSide(side)).length > 0;
    case "HOTHEAD":
      return minute >= HOTHEAD_MINUTE && canChange && outfield.some((entry) => state[side].booked.includes(entry.player.id));
    case "KNOCK":
      return canChange && outfield.some((entry) => entry.hurt !== true);
    case "EXHAUSTED":
      return minute >= EXHAUSTED_MINUTE && canChange && outfield.some((entry) => lostAt(entry, minute) >= EXHAUSTED_FITNESS_LOST);
    case "LEADING":
      return TACTICAL_CHOICE_MINUTES.includes(minute) && margin >= 1 && margin <= LEADING_MAX_MARGIN;
    case "CHASING":
      return TACTICAL_CHOICE_MINUTES.includes(minute) && margin <= 0;
  }
}

/** The event of a kind at a boundary, as openChoice draws it: the player it is about (drawn from rng when it needs one), its options, and the assistant's. */
export function choiceEvent(kind: ChoiceKind, state: MatchState, side: Side, minute: number, rng: Rng): ChoiceEvent {
  const outfield = outfieldOnPitch(state, side);
  const about = (entry: PitchEntry, options: OfferedOption["option"][], assistant: number): ChoiceEvent => ({
    minute,
    kind,
    playerId: entry.player.id,
    options: options.map((option) => ({ option, playerId: entry.player.id })),
    assistant,
  });
  switch (kind) {
    case "PENALTY": {
      const keeping = goalkeepingOf(state, otherSide(side));
      const takers = outfield
        .map((entry) => ({ entry, chance: shootoutChance(entry.player.shooting, keeping) }))
        .sort((a, b) => b.chance - a.chance || byId(a.entry, b.entry))
        .slice(0, PENALTY_TAKERS);
      return {
        minute,
        kind,
        options: takers.map(({ entry, chance }) => ({ option: "TAKER", playerId: entry.player.id, chance })),
        assistant: 0,
      };
    }
    case "FREE_KICK": {
      const [taker] = [...outfield].sort((a, b) => b.player.shooting - a.player.shooting || byId(a, b));
      const chance = freeKickChance(taker.player.shooting, goalkeepingOf(state, otherSide(side)));
      return {
        minute,
        kind,
        playerId: taker.player.id,
        options: [{ option: "SHOOT", playerId: taker.player.id, chance }, { option: "COMBINE" }],
        assistant: taker.player.shooting >= FREE_KICK_ASSISTANT_SHOOTING ? 0 : 1,
      };
    }
    case "HOTHEAD":
      return about(pick(rng, outfield.filter((entry) => state[side].booked.includes(entry.player.id))), ["TAKE_OFF", "KEEP"], 0);
    case "SCUFFLE": {
      const [captain] = [...outfield].sort((a, b) => b.player.overall - a.player.overall || byId(a, b));
      return {
        minute,
        kind,
        playerId: captain.player.id,
        options: [{ option: "CALM" }, { option: "PROTEST", playerId: captain.player.id }],
        assistant: 0,
      };
    }
    case "KNOCK":
      return about(pick(rng, outfield.filter((entry) => entry.hurt !== true)), ["TAKE_OFF", "PLAY_ON"], 0);
    case "EXHAUSTED": {
      const exhausted = mostExhausted(outfield, minute);
      if (exhausted === undefined) {
        throw new Error("An exhausted player event without a player"); // unreachable: isChoicePossible found one
      }
      return about(exhausted, ["REPLACE", "KEEP"], 0);
    }
    case "LEADING":
      return {
        minute,
        kind,
        options: [{ option: "DEFEND" }, { option: "ATTACK" }, { option: "STEADY" }],
        assistant: assistantInstruction(state, side, minute) === "DEFEND" ? 0 : 2,
      };
    case "CHASING":
      return {
        minute,
        kind,
        options: [{ option: "ATTACK" }, { option: "STEADY" }],
        assistant: state[side].goals < state[otherSide(side)].goals ? 0 : 1,
      };
  }
}

/**
 * At a boundary where the plan has a choice event and none is open yet: the event, drawn among the kinds possible as
 * the match stands (CHOICE_EVENT_WEIGHTS), its players too, from the event's own stream (…:event:15). Unchanged anywhere
 * else, and in a match without choice events.
 */
export function openChoice(state: MatchState, matchSeed: string): MatchState {
  const choices = state.choices;
  const minute = state.played;
  if (
    choices === undefined ||
    choices.pending !== null ||
    (state.phase !== "IN_PLAY" && state.phase !== "EXTRA_TIME_BREAK") ||
    !choices.minutes.includes(minute) ||
    choices.decisions.some((decision) => decision.minute === minute)
  ) {
    return state;
  }
  const kinds = CHOICE_KINDS.filter((kind) => isChoicePossible(kind, state, choices.side, minute));
  if (kinds.length === 0) {
    return state;
  }
  const rng = makeRng(eventSeed(matchSeed, minute));
  const kind = kinds[weightedIndex(rng, kinds.map((candidate) => CHOICE_EVENT_WEIGHTS[candidate]))];
  return { ...state, choices: { ...choices, pending: choiceEvent(kind, state, choices.side, minute, rng) } };
}

const modifiersOf = (state: MatchState): MatchModifiers => state.modifiers ?? { goals: {}, instructions: {}, scheduled: [] };

/** The side's expected goals multiplied in the next segment. */
function withGoals(state: MatchState, side: Side, factor: number): MatchState {
  const modifiers = modifiersOf(state);
  return { ...state, modifiers: { ...modifiers, goals: { ...modifiers.goals, [side]: (modifiers.goals[side] ?? 1) * factor } } };
}

/** The side's instruction for the rest of regular time. */
function withInstruction(state: MatchState, side: Side, instruction: Instruction): MatchState {
  const modifiers = modifiersOf(state);
  return { ...state, modifiers: { ...modifiers, instructions: { ...modifiers.instructions, [side]: instruction } } };
}

function withScheduled(state: MatchState, incident: ScheduledIncident): MatchState {
  const modifiers = modifiersOf(state);
  return { ...state, modifiers: { ...modifiers, scheduled: [...modifiers.scheduled, incident] } };
}

/** A whole number from min to max, from a uniform draw u in [0, 1). */
const within = (min: number, max: number, u: number): number => min + Math.floor(u * (max - min + 1));

function playerOf(option: OfferedOption): string {
  if (option.playerId === undefined) {
    throw new Error(`Option ${option.option} names no player`);
  }
  return option.playerId;
}

/**
 * What an option does, from three uniform draws of the event's outcome stream, the same whatever the option: a better
 * taker only turns a miss into a goal. Immediate incidents are dated the minute after the boundary, as half-time
 * substitutions; later ones are set for the coming segments (a red card in the next one, an injury in the rest of the
 * match).
 */
function applyOption(state: MatchState, side: Side, event: ChoiceEvent, chosen: OfferedOption, draws: readonly number[]): MatchState {
  const [first, second, third] = draws;
  const at = event.minute + 1;
  const end = event.minute < REGULATION_MINUTES ? REGULATION_MINUTES : EXTRA_TIME_END_MINUTE;
  switch (chosen.option) {
    case "TAKER":
    case "SHOOT":
      return first < (chosen.chance ?? 0) ? goalAt(state, side, playerOf(chosen), at) : state;
    case "COMBINE":
      return withGoals(state, side, FREE_KICK_COMBINATION_GOALS);
    case "TAKE_OFF":
    case "REPLACE":
      return substitutionAt(state, side, playerOf(chosen), event.minute);
    case "KEEP":
      if (event.kind === "HOTHEAD") {
        return first < HOTHEAD_RED_CHANCE
          ? withScheduled(state, { minute: at + Math.floor(second * SEGMENT_MINUTES), side, kind: "RED_CARD", playerId: playerOf(chosen), days: 0 })
          : state;
      }
      return first < EXHAUSTED_INJURY_CHANCE
        ? withScheduled(state, {
            minute: within(at, end, second),
            side,
            kind: "INJURY",
            playerId: playerOf(chosen),
            days: within(INJURY_DAYS_MIN, INJURY_DAYS_MAX, third),
          })
        : state;
    case "CALM":
      return state;
    case "STEADY":
      return withInstruction(state, side, "BALANCED");
    case "PROTEST": {
      const pushed = first < PROTEST_GOALS_CHANCE ? withGoals(state, side, PROTEST_GOALS) : state;
      return second < PROTEST_YELLOW_CHANCE ? bookingAt(pushed, side, playerOf(chosen), at) : pushed;
    }
    case "PLAY_ON": {
      const playerId = playerOf(chosen);
      const hurt: MatchState = {
        ...state,
        [side]: {
          ...state[side],
          pitch: state[side].pitch.map((entry) => (entry.player.id === playerId ? { ...entry, hurt: true } : entry)),
        },
      };
      return first < KNOCK_INJURY_CHANCE
        ? withScheduled(hurt, {
            minute: within(at, end, second),
            side,
            kind: "INJURY",
            playerId,
            days: within(KNOCK_INJURY_DAYS_MIN, KNOCK_INJURY_DAYS_MAX, third),
          })
        : hurt;
    }
    case "DEFEND":
    case "ATTACK":
      return withInstruction(state, side, chosen.option);
  }
}

/** The option a decision names among those offered, or -1: a penalty's taker must be one of the takers offered. */
export function optionIndex(event: ChoiceEvent, decision: Decision): number {
  return event.options.findIndex(
    (offered) => offered.option === decision.option && (offered.option !== "TAKER" || offered.playerId === decision.playerId),
  );
}

/**
 * The manager's decision on the open event (null: his assistant's): what it does now and what it leaves for the
 * segments to come, drawn from the event's outcome stream (…:event:15:outcome), then the decision recorded. Throws a
 * ChoiceError when no event is open or the decision is not one offered.
 */
export function decideChoice(state: MatchState, matchSeed: string, decision: Decision | null): MatchState {
  const choices = state.choices;
  const event = choices?.pending ?? null;
  if (choices === undefined || event === null) {
    throw new ChoiceError("no-event");
  }
  const index = decision === null ? event.assistant : optionIndex(event, decision);
  if (index < 0) {
    throw new ChoiceError("unknown-option");
  }
  const chosen = event.options[index];
  const rng = makeRng(outcomeSeed(matchSeed, event.minute));
  const decided = applyOption(state, choices.side, event, chosen, [rng(), rng(), rng()]);
  const playerId = chosen.playerId ?? event.playerId;
  const record: MatchDecision = {
    sequence: choices.decisions.length + 1,
    minute: event.minute,
    kind: event.kind,
    option: chosen.option,
    ...(playerId === undefined ? {} : { playerId }),
    assistant: index === event.assistant,
  };
  return { ...decided, choices: { ...choices, pending: null, decisions: [...choices.decisions, record] } };
}

/**
 * The managed club's choice events decided by its assistant, as in a simulated match (simulateMatch's atBoundary): at
 * kick-off their plan, at each planned boundary the event and the assistant's decision. Watching the match and taking
 * the assistant's decisions at each pause plays the very same match.
 */
export function assistantChoices(side: Side, matchSeed: string): BoundaryHook {
  return (state) => {
    if (state.choices === undefined) {
      return withChoices(state, side, matchSeed);
    }
    const opened = openChoice(state, matchSeed);
    return opened.choices?.pending ? decideChoice(opened, matchSeed, null) : opened;
  };
}
