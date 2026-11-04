import { makeRng, poisson, randomInt, weightedIndex, type Rng } from "../lib/rng";
import {
  ASSIST_CHANCE,
  ASSIST_SLOT_WEIGHTS,
  ASSISTANT_ATTACK_MINUTE,
  ASSISTANT_DEFEND_MINUTE,
  BOOKED_PLAYER_CARD_FACTOR,
  CARD_SLOT_WEIGHTS,
  CONDITION_NEUTRAL,
  EXTRA_TIME_END_MINUTE,
  EXTRA_TIME_GOAL_WEIGHTS,
  EXTRA_TIME_INTENSITY,
  EXTRA_TIME_PERIOD_MINUTES,
  EXTRA_TIME_SUBSTITUTIONS,
  FORM_BY_OUTCOME,
  FORM_PER_ASSIST,
  FORM_PER_GOAL,
  FORM_REST_DRIFT,
  FORM_RETENTION,
  FORM_SENT_OFF,
  HALF_TIME_MINUTE,
  HOME_ADVANTAGE,
  INJURIES_PER_TEAM,
  INJURY_DAYS_MAX,
  INJURY_DAYS_MIN,
  INSTRUCTION_EFFECTS,
  KNOCK_SHARE,
  MAX_EXPECTED_GOALS,
  MAX_STOPPAGE_MINUTES,
  MAX_SUBSTITUTION_WINDOWS,
  MAX_SUBSTITUTIONS,
  OTHER_MATCH_EVENT_TYPES,
  OWN_GOALS_WITH_CHOICE_EVENTS,
  RED_CARDS_PER_TEAM,
  REGULATION_GOAL_WEIGHTS,
  REGULATION_MINUTES,
  SCORER_SLOT_WEIGHTS,
  SEGMENT_MINUTES,
  SHOOTOUT_BASE_CHANCE,
  SHOOTOUT_KEEPER_FACTOR,
  SHOOTOUT_KICKER_FACTOR,
  SHOOTOUT_KICKS,
  SHOOTOUT_MAX_CHANCE,
  SHOOTOUT_MIN_CHANCE,
  SHOOTOUT_REFERENCE_RATING,
  SUBSTITUTION_MINUTE_MAX,
  SUBSTITUTION_MINUTE_MIN,
  SUBSTITUTIONS_PER_TEAM,
  YELLOW_CARDS_PER_TEAM,
} from "./balance";
import type { MatchChoices, MatchDecision } from "./choices";
import { fitnessAfter, fitnessFactor, injuryRiskFactor, wearFactor } from "./fitness";
import { DEFAULT_FORMATION_NAME, formationPositions, type FormationName } from "./formations";
import { clampRating } from "./generation";
import { DEFAULT_INSTRUCTION, type Instruction, type InstructionSource, type InstructionSpan } from "./instructions";
import type { Lineup, SquadPlayer } from "./lineup";
import { positionGroup, ratingAt, type Position } from "./positions";
import { expectedGoals, formationStrength, type TeamStrength } from "./strength";

export type { Instruction, InstructionSource, InstructionSpan } from "./instructions";
export type { TeamStrength } from "./strength";

export type Side = "home" | "away";

export type Outcome = "win" | "draw" | "loss";

export type MatchEventType =
  | "GOAL"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "INJURY"
  | "SUBSTITUTION"
  | "SHOOTOUT_GOAL"
  | "SHOOTOUT_MISS";

/** Where an event of a knockout match happened past regular time; absent for regular time, stoppage time included. */
export type EventPeriod = "EXTRA_TIME" | "SHOOTOUT";

export type MatchEvent = {
  minute: number; // 1–90, above 90 in stoppage time; 91–120 in extra time; the kick's number in a shoot-out
  side: Side;
  type: MatchEventType;
  playerId: string; // GOAL: the scorer; SUBSTITUTION: the player coming on; SHOOTOUT_*: the kicker
  relatedPlayerId?: string; // GOAL: the assist provider, if any; SUBSTITUTION: the player going off; SHOOTOUT_*: the goalkeeper
  period?: EventPeriod;
};

/** How a knockout match was won: in 90 minutes, in extra time, or in a shoot-out. */
export type DecidedBy = "REGULATION" | "EXTRA_TIME" | "PENALTIES";

export type Appearance = {
  playerId: string;
  side: Side;
  slot: Position;
  from: number; // minute the player came on, 0 for starters, HALF_TIME_MINUTE for a half-time substitute
  to: number; // minute the player went off, or the final whistle
  minutes: number; // minutes played, stoppage time excluded, at least 1
};

export type Injury = {
  playerId: string;
  side: Side;
  days: number;
};

export type MatchResult = {
  homeGoals: number;
  awayGoals: number;
  homeHalfTimeGoals: number;
  awayHalfTimeGoals: number;
  fullTime: number; // minute of the final whistle, stoppage time included; 120 after extra time
  events: MatchEvent[]; // in chronological order
  appearances: Appearance[]; // one per player who took part
  injuries: Injury[];
  // A knockout match only: how it was decided, and the shoot-out's score when there was one.
  decidedBy?: DecidedBy;
  homePenalties?: number;
  awayPenalties?: number;
  decisions?: MatchDecision[]; // a match of the managed club: its choice events and the decisions made
};

export type PlayerMatchStats = {
  playerId: string;
  side: Side;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

/**
 * A period of play: the first half from 1' to 45', the second from 46' to the final whistle; in a knockout match level
 * after 90 minutes, the two periods of extra time, 91' to 105' and 106' to 120'.
 */
export type Period = "h1" | "h2" | "e1" | "e2";

/**
 * The engine's unit of play, 15 minutes: s1 to s3 make the first half, s4 to s6 the second (s6 running into stoppage
 * time), e1 and e2 the periods of extra time. Each is played from the strengths at its start, with a stream of its own.
 */
export type Segment = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "e1" | "e2";

/** A segment's stream, or the shoot-out's: a knockout match level after extra time ends in one. */
export type RngPhase = Segment | "shootout";

/**
 * Where a match stands. IN_PLAY: between two segments of a half, never a break; REGULATION_END: a knockout match level
 * after 90 minutes, before extra time; EXTRA_TIME_BREAK: between its two periods; SHOOTOUT: level after 120 minutes,
 * before the shoot-out. A league match never sees the last three.
 */
export type MatchPhase = "KICK_OFF" | "IN_PLAY" | "HALF_TIME" | "REGULATION_END" | "EXTRA_TIME_BREAK" | "SHOOTOUT" | "FULL_TIME";

/** Instructions given for every segment played, by side; a side left out follows the assistant's rule. */
export type Instructions = Partial<Record<Side, Instruction>>;

/**
 * A player in a slot of the formation. INJURED and SENT_OFF keep the player who left the slot, for the half-time
 * screen: an injured player's slot is empty until someone replaces him, a sent-off player's slot stays empty.
 */
export type PitchEntry = {
  index: number; // the slot's index in the formation
  slot: Position;
  player: SquadPlayer;
  from: number; // minute the player came on, 0 for starters, HALF_TIME_MINUTE for a half-time substitute
  status: "ON" | "INJURED" | "SENT_OFF";
  hurt?: true; // played on after a knock (a choice event): his share is KNOCK_SHARE of what it was
};

export type TeamLive = {
  formation: FormationName;
  pitch: PitchEntry[]; // at most one entry per slot index
  bench: SquadPlayer[]; // substitutes still available: a player who went off never comes back
  substitutions: number; // made so far, at most MAX_SUBSTITUTIONS
  booked: string[]; // players with a yellow card
  goals: number;
  // Minutes it made a tactical substitution at during play, each one of its windows (MAX_SUBSTITUTION_WINDOWS); absent
  // before the first.
  windows?: number[];
  // Its manager makes its substitutions himself since he made one in a live match: no tactical one is drawn for it any
  // more. An injured player is still replaced at once.
  manual?: true;
  // The instruction it starts with, its manager's, saved with his lineup: its assistant's rule comes back to it whenever
  // it has nothing to say. Absent for Équilibré, as AI clubs always start.
  startingInstruction?: Instruction;
  // The instructions it has played its segments with, a span at each change, and who set each; absent before kick-off.
  instructions?: InstructionSpan[];
};

/** An incident a choice event has set for later: a named player sent off, or injured for some days, at a minute. */
export type ScheduledIncident = { minute: number; side: Side; kind: "RED_CARD" | "INJURY"; playerId: string; days: number };

/**
 * What choice events and managers leave on a match for the segments that follow: a side's expected goals multiplied in
 * the next segment, a side's instruction for the rest of the period of play it was given in (regular time, or extra time),
 * incidents set for later.
 */
export type MatchModifiers = {
  goals: Partial<Record<Side, number>>;
  instructions: Partial<Record<Side, Instruction>>;
  // Who gave each of those instructions; absent from a state paused before it was kept: its manager.
  givenBy?: Partial<Record<Side, GivenBy>>;
  scheduled: ScheduledIncident[];
};

/** Who gives a side an instruction during its match: its manager at a pause, or a choice event's decision. */
export type GivenBy = Extract<InstructionSource, "MANAGER" | "EVENT">;

/** Everything a match carries from one segment to the next; plain data, stored as is while a match is paused. */
export type MatchState = {
  phase: MatchPhase;
  played: number; // minutes behind the match: 0 before kick-off, 15 after its first segment, 90 after regular time, 120 after extra time
  fullTime: number | null; // drawn with the second half
  home: TeamLive;
  away: TeamLive;
  events: MatchEvent[]; // in chronological order
  appearances: Appearance[]; // of the players who already went off
  injuries: Injury[];
  // A knockout match only (cup): it cannot end level. Absent from a league match, whose state is unchanged.
  knockout?: true;
  regulationTime?: number; // minute the 90 minutes ended at, stoppage time included, when extra time followed
  penalties?: Record<Side, number>; // the shoot-out's score
  // The managed club's matches only: its choice events (choices.ts), and what they leave for the segments to come.
  choices?: MatchChoices;
  modifiers?: MatchModifiers;
};

/**
 * A team's changes at a pause of its match, half-time first of all, hence the name: its formation, who plays in which
 * slot, and the substitutions made.
 */
export type HalfTimeChoice = {
  formation: FormationName;
  starters: { slot: number; playerKey: string }[];
  substitutions: { in: string; out: string }[];
};

export type HalfTimeChoiceIssue =
  | "not-half-time" // the match waits at no pause
  | "too-many-substitutions"
  | "no-window" // substitutions during play, the side's windows all used
  | "unknown-player-off" // the player going off is neither on the pitch nor injured in this match
  | "sent-off-player" // a sent-off player is never replaced and never plays again
  | "unknown-substitute" // the player coming on is not on the bench: not a substitute, or already went off
  | "duplicate-player"
  | "invalid-slot"
  | "sent-off-slot" // a sent-off player's slot stays empty
  | "lineup-mismatch" // the eleven is not the players on the pitch after the substitutions
  | "incomplete-lineup"; // a slot is left empty while a substitution and a substitute remain

export class HalfTimeChoiceError extends Error {
  constructor(readonly issue: HalfTimeChoiceIssue) {
    super(`Invalid half-time choice: ${issue}`);
    this.name = "HalfTimeChoiceError";
  }
}

const SIDES: readonly Side[] = ["home", "away"];

type IncidentKind = "GOAL" | "YELLOW_CARD" | "RED_CARD" | "INJURY" | "SUBSTITUTION";

/** At the same minute, goals and cards come before players leave or come on. */
const INCIDENT_ORDER: Readonly<Record<IncidentKind, number>> = {
  GOAL: 0,
  YELLOW_CARD: 1,
  RED_CARD: 2,
  INJURY: 3,
  SUBSTITUTION: 4,
};

/** An incident of a segment: drawn by its stream, or set by a choice event for a named player (playerId, days). */
type Incident = { minute: number; side: Side; kind: IncidentKind; playerId?: string; days?: number };

/**
 * Seed of a match stream, built from stable keys (season, matchday, club slugs), never from Fixture.id:
 * a cuid differs from one database to another and would break replays.
 */
export function matchRngSeed(
  saveSeed: string,
  startYear: number,
  round: number,
  homeSlug: string,
  awaySlug: string,
): string {
  return `${saveSeed}:match:${startYear}:${round}:${homeSlug}:${awaySlug}`;
}

/**
 * Seed of a cup match: a key of its own, so that a cup tie never replays the league match of the same round between
 * the same clubs.
 */
export function cupMatchRngSeed(saveSeed: string, startYear: number, round: number, homeSlug: string, awaySlug: string): string {
  return `${saveSeed}:cup:${startYear}:${round}:${homeSlug}:${awaySlug}`;
}

/** Seed of one segment, or of the shoot-out: each has its own stream, so a segment replays from the state before it alone. */
export function phaseRngSeed(matchSeed: string, phase: RngPhase): string {
  return `${matchSeed}:${phase}`;
}

/** Seed of a side's tactical substitutions: their minutes are the same whatever happens in the match. */
function substitutionRngSeed(matchSeed: string, side: Side): string {
  return `${matchSeed}:substitutions:${side}`;
}

const otherSide = (side: Side): Side => (side === "home" ? "away" : "home");

/** A player's fitness at a minute of the match: his fitness at kick-off, less what his time on the pitch has cost. */
export function fitnessAt(entry: PitchEntry, minute: number): number {
  return fitnessAfter(entry.player.fitness, entry.slot, minute - entry.from);
}

/** The players a team has on the pitch, as a lineup, at their fitness of kick-off, with its remaining substitutes. */
export function lineupOnPitch(team: TeamLive): Lineup {
  return {
    starters: team.pitch
      .filter((entry) => entry.status === "ON")
      .sort((a, b) => a.index - b.index)
      .map(({ player, slot, index }) => ({ player, slot, index })),
    bench: team.bench,
  };
}

/** What the match has done to a player at a minute: worn by his time on the pitch, and hurt if he plays on after a knock. */
export function inMatchFactor(entry: PitchEntry, minute: number): number {
  return wearFactor(entry.player.fitness - fitnessAt(entry, minute)) * (entry.hurt === true ? KNOCK_SHARE : 1);
}

/**
 * Attack and defense of a team as it stands at a minute: on ten after a red card, without an injured player until he is
 * replaced, every player at his freshness of kick-off, worn by his time on the pitch, hurt if he plays on after a knock.
 */
export function liveStrength(team: TeamLive, minute: number): TeamStrength {
  const factors = new Map(team.pitch.map((entry) => [entry.index, inMatchFactor(entry, minute)]));
  return formationStrength(lineupOnPitch(team), team.formation, (starter) => factors.get(starter.index) ?? 1);
}

/** The instruction a side started its match with: its manager's starting instruction, Équilibré without one. */
export const startingInstructionOf = (team: TeamLive): Instruction => team.startingInstruction ?? DEFAULT_INSTRUCTION;

/**
 * The instruction a club follows when it leaves it to its assistant, as AI clubs always do and the managed club in a
 * simulated match: Attaquer when behind once ASSISTANT_ATTACK_MINUTE minutes are played, Fermer when one goal ahead once
 * ASSISTANT_DEFEND_MINUTE are, its starting instruction otherwise (Équilibré for AI clubs). `played`: the minutes played
 * when the segment starts.
 */
export function assistantInstruction(state: MatchState, side: Side, played: number): Instruction {
  const margin = state[side].goals - state[otherSide(side)].goals;
  if (margin < 0 && played >= ASSISTANT_ATTACK_MINUTE) {
    return "ATTACK";
  }
  if (margin === 1 && played >= ASSISTANT_DEFEND_MINUTE) {
    return "DEFEND";
  }
  return startingInstructionOf(state[side]);
}

/**
 * A side's instruction given at a pause, by its manager or a choice event: it holds for the rest of the period of play it
 * was given in, regular time or extra time, whatever the score does, until another one is given.
 */
export function giveInstruction(state: MatchState, side: Side, instruction: Instruction, givenBy: GivenBy): MatchState {
  const modifiers = state.modifiers ?? { goals: {}, instructions: {}, scheduled: [] };
  return {
    ...state,
    modifiers: {
      ...modifiers,
      instructions: { ...modifiers.instructions, [side]: instruction },
      givenBy: { ...modifiers.givenBy, [side]: givenBy },
    },
  };
}

/** The instruction a side plays its next segment with: the one given for the period of play, or its assistant's. */
export function instructionAt(state: MatchState, side: Side): Instruction {
  return state.modifiers?.instructions[side] ?? assistantInstruction(state, side, state.played);
}

/** Whether a side may make a tactical substitution at a minute of play: a window left, or one already open then. */
export function windowOpenAt(team: TeamLive, minute: number): boolean {
  const windows = team.windows ?? [];
  return windows.includes(minute) || windows.length < MAX_SUBSTITUTION_WINDOWS;
}

/** A side's windows once it has made a tactical substitution at a minute of play. */
const withWindow = (windows: readonly number[] = [], minute: number): number[] =>
  windows.includes(minute) ? [...windows] : [...windows, minute];

/**
 * Expected goals of each side over 90 minutes as the match stands at a minute: the strengths of the players on the
 * pitch, home advantage, then each side's instruction on its own goals and on its opponent's.
 */
export function stateExpectedGoals(
  state: MatchState,
  instructions: Readonly<Record<Side, Instruction>>,
  minute: number,
): Record<Side, number> {
  const strengths: Record<Side, TeamStrength> = { home: liveStrength(state.home, minute), away: liveStrength(state.away, minute) };
  const expected = (side: Side): number => {
    const opponent = otherSide(side);
    const venue = side === "home" ? HOME_ADVANTAGE : 1 / HOME_ADVANTAGE;
    const instructed =
      expectedGoals(strengths[side], strengths[opponent], venue) *
      INSTRUCTION_EFFECTS[instructions[side]].own *
      INSTRUCTION_EFFECTS[instructions[opponent]].opponent;
    return Math.min(MAX_EXPECTED_GOALS, instructed);
  };
  return { home: expected("home"), away: expected("away") };
}

function startingTeam(lineup: Lineup, formation: FormationName): TeamLive {
  const positions = formationPositions(formation);
  for (const { slot, index } of lineup.starters) {
    if (positions[index] !== slot) {
      throw new RangeError(`Slot ${index} of ${formation} is ${positions[index]}, not ${slot}`);
    }
  }
  const team: TeamLive = {
    formation,
    pitch: lineup.starters.map(({ player, slot, index }) => ({ index, slot, player, from: 0, status: "ON" })),
    bench: [...lineup.bench],
    substitutions: 0,
    booked: [],
    goals: 0,
  };
  // Équilibré leaves the state as it always was.
  return lineup.instruction === undefined || lineup.instruction === DEFAULT_INSTRUCTION
    ? team
    : { ...team, startingInstruction: lineup.instruction };
}

/**
 * A match before kick-off; both lineups are in the 4-3-3 of AI clubs unless told otherwise. A knockout match (cup)
 * cannot end level: extra time, then a shoot-out.
 */
export function startMatch(
  home: Lineup,
  away: Lineup,
  formations: Readonly<Record<Side, FormationName>> = { home: DEFAULT_FORMATION_NAME, away: DEFAULT_FORMATION_NAME },
  knockout: boolean = false,
): MatchState {
  const state: MatchState = {
    phase: "KICK_OFF",
    played: 0,
    fullTime: null,
    home: startingTeam(home, formations.home),
    away: startingTeam(away, formations.away),
    events: [],
    appearances: [],
    injuries: [],
  };
  return knockout ? { ...state, knockout: true } : state;
}

function compareIncidents(a: Incident, b: Incident): number {
  return (
    a.minute - b.minute ||
    INCIDENT_ORDER[a.kind] - INCIDENT_ORDER[b.kind] ||
    SIDES.indexOf(a.side) - SIDES.indexOf(b.side)
  );
}

/** A player on the pitch drawn by weight, or undefined when nobody can be drawn. */
function drawOnPitch(rng: Rng, onPitch: readonly PitchEntry[], weight: (entry: PitchEntry) => number): PitchEntry | undefined {
  const weights = onPitch.map(weight);
  return weights.some((value) => value > 0) ? onPitch[weightedIndex(rng, weights)] : undefined;
}

/**
 * The outfield starter still on the pitch most tired at a minute: the one making way for a tactical substitution. Ties,
 * as when every starter began the match rested, go to the one rated lowest in his slot, then by id.
 */
function mostTiredStarter(onPitch: readonly PitchEntry[], minute: number): PitchEntry | undefined {
  let tired: PitchEntry | undefined;
  for (const entry of onPitch) {
    if (entry.slot === "GK" || entry.from !== 0) {
      continue;
    }
    if (tired === undefined) {
      tired = entry;
      continue;
    }
    const gap = fitnessAt(entry, minute) - fitnessAt(tired, minute);
    const rating = ratingAt(entry.player, entry.slot);
    const tiredRating = ratingAt(tired.player, tired.slot);
    if (gap < 0 || (gap === 0 && (rating < tiredRating || (rating === tiredRating && entry.player.id < tired.player.id)))) {
      tired = entry;
    }
  }
  return tired;
}

/** Bench player replacing someone in a slot: the one rated best in that slot, his fitness counted, ties broken by id. */
function replacementIndex(bench: readonly SquadPlayer[], slot: Position): number {
  const level = (player: SquadPlayer): number => ratingAt(player, slot) * fitnessFactor(player.fitness);
  let best = 0;
  bench.forEach((player, index) => {
    const rating = level(player);
    const bestRating = level(bench[best]);
    if (rating > bestRating || (rating === bestRating && player.id < bench[best].id)) {
      best = index;
    }
  });
  return best;
}

/**
 * A player's time on the pitch, stoppage time excluded: minutes count up to the 90th, or up to the 120th when he played
 * in extra time (lastCountedMinute).
 */
function toAppearance(entry: PitchEntry, side: Side, to: number, lastCountedMinute: number = REGULATION_MINUTES): Appearance {
  return {
    playerId: entry.player.id,
    side,
    slot: entry.slot,
    from: entry.from,
    to,
    minutes: Math.max(1, Math.min(to, lastCountedMinute) - Math.min(entry.from, lastCountedMinute)),
  };
}

function cloneTeam(team: TeamLive): TeamLive {
  return { ...team, pitch: team.pitch.map((entry) => ({ ...entry })), bench: [...team.bench], booked: [...team.booked] };
}

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    home: cloneTeam(state.home),
    away: cloneTeam(state.away),
    events: [...state.events],
    appearances: [...state.appearances],
    injuries: [...state.injuries],
  };
}

const onPitch = (team: TeamLive): PitchEntry[] => team.pitch.filter((entry) => entry.status === "ON");

/**
 * Where each segment sits in a match: its first and last minutes, the phase it starts from, and its weight in the
 * match's goals (REGULATION_GOAL_WEIGHTS, EXTRA_TIME_GOAL_WEIGHTS).
 */
const SEGMENTS: Readonly<Record<Segment, { first: number; last: number; from: MatchPhase; goalWeight: number }>> = {
  s1: { first: 1, last: SEGMENT_MINUTES, from: "KICK_OFF", goalWeight: REGULATION_GOAL_WEIGHTS[0] },
  s2: { first: SEGMENT_MINUTES + 1, last: 2 * SEGMENT_MINUTES, from: "IN_PLAY", goalWeight: REGULATION_GOAL_WEIGHTS[1] },
  s3: { first: 2 * SEGMENT_MINUTES + 1, last: HALF_TIME_MINUTE, from: "IN_PLAY", goalWeight: REGULATION_GOAL_WEIGHTS[2] },
  s4: {
    first: HALF_TIME_MINUTE + 1,
    last: HALF_TIME_MINUTE + SEGMENT_MINUTES,
    from: "HALF_TIME",
    goalWeight: REGULATION_GOAL_WEIGHTS[3],
  },
  s5: {
    first: HALF_TIME_MINUTE + SEGMENT_MINUTES + 1,
    last: HALF_TIME_MINUTE + 2 * SEGMENT_MINUTES,
    from: "IN_PLAY",
    goalWeight: REGULATION_GOAL_WEIGHTS[4],
  },
  s6: {
    first: HALF_TIME_MINUTE + 2 * SEGMENT_MINUTES + 1,
    last: REGULATION_MINUTES,
    from: "IN_PLAY",
    goalWeight: REGULATION_GOAL_WEIGHTS[5],
  },
  e1: {
    first: REGULATION_MINUTES + 1,
    last: REGULATION_MINUTES + EXTRA_TIME_PERIOD_MINUTES,
    from: "REGULATION_END",
    goalWeight: EXTRA_TIME_GOAL_WEIGHTS[0],
  },
  e2: {
    first: REGULATION_MINUTES + EXTRA_TIME_PERIOD_MINUTES + 1,
    last: EXTRA_TIME_END_MINUTE,
    from: "EXTRA_TIME_BREAK",
    goalWeight: EXTRA_TIME_GOAL_WEIGHTS[1],
  },
};

/** The segments of each period, played in this order. */
const PERIOD_SEGMENTS: Readonly<Record<Period, readonly Segment[]>> = {
  h1: ["s1", "s2", "s3"],
  h2: ["s4", "s5", "s6"],
  e1: ["e1"],
  e2: ["e2"],
};

/** The minutes of a side's tactical substitutions in the second half, drawn from their own stream. */
function tacticalSubstitutionMinutes(matchSeed: string, side: Side): number[] {
  const rng = makeRng(substitutionRngSeed(matchSeed, side));
  return Array.from({ length: SUBSTITUTIONS_PER_TEAM }, () => randomInt(rng, SUBSTITUTION_MINUTE_MIN, SUBSTITUTION_MINUTE_MAX));
}

/**
 * Plays one segment from the state it starts in, with its own stream, and returns the state after it:
 * 1. attack and defense of the players on the pitch, weighted by slot, familiarity, form, morale and fitness at the
 *    segment's start, the formation's profile applied, on ten after a red card; then each side's instruction, the one
 *    given or its assistant's;
 * 2. the segment's share of the match's expected goals, cards and injuries, counted with Poisson draws and spread over
 *    its minutes (the last segment of regular time runs into stoppage time); a side's injuries grow with its players'
 *    tiredness (injuryRiskFactor);
 * 3. scorers, assist providers, booked and injured players drawn among the players on the pitch at that minute, the
 *    tired ones likelier to get injured.
 * An injured player is replaced at once by the substitute rated best in his slot while substitutions remain, tactical
 * substitutions take off the most tired starters at their minutes of the second half, a sent-off player is never
 * replaced: each change counts from the next segment.
 */
export function simulateSegment(start: MatchState, matchSeed: string, segment: Segment, instructions: Instructions = {}): MatchState {
  const { first, last, from, goalWeight } = SEGMENTS[segment];
  if (start.phase !== from) {
    throw new Error(`Cannot play segment ${segment} of a match at ${start.phase}`);
  }
  const rng = makeRng(phaseRngSeed(matchSeed, segment));
  const extraTime = segment === "e1" || segment === "e2";
  const substitutionLimit = extraTime ? MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS : MAX_SUBSTITUTIONS;
  const lastCounted = extraTime ? EXTRA_TIME_END_MINUTE : REGULATION_MINUTES;
  // Events past regular time are marked; a regular segment's events keep the shape they always had.
  const mark = (event: MatchEvent): MatchEvent => (extraTime ? { ...event, period: "EXTRA_TIME" } : event);
  const state = cloneState(start);
  const teams: Record<Side, TeamLive> = { home: state.home, away: state.away };

  const lastMinute = segment === "s6" ? REGULATION_MINUTES + randomInt(rng, 0, MAX_STOPPAGE_MINUTES) : last;
  const played = first - 1;
  const modifiers = state.modifiers;
  // A side's instruction: the one given for the whole match, else the one its manager or a choice event gave for the
  // period of play, else its assistant's, his rule or its starting instruction.
  const instructionOf = (side: Side): Instruction =>
    instructions[side] ?? modifiers?.instructions[side] ?? assistantInstruction(state, side, played);
  const sourceOf = (side: Side, instruction: Instruction): InstructionSource => {
    if (instructions[side] === undefined && modifiers?.instructions[side] !== undefined) {
      return modifiers.givenBy?.[side] ?? "MANAGER";
    }
    return instructions[side] === undefined && instruction !== startingInstructionOf(teams[side]) ? "ASSISTANT" : "START";
  };
  for (const side of SIDES) {
    const instruction = instructionOf(side);
    const source = sourceOf(side, instruction);
    const last = teams[side].instructions?.at(-1);
    if (last === undefined || last.instruction !== instruction || last.source !== source) {
      teams[side].instructions = [...(teams[side].instructions ?? []), { from: played, instruction, source }];
    }
  }
  const expected = stateExpectedGoals(state, { home: instructionOf("home"), away: instructionOf("away") }, played);
  // The mean of the injury risks of a side's players on the pitch: 1 while all of them are fit enough.
  const injuryRisk = (side: Side): number => {
    const players = onPitch(teams[side]);
    return players.length === 0
      ? 1
      : players.reduce((sum, entry) => sum + injuryRiskFactor(fitnessAt(entry, played)), 0) / players.length;
  };
  const share = SEGMENT_MINUTES / REGULATION_MINUTES;
  // Goals come late in a match: each segment's weight in them.
  const goalShare = share * goalWeight * (extraTime ? EXTRA_TIME_INTENSITY : 1);

  const incidents: Incident[] = [];
  const schedule = (side: Side, kind: IncidentKind, count: number): void => {
    for (let index = 0; index < count; index++) {
      incidents.push({ minute: randomInt(rng, first, lastMinute), side, kind });
    }
  };
  // The managed club's choice events score some of its goals: the rest of its play scores fewer.
  const choiceGoals = (side: Side): number => (state.choices?.side === side ? OWN_GOALS_WITH_CHOICE_EVENTS : 1);
  for (const side of SIDES) {
    // A choice event may have multiplied the side's goals in this segment.
    schedule(side, "GOAL", poisson(rng, expected[side] * goalShare * choiceGoals(side) * (modifiers?.goals[side] ?? 1)));
    schedule(side, "YELLOW_CARD", poisson(rng, YELLOW_CARDS_PER_TEAM * share));
    schedule(side, "RED_CARD", poisson(rng, RED_CARDS_PER_TEAM * share));
    schedule(side, "INJURY", poisson(rng, INJURIES_PER_TEAM * share * injuryRisk(side)));
    if (segment === "e1") {
      schedule(side, "SUBSTITUTION", EXTRA_TIME_SUBSTITUTIONS);
    } else if (!extraTime && first <= SUBSTITUTION_MINUTE_MAX && lastMinute >= SUBSTITUTION_MINUTE_MIN) {
      for (const minute of tacticalSubstitutionMinutes(matchSeed, side)) {
        if (minute >= first && minute <= lastMinute) {
          incidents.push({ minute, side, kind: "SUBSTITUTION" });
        }
      }
    }
  }
  // Incidents a choice event set for this segment: named players, drawn by the event's own stream, not this one.
  for (const scheduled of modifiers?.scheduled ?? []) {
    if (scheduled.minute >= first && scheduled.minute <= lastMinute) {
      incidents.push({ ...scheduled });
    }
  }
  incidents.sort(compareIncidents);

  const leave = (side: Side, entry: PitchEntry, minute: number, status: "INJURED" | "SENT_OFF"): void => {
    state.appearances.push(toAppearance(entry, side, minute, lastCounted));
    entry.status = status;
  };

  /** Puts the substitute rated best in the slot in place of the player who left it, while substitutions remain. */
  const substitute = (side: Side, leaving: PitchEntry, minute: number): void => {
    const team = teams[side];
    if (team.substitutions >= substitutionLimit || team.bench.length === 0) {
      return;
    }
    const [player] = team.bench.splice(replacementIndex(team.bench, leaving.slot), 1);
    team.substitutions++;
    team.pitch[team.pitch.indexOf(leaving)] = { index: leaving.index, slot: leaving.slot, player, from: minute, status: "ON" };
    state.events.push(mark({ minute, side, type: "SUBSTITUTION", playerId: player.id, relatedPlayerId: leaving.player.id }));
  };

  // A player a choice event named, if he is still on the pitch.
  const named = (team: TeamLive, playerId: string): PitchEntry | undefined =>
    onPitch(team).find((entry) => entry.player.id === playerId);

  for (const { minute, side, kind, playerId, days } of incidents) {
    const team = teams[side];
    switch (kind) {
      case "GOAL": {
        const players = onPitch(team);
        const scorer = drawOnPitch(rng, players, ({ player, slot }) => SCORER_SLOT_WEIGHTS[positionGroup(slot)] * player.shooting);
        if (scorer === undefined) {
          break;
        }
        team.goals++;
        let assistProviderId: string | undefined;
        if (rng() < ASSIST_CHANCE) {
          const assist = drawOnPitch(rng, players, (entry) =>
            entry === scorer ? 0 : ASSIST_SLOT_WEIGHTS[positionGroup(entry.slot)] * entry.player.passing,
          );
          assistProviderId = assist?.player.id;
        }
        state.events.push(
          mark(
            assistProviderId === undefined
              ? { minute, side, type: "GOAL", playerId: scorer.player.id }
              : { minute, side, type: "GOAL", playerId: scorer.player.id, relatedPlayerId: assistProviderId },
          ),
        );
        break;
      }
      case "YELLOW_CARD": {
        const booked = drawOnPitch(
          rng,
          onPitch(team),
          ({ player, slot }) =>
            CARD_SLOT_WEIGHTS[positionGroup(slot)] * (team.booked.includes(player.id) ? BOOKED_PLAYER_CARD_FACTOR : 1),
        );
        if (booked === undefined) {
          break;
        }
        state.events.push(mark({ minute, side, type: "YELLOW_CARD", playerId: booked.player.id }));
        if (team.booked.includes(booked.player.id)) {
          state.events.push(mark({ minute, side, type: "RED_CARD", playerId: booked.player.id }));
          leave(side, booked, minute, "SENT_OFF");
        } else {
          team.booked.push(booked.player.id);
        }
        break;
      }
      case "RED_CARD": {
        const sentOff =
          playerId === undefined
            ? drawOnPitch(rng, onPitch(team), ({ slot }) => CARD_SLOT_WEIGHTS[positionGroup(slot)])
            : named(team, playerId);
        if (sentOff === undefined) {
          break;
        }
        state.events.push(mark({ minute, side, type: "RED_CARD", playerId: sentOff.player.id }));
        leave(side, sentOff, minute, "SENT_OFF");
        break;
      }
      case "INJURY": {
        const injured =
          playerId === undefined
            ? drawOnPitch(rng, onPitch(team), (entry) => injuryRiskFactor(fitnessAt(entry, minute)))
            : named(team, playerId);
        if (injured === undefined) {
          break;
        }
        leave(side, injured, minute, "INJURED");
        state.events.push(mark({ minute, side, type: "INJURY", playerId: injured.player.id }));
        state.injuries.push({
          playerId: injured.player.id,
          side,
          days: days ?? randomInt(rng, INJURY_DAYS_MIN, INJURY_DAYS_MAX),
        });
        substitute(side, injured, minute);
        break;
      }
      case "SUBSTITUTION": {
        // A side whose manager makes his own substitutions gets none of its assistant's.
        if (team.manual === true) {
          break;
        }
        const leaving =
          team.substitutions < substitutionLimit && team.bench.length > 0 ? mostTiredStarter(onPitch(team), minute) : undefined;
        if (leaving !== undefined) {
          state.appearances.push(toAppearance(leaving, side, minute, lastCounted));
          substitute(side, leaving, minute);
          team.windows = withWindow(team.windows, minute);
        }
        break;
      }
    }
  }

  state.played = last;
  if (modifiers !== undefined) {
    // A choice event's goals count for one segment, an instruction for the rest of its period of play.
    const periodOver = segment === "s6";
    state.modifiers = {
      goals: {},
      instructions: periodOver ? {} : modifiers.instructions,
      ...(periodOver || modifiers.givenBy === undefined ? {} : { givenBy: modifiers.givenBy }),
      scheduled: modifiers.scheduled.filter((scheduled) => scheduled.minute > lastMinute),
    };
  }

  if (segment === "s3") {
    state.phase = "HALF_TIME";
    return state;
  }
  if (segment === "e1") {
    state.phase = "EXTRA_TIME_BREAK";
    return state;
  }
  if (segment !== "s6" && segment !== "e2") {
    state.phase = "IN_PLAY";
    return state;
  }
  const level = teams.home.goals === teams.away.goals;
  if (segment === "s6" && state.knockout === true && level) {
    // Extra time to come: the players stay on, their time is counted at its end.
    state.phase = "REGULATION_END";
    state.regulationTime = lastMinute;
    return state;
  }
  state.phase = segment === "e2" && level ? "SHOOTOUT" : "FULL_TIME";
  state.fullTime = lastMinute;
  for (const side of SIDES) {
    for (const entry of onPitch(teams[side])) {
      state.appearances.push(toAppearance(entry, side, lastMinute, lastCounted));
    }
  }
  return state;
}

/** The segment a match plays next from where it stands. */
export function nextSegment(state: MatchState): Segment {
  const segment = (Object.keys(SEGMENTS) as Segment[]).find(
    (candidate) => SEGMENTS[candidate].from === state.phase && SEGMENTS[candidate].first === state.played + 1,
  );
  if (segment === undefined) {
    throw new Error(`No segment to play from ${state.phase} at ${state.played}'`);
  }
  return segment;
}

/**
 * What happens at a boundary of a match where its manager may act between two segments, kick-off included: the managed
 * club's choice events (choices.ts). Nothing in a match between AI clubs.
 */
export type BoundaryHook = (state: MatchState) => MatchState;

const noChoices: BoundaryHook = (state) => state;

/**
 * Plays a period's segments one after the other, atBoundary between two of them: a half ends at half-time, at the final
 * whistle or before extra time.
 */
export function playPeriod(
  start: MatchState,
  matchSeed: string,
  period: Period,
  instructions: Instructions = {},
  atBoundary: BoundaryHook = noChoices,
): MatchState {
  return PERIOD_SEGMENTS[period].reduce(
    (state, segment, index) => simulateSegment(index === 0 ? state : atBoundary(state), matchSeed, segment, instructions),
    start,
  );
}

/** Slot indexes of a team's sent-off players: they stay empty, whatever the formation. */
export function sentOffSlots(team: TeamLive): Set<number> {
  return new Set(team.pitch.filter((entry) => entry.status === "SENT_OFF").map((entry) => entry.index));
}

/**
 * Substitutions a team may have made by the end of a pause: MAX_SUBSTITUTIONS in regular time, one more
 * (EXTRA_TIME_SUBSTITUTIONS) from the end of regulation time before extra time.
 */
export function breakSubstitutionLimit(state: MatchState): number {
  return state.played >= REGULATION_MINUTES ? MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS : MAX_SUBSTITUTIONS;
}

/** The phases a match waits at for its manager: between two segments, at half-time, and the breaks of a cup tie. */
const PAUSE_PHASES: readonly MatchPhase[] = ["IN_PLAY", "HALF_TIME", "REGULATION_END", "EXTRA_TIME_BREAK"];

/**
 * The half-time changes of a club that does not choose: each player injured in the first half is replaced, in
 * slot order, by the substitute rated best in his slot (ratingAt), while substitutions remain. Nobody else
 * changes, and a sent-off player is never replaced.
 */
export function automaticHalfTimeChoice(state: MatchState, side: Side): HalfTimeChoice {
  const team = state[side];
  const bench = [...team.bench];
  const limit = breakSubstitutionLimit(state);
  let substitutions = team.substitutions;
  const starters: HalfTimeChoice["starters"] = [];
  const changes: HalfTimeChoice["substitutions"] = [];
  for (const entry of [...team.pitch].sort((a, b) => a.index - b.index)) {
    if (entry.status === "ON") {
      starters.push({ slot: entry.index, playerKey: entry.player.id });
    } else if (entry.status === "INJURED" && substitutions < limit && bench.length > 0) {
      const [player] = bench.splice(replacementIndex(bench, entry.slot), 1);
      substitutions++;
      changes.push({ in: player.id, out: entry.player.id });
      starters.push({ slot: entry.index, playerKey: player.id });
    }
  }
  return { formation: team.formation, starters, substitutions: changes };
}

/**
 * Applies a team's choice at a pause: half-time, the end of regulation time before extra time, the break of extra time,
 * or between two segments of play. The substitutions are dated the minute after the pause (46', 61', 91' in extra
 * time…), the players going off leaving at the pause (an injured one already left), then the formation and slots, moving
 * players between slots being free. Refused with a HalfTimeChoiceError when the choice breaks a rule: at most
 * breakSubstitutionLimit in the match, substitutions during play only in a window (MAX_SUBSTITUTION_WINDOWS, the pause
 * then becoming one), a player who went off never comes back, a sent-off player is not replaced and his slot stays empty,
 * the eleven is exactly the players on the pitch after the substitutions, and no slot stays empty while a substitution and
 * a substitute remain. A player who plays on after a knock stays hurt.
 */
export function applyHalfTimeChoice(start: MatchState, side: Side, choice: HalfTimeChoice): MatchState {
  if (!PAUSE_PHASES.includes(start.phase)) {
    throw new HalfTimeChoiceError("not-half-time");
  }
  const limit = breakSubstitutionLimit(start);
  const breakMinute = start.played;
  const kickOff = breakMinute + 1;
  const team = start[side];
  // During play, a substitution needs a window; the breaks need none.
  const inPlay = start.phase === "IN_PLAY";
  const canSubstitute = !inPlay || windowOpenAt(team, kickOff);
  if (team.substitutions + choice.substitutions.length > limit) {
    throw new HalfTimeChoiceError("too-many-substitutions");
  }
  if (choice.substitutions.length > 0 && !canSubstitute) {
    throw new HalfTimeChoiceError("no-window");
  }

  const entryOf = new Map(team.pitch.map((entry) => [entry.player.id, entry]));
  const benchOf = new Map(team.bench.map((player) => [player.id, player]));
  const involved = new Set<string>();
  for (const substitution of choice.substitutions) {
    for (const playerKey of [substitution.out, substitution.in]) {
      if (involved.has(playerKey)) {
        throw new HalfTimeChoiceError("duplicate-player");
      }
      involved.add(playerKey);
    }
    const leaving = entryOf.get(substitution.out);
    if (leaving === undefined) {
      throw new HalfTimeChoiceError("unknown-player-off");
    }
    if (leaving.status === "SENT_OFF") {
      throw new HalfTimeChoiceError("sent-off-player");
    }
    if (!benchOf.has(substitution.in)) {
      throw new HalfTimeChoiceError("unknown-substitute");
    }
  }

  const goingOff = new Set(choice.substitutions.map((substitution) => substitution.out));
  const comingOn = new Set(choice.substitutions.map((substitution) => substitution.in));
  const playing = new Set([
    ...onPitch(team).filter((entry) => !goingOff.has(entry.player.id)).map((entry) => entry.player.id),
    ...comingOn,
  ]);

  const positions = formationPositions(choice.formation);
  const barred = sentOffSlots(team);
  const placed = new Set<string>();
  const slotsTaken = new Set<number>();
  for (const { slot, playerKey } of choice.starters) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= positions.length || slotsTaken.has(slot)) {
      throw new HalfTimeChoiceError("invalid-slot");
    }
    if (barred.has(slot)) {
      throw new HalfTimeChoiceError("sent-off-slot");
    }
    if (entryOf.get(playerKey)?.status === "SENT_OFF") {
      throw new HalfTimeChoiceError("sent-off-player");
    }
    if (placed.has(playerKey)) {
      throw new HalfTimeChoiceError("duplicate-player");
    }
    if (!playing.has(playerKey)) {
      throw new HalfTimeChoiceError("lineup-mismatch");
    }
    slotsTaken.add(slot);
    placed.add(playerKey);
  }
  if (placed.size !== playing.size) {
    throw new HalfTimeChoiceError("lineup-mismatch");
  }
  const substitutionsLeft = limit - team.substitutions - choice.substitutions.length;
  const substitutesLeft = team.bench.length - comingOn.size;
  if (placed.size < positions.length - barred.size && substitutionsLeft > 0 && substitutesLeft > 0 && canSubstitute) {
    throw new HalfTimeChoiceError("incomplete-lineup");
  }

  const state = cloneState(start);
  const lastCounted = breakMinute >= REGULATION_MINUTES ? EXTRA_TIME_END_MINUTE : REGULATION_MINUTES;
  for (const substitution of choice.substitutions) {
    const leaving = entryOf.get(substitution.out);
    if (leaving?.status === "ON") {
      state.appearances.push(toAppearance(leaving, side, breakMinute, lastCounted));
    }
    state.events.push(markedAt({ minute: kickOff, side, type: "SUBSTITUTION", playerId: substitution.in, relatedPlayerId: substitution.out }));
  }

  const pitch: PitchEntry[] = team.pitch
    .filter((entry) => entry.status === "SENT_OFF")
    .map((entry) => ({ ...entry, slot: positions[entry.index] }));
  for (const { slot, playerKey } of choice.starters) {
    const current = entryOf.get(playerKey);
    const incoming = benchOf.get(playerKey);
    const player = comingOn.has(playerKey) ? incoming : current?.player;
    if (player === undefined) {
      throw new HalfTimeChoiceError("lineup-mismatch"); // unreachable: every placed player is playing
    }
    const from = comingOn.has(playerKey) ? breakMinute : (current?.from ?? 0);
    const hurt = !comingOn.has(playerKey) && current?.hurt === true;
    pitch.push({ index: slot, slot: positions[slot], player, from, status: "ON", ...(hurt ? { hurt: true as const } : {}) });
  }
  pitch.sort((a, b) => a.index - b.index);

  state[side] = {
    ...cloneTeam(team),
    formation: choice.formation,
    pitch,
    bench: team.bench.filter((player) => !comingOn.has(player.id)),
    substitutions: team.substitutions + choice.substitutions.length,
    ...(inPlay && choice.substitutions.length > 0 ? { windows: withWindow(team.windows, kickOff) } : {}),
  };
  return state;
}

/**
 * A manager's own changes at a pause, as applyHalfTimeChoice applies them: from his first substitution on, his side's
 * substitutions are his, none drawn for it any more.
 */
export function applyManagerChoice(start: MatchState, side: Side, choice: HalfTimeChoice): MatchState {
  const state = applyHalfTimeChoice(start, side, choice);
  return choice.substitutions.length === 0 || state[side].manual === true ? state : { ...state, [side]: { ...state[side], manual: true } };
}

/** Goals of each side so far. */
export function scoreOf(state: MatchState): { homeGoals: number; awayGoals: number } {
  return { homeGoals: state.home.goals, awayGoals: state.away.goals };
}

/** A kick's chance in a shoot-out: the kicker's shooting against the goalkeeper's goalkeeping, within the bounds. */
export function shootoutChance(kickerShooting: number, keeperGoalkeeping: number): number {
  const chance =
    SHOOTOUT_BASE_CHANCE +
    SHOOTOUT_KICKER_FACTOR * (kickerShooting - SHOOTOUT_REFERENCE_RATING) -
    SHOOTOUT_KEEPER_FACTOR * (keeperGoalkeeping - SHOOTOUT_REFERENCE_RATING);
  return Math.min(SHOOTOUT_MAX_CHANCE, Math.max(SHOOTOUT_MIN_CHANCE, chance));
}

/** Kickers of a side, best shooters first (ties by id), among the players on the pitch at the end of extra time. */
function kickersOf(team: TeamLive): SquadPlayer[] {
  return onPitch(team)
    .map((entry) => entry.player)
    .sort((a, b) => b.shooting - a.shooting || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** A side's goalkeeper for the shoot-out: the one in goal, or the best at it on the pitch if he was sent off. */
function keeperOf(team: TeamLive): SquadPlayer {
  const players = onPitch(team);
  const inGoal = players.find((entry) => entry.slot === "GK");
  if (inGoal !== undefined) {
    return inGoal.player;
  }
  const [best] = players
    .map((entry) => entry.player)
    .sort((a, b) => b.goalkeeping - a.goalkeeping || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (best === undefined) {
    throw new Error("A shoot-out side without a player on the pitch");
  }
  return best;
}

/**
 * The shoot-out of a knockout match level after extra time, with its own stream (phaseRngSeed(…, "shootout")): a drawn
 * side kicks first, then the sides alternate, SHOOTOUT_KICKS each unless one can no longer catch up, then one each
 * until a round is won. Kickers go best shooter first, around again when all have kicked; each kick succeeds with
 * shootoutChance against the other side's goalkeeper. Each kick is an event numbered from 1; the match ends FULL_TIME.
 */
export function simulateShootout(start: MatchState, rng: Rng): MatchState {
  if (start.phase !== "SHOOTOUT") {
    throw new Error(`Cannot play a shoot-out at ${start.phase}`);
  }
  const state = cloneState(start);
  const order: Side[] = rng() < 0.5 ? ["home", "away"] : ["away", "home"];
  const kickers: Record<Side, SquadPlayer[]> = { home: kickersOf(state.home), away: kickersOf(state.away) };
  const keepers: Record<Side, SquadPlayer> = { home: keeperOf(state.home), away: keeperOf(state.away) };
  const scored: Record<Side, number> = { home: 0, away: 0 };
  const taken: Record<Side, number> = { home: 0, away: 0 };
  const other = (side: Side): Side => (side === "home" ? "away" : "home");

  let kick = 0;
  const shoot = (side: Side): void => {
    const kicker = kickers[side][taken[side] % kickers[side].length];
    const keeper = keepers[other(side)];
    const goal = rng() < shootoutChance(kicker.shooting, keeper.goalkeeping);
    taken[side]++;
    scored[side] += goal ? 1 : 0;
    kick++;
    state.events.push({
      minute: kick,
      side,
      type: goal ? "SHOOTOUT_GOAL" : "SHOOTOUT_MISS",
      playerId: kicker.id,
      relatedPlayerId: keeper.id,
      period: "SHOOTOUT",
    });
  };
  // Within the first five each, a side that cannot catch up even scoring all its remaining kicks has lost.
  const decided = (): boolean =>
    scored.home + (SHOOTOUT_KICKS - taken.home) < scored.away || scored.away + (SHOOTOUT_KICKS - taken.away) < scored.home;

  for (let round = 0; round < SHOOTOUT_KICKS && !decided(); round++) {
    for (const side of order) {
      shoot(side);
      if (decided()) {
        break;
      }
    }
  }
  while (scored.home === scored.away) {
    for (const side of order) {
      shoot(side);
    }
  }

  state.penalties = scored;
  state.phase = "FULL_TIME";
  return state;
}

/** How a finished knockout match was decided. */
function decidedBy(state: MatchState): DecidedBy {
  if (state.penalties !== undefined) {
    return "PENALTIES";
  }
  return state.regulationTime === undefined ? "REGULATION" : "EXTRA_TIME";
}

/** The result of a finished match; a knockout match's also says how it was decided. */
export function matchResult(state: MatchState): MatchResult {
  if (state.phase !== "FULL_TIME" || state.fullTime === null) {
    throw new Error(`The match is not finished: ${state.phase}`);
  }
  const halfTimeGoals = (side: Side): number =>
    state.events.filter((event) => event.type === "GOAL" && event.side === side && event.minute <= HALF_TIME_MINUTE).length;
  const result: MatchResult = {
    ...scoreOf(state),
    homeHalfTimeGoals: halfTimeGoals("home"),
    awayHalfTimeGoals: halfTimeGoals("away"),
    fullTime: state.fullTime,
    events: state.events,
    appearances: state.appearances,
    injuries: state.injuries,
    ...(state.choices === undefined ? {} : { decisions: state.choices.decisions }),
  };
  if (state.knockout !== true) {
    return result;
  }
  return state.penalties === undefined
    ? { ...result, decidedBy: decidedBy(state) }
    : { ...result, decidedBy: "PENALTIES", homePenalties: state.penalties.home, awayPenalties: state.penalties.away };
}

/** The winner of a knockout match: more goals, or more kicks in the shoot-out. */
export function knockoutWinner(result: MatchResult): Side {
  if (result.homeGoals !== result.awayGoals) {
    return result.homeGoals > result.awayGoals ? "home" : "away";
  }
  if (result.homePenalties === undefined || result.awayPenalties === undefined || result.homePenalties === result.awayPenalties) {
    throw new Error("A knockout match without a winner");
  }
  return result.homePenalties > result.awayPenalties ? "home" : "away";
}

/**
 * What follows the second half of a knockout match level after 90 minutes: both periods of extra time, atBoundary
 * between them, then the shoot-out if still level, each with its stream from matchSeed. A state already at FULL_TIME is
 * returned as it is.
 */
export function finishKnockout(
  state: MatchState,
  matchSeed: string,
  instructions: Instructions = {},
  atBoundary: BoundaryHook = noChoices,
): MatchState {
  if (state.phase !== "REGULATION_END") {
    return state;
  }
  const firstPeriod = playPeriod(state, matchSeed, "e1", instructions);
  const extraTime = playPeriod(atBoundary(firstPeriod), matchSeed, "e2", instructions);
  return extraTime.phase === "SHOOTOUT" ? playShootout(extraTime, matchSeed) : extraTime;
}

/** The shoot-out of a knockout match level after extra time, on its own stream. */
export function playShootout(state: MatchState, matchSeed: string): MatchState {
  return simulateShootout(state, makeRng(phaseRngSeed(matchSeed, "shootout")));
}

/** Both clubs' automatic half-time changes, for clubs that do not choose. */
export function applyAutomaticHalfTime(state: MatchState, sides: readonly Side[] = SIDES): MatchState {
  return sides.reduce((current, side) => applyHalfTimeChoice(current, side, automaticHalfTimeChoice(current, side)), state);
}

/**
 * Simulates a whole match without a pause: the first half, the automatic half-time changes of both clubs, then the
 * second half, segment by segment, each with its own stream derived from matchSeed (phaseRngSeed). A knockout match level
 * after 90 minutes goes on to extra time and a shoot-out (finishKnockout). Each side plays the instructions given, or
 * its assistant's; atBoundary runs at kick-off and between two segments where a manager may act (the managed club's
 * choice events, decided by its assistant: assistantChoices, choices.ts).
 */
export function simulateMatch(
  home: Lineup,
  away: Lineup,
  matchSeed: string,
  formations?: Readonly<Record<Side, FormationName>>,
  knockout: boolean = false,
  instructions: Instructions = {},
  atBoundary: BoundaryHook = noChoices,
): MatchResult {
  const halfTime = playPeriod(atBoundary(startMatch(home, away, formations, knockout)), matchSeed, "h1", instructions, atBoundary);
  const regulation = playPeriod(applyAutomaticHalfTime(halfTime), matchSeed, "h2", instructions, atBoundary);
  return matchResult(finishKnockout(regulation, matchSeed, instructions, atBoundary));
}

/** The substitutions a side may still make at a minute: one more than MAX_SUBSTITUTIONS once extra time is reached. */
export function substitutionsLeft(state: MatchState, side: Side, minute: number): number {
  const limit = minute >= REGULATION_MINUTES ? MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS : MAX_SUBSTITUTIONS;
  return Math.min(limit - state[side].substitutions, state[side].bench.length);
}

/** An event past regular time is marked; one of regular time keeps the shape it always had. */
const markedAt = (event: MatchEvent): MatchEvent => (event.minute > REGULATION_MINUTES ? { ...event, period: "EXTRA_TIME" } : event);

/** A goal at a minute outside a segment's draws, a choice event's kick: no assist. */
export function goalAt(start: MatchState, side: Side, playerId: string, minute: number): MatchState {
  const state = cloneState(start);
  state[side].goals++;
  state.events.push(markedAt({ minute, side, type: "GOAL", playerId }));
  return state;
}

/** A yellow card at a minute outside a segment's draws: a second one sends the player off, his slot empty from then. */
export function bookingAt(start: MatchState, side: Side, playerId: string, minute: number): MatchState {
  const state = cloneState(start);
  const team = state[side];
  const entry = onPitch(team).find((candidate) => candidate.player.id === playerId);
  if (entry === undefined) {
    throw new Error(`Player ${playerId} is not on the pitch`);
  }
  state.events.push(markedAt({ minute, side, type: "YELLOW_CARD", playerId }));
  if (team.booked.includes(playerId)) {
    state.events.push(markedAt({ minute, side, type: "RED_CARD", playerId }));
    state.appearances.push(toAppearance(entry, side, minute, minute > REGULATION_MINUTES ? EXTRA_TIME_END_MINUTE : REGULATION_MINUTES));
    entry.status = "SENT_OFF";
  } else {
    team.booked.push(playerId);
  }
  return state;
}

/** The substitute a pause's substitution of a player on the pitch brings on, as substitutionAt makes it, if any is left. */
export function replacementFor(state: MatchState, side: Side, playerId: string): SquadPlayer | undefined {
  const team = state[side];
  const leaving = onPitch(team).find((entry) => entry.player.id === playerId);
  return leaving === undefined || team.bench.length === 0 ? undefined : team.bench[replacementIndex(team.bench, leaving.slot)];
}

/**
 * A substitution a manager makes at a pause between two segments, a choice event's: the player goes off at that minute,
 * the substitute rated best in his slot comes on (replacementFor), the change dated the minute after, as a half-time
 * one, in one of the side's windows during play. Throws when the side has no substitution or no substitute left: an event
 * only offers it when one is.
 */
export function substitutionAt(start: MatchState, side: Side, playerId: string, minute: number): MatchState {
  const state = cloneState(start);
  const team = state[side];
  const leaving = onPitch(team).find((entry) => entry.player.id === playerId);
  if (leaving === undefined || substitutionsLeft(start, side, minute) <= 0) {
    throw new Error(`No substitution of ${playerId} at ${minute}'`);
  }
  state.appearances.push(toAppearance(leaving, side, minute, minute >= REGULATION_MINUTES ? EXTRA_TIME_END_MINUTE : REGULATION_MINUTES));
  const [player] = team.bench.splice(replacementIndex(team.bench, leaving.slot), 1);
  team.substitutions++;
  team.pitch[team.pitch.indexOf(leaving)] = { index: leaving.index, slot: leaving.slot, player, from: minute, status: "ON" };
  if (start.phase === "IN_PLAY") {
    team.windows = withWindow(team.windows, minute + 1);
  }
  state.events.push(markedAt({ minute: minute + 1, side, type: "SUBSTITUTION", playerId: player.id, relatedPlayerId: leaving.player.id }));
  return state;
}

/**
 * The events of a match worth writing: all of them for a match of the managed club, its goals only (with their
 * assists) for another match, the only events of it ever shown. Stats, form and injuries are computed before, from
 * the whole match; filtering here never changes a draw or a score.
 */
export function eventsToPersist(events: readonly MatchEvent[], involvesManagedClub: boolean): MatchEvent[] {
  return involvesManagedClub ? [...events] : events.filter((event) => OTHER_MATCH_EVENT_TYPES.includes(event.type));
}

export function outcomeFor(result: MatchResult, side: Side): Outcome {
  const [scored, conceded] =
    side === "home" ? [result.homeGoals, result.awayGoals] : [result.awayGoals, result.homeGoals];
  return scored > conceded ? "win" : scored < conceded ? "loss" : "draw";
}

/** Minutes, goals, assists and cards of every player who took part in the match. */
export function playerMatchStats(result: MatchResult): PlayerMatchStats[] {
  const byPlayer = new Map<string, PlayerMatchStats>();
  for (const { playerId, side, minutes } of result.appearances) {
    byPlayer.set(playerId, { playerId, side, minutes, goals: 0, assists: 0, yellowCards: 0, redCards: 0 });
  }
  const statsOf = (playerId: string | undefined): PlayerMatchStats | undefined =>
    playerId === undefined ? undefined : byPlayer.get(playerId);

  for (const event of result.events) {
    const stats = statsOf(event.playerId);
    if (stats === undefined) {
      continue;
    }
    if (event.type === "GOAL") {
      stats.goals++;
      const assistProvider = statsOf(event.relatedPlayerId);
      if (assistProvider !== undefined) {
        assistProvider.assists++;
      }
    } else if (event.type === "YELLOW_CARD") {
      stats.yellowCards++;
    } else if (event.type === "RED_CARD") {
      stats.redCards++;
    }
  }
  return [...byPlayer.values()];
}

/**
 * Form after a match of the player's club: moved by the result, goals, assists and a red card when the player took
 * part, drifting back toward neutral otherwise; then, either way, it keeps FORM_RETENTION of its gap to neutral.
 */
export function nextForm(form: number, stats: PlayerMatchStats | undefined, outcome: Outcome): number {
  const gap = CONDITION_NEUTRAL - form;
  const moved =
    stats === undefined
      ? form + Math.sign(gap) * Math.min(FORM_REST_DRIFT, Math.abs(gap))
      : form +
        FORM_BY_OUTCOME[outcome] +
        stats.goals * FORM_PER_GOAL +
        stats.assists * FORM_PER_ASSIST +
        (stats.redCards > 0 ? FORM_SENT_OFF : 0);
  return clampRating(CONDITION_NEUTRAL + (moved - CONDITION_NEUTRAL) * FORM_RETENTION);
}
