import { makeRng, poisson, randomInt, weightedIndex, type Rng } from "../lib/rng";
import {
  ASSIST_CHANCE,
  ASSIST_SLOT_WEIGHTS,
  ATTACK_LINE_WEIGHTS,
  ATTACK_WEIGHTS,
  BASE_GOALS_PER_TEAM,
  BOOKED_PLAYER_CARD_FACTOR,
  CARD_SLOT_WEIGHTS,
  CONDITION_NEUTRAL,
  DEFENSE_LINE_WEIGHTS,
  DEFENSE_WEIGHTS,
  EXTRA_TIME_END_MINUTE,
  EXTRA_TIME_INTENSITY,
  EXTRA_TIME_PERIOD_MINUTES,
  EXTRA_TIME_SUBSTITUTIONS,
  FORM_BY_OUTCOME,
  FORM_PER_ASSIST,
  FORM_PER_GOAL,
  FORM_REST_DRIFT,
  FORM_SENT_OFF,
  HALF_TIME_MINUTE,
  HOME_ADVANTAGE,
  INJURIES_PER_TEAM,
  INJURY_DAYS_MAX,
  INJURY_DAYS_MIN,
  MAX_EXPECTED_GOALS,
  MAX_STOPPAGE_MINUTES,
  MAX_SUBSTITUTIONS,
  OTHER_MATCH_EVENT_TYPES,
  RED_CARDS_PER_TEAM,
  REGULATION_MINUTES,
  SCORER_SLOT_WEIGHTS,
  SHOOTOUT_BASE_CHANCE,
  SHOOTOUT_KEEPER_FACTOR,
  SHOOTOUT_KICKER_FACTOR,
  SHOOTOUT_KICKS,
  SHOOTOUT_MAX_CHANCE,
  SHOOTOUT_MIN_CHANCE,
  SHOOTOUT_REFERENCE_RATING,
  STRENGTH_EXPONENT,
  STRENGTH_PER_FORM_POINT,
  STRENGTH_PER_MORALE_POINT,
  SUBSTITUTION_MINUTE_MAX,
  SUBSTITUTION_MINUTE_MIN,
  SUBSTITUTIONS_PER_TEAM,
  YELLOW_CARDS_PER_TEAM,
} from "./balance";
import { DEFAULT_FORMATION_NAME, formationPositions, type FormationName } from "./formations";
import { ATTRIBUTE_NAMES, clampRating, type AttributeName } from "./generation";
import type { Lineup, SquadPlayer } from "./lineup";
import { playerFamiliarity, positionGroup, ratingAt, type Position, type PositionGroup } from "./positions";

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
};

export type TeamStrength = {
  attack: number;
  defense: number;
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

/** A knockout match level after extra time ends in a shoot-out, with a stream of its own. */
export type RngPhase = Period | "shootout";

/**
 * Where a match stands. REGULATION_END: a knockout match level after 90 minutes, before extra time; EXTRA_TIME_BREAK:
 * between its two periods; SHOOTOUT: level after 120 minutes, before the shoot-out. A league match never sees them.
 */
export type MatchPhase = "KICK_OFF" | "HALF_TIME" | "REGULATION_END" | "EXTRA_TIME_BREAK" | "SHOOTOUT" | "FULL_TIME";

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
};

export type TeamLive = {
  formation: FormationName;
  pitch: PitchEntry[]; // at most one entry per slot index
  bench: SquadPlayer[]; // substitutes still available: a player who went off never comes back
  substitutions: number; // made so far, at most MAX_SUBSTITUTIONS
  booked: string[]; // players with a yellow card
  goals: number;
};

/** Everything a match carries from one half to the next; plain data, stored as is while a match is paused. */
export type MatchState = {
  phase: MatchPhase;
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
};

/** A team's half-time decisions: its formation, who plays in which slot, and the substitutions made. */
export type HalfTimeChoice = {
  formation: FormationName;
  starters: { slot: number; playerKey: string }[];
  substitutions: { in: string; out: string }[];
};

export type HalfTimeChoiceIssue =
  | "not-half-time"
  | "too-many-substitutions"
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

type Incident = { minute: number; side: Side; kind: IncidentKind };

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

/**
 * Seed of one period: each has its own stream, so a period replays from the state before it alone. The extra time
 * periods (e1, e2) and the shoot-out add streams of their own after the second half's, which never changes.
 */
export function halfRngSeed(matchSeed: string, period: RngPhase): string {
  return `${matchSeed}:${period}`;
}

export function condition(player: SquadPlayer): number {
  return (
    1 +
    (player.form - CONDITION_NEUTRAL) * STRENGTH_PER_FORM_POINT +
    (player.morale - CONDITION_NEUTRAL) * STRENGTH_PER_MORALE_POINT
  );
}

function weightedValue(player: SquadPlayer, weights: Partial<Record<AttributeName, number>>): number {
  return ATTRIBUTE_NAMES.reduce((sum, name) => sum + player[name] * (weights[name] ?? 0), 0);
}

/**
 * Attack and defense of the players on the pitch: each one's attributes weighted for the group of their slot,
 * reduced by their familiarity with the slot (as ratingAt reduces the overall), adjusted for form and morale.
 * A line's value is shared among the formation's slots of that line, empty ones included: a team down to ten
 * is weaker. Without a formation, the starters' slots are the formation.
 */
export function teamStrength(
  lineup: Lineup,
  formation: readonly Position[] = lineup.starters.map(({ slot }) => slot),
): TeamStrength {
  const lineSizes: Record<PositionGroup, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const slot of formation) {
    lineSizes[positionGroup(slot)]++;
  }
  let attack = 0;
  let defense = 0;
  for (const { player, slot } of lineup.starters) {
    const group = positionGroup(slot);
    const share = (condition(player) * playerFamiliarity(player, slot)) / Math.max(1, lineSizes[group]);
    attack += ATTACK_LINE_WEIGHTS[group] * share * weightedValue(player, ATTACK_WEIGHTS[group]);
    defense += DEFENSE_LINE_WEIGHTS[group] * share * weightedValue(player, DEFENSE_WEIGHTS[group]);
  }
  return { attack, defense };
}

/** Expected goals of a team against an opponent; venueFactor is HOME_ADVANTAGE at home, its inverse away. */
export function expectedGoals(team: TeamStrength, opponent: TeamStrength, venueFactor: number): number {
  if (team.attack <= 0) {
    return 0;
  }
  const ratio = team.attack / Math.max(opponent.defense, 1);
  return Math.min(MAX_EXPECTED_GOALS, BASE_GOALS_PER_TEAM * Math.pow(ratio, STRENGTH_EXPONENT) * venueFactor);
}

/** The players a team has on the pitch, as a lineup, with its remaining substitutes. */
export function lineupOnPitch(team: TeamLive): Lineup {
  return {
    starters: team.pitch
      .filter((entry) => entry.status === "ON")
      .sort((a, b) => a.index - b.index)
      .map(({ player, slot, index }) => ({ player, slot, index })),
    bench: team.bench,
  };
}

/** Attack and defense of a team as it stands: on ten after a red card, without an injured player until he is replaced. */
export function liveStrength(team: TeamLive): TeamStrength {
  return teamStrength(lineupOnPitch(team), formationPositions(team.formation));
}

function startingTeam(lineup: Lineup, formation: FormationName): TeamLive {
  const positions = formationPositions(formation);
  for (const { slot, index } of lineup.starters) {
    if (positions[index] !== slot) {
      throw new RangeError(`Slot ${index} of ${formation} is ${positions[index]}, not ${slot}`);
    }
  }
  return {
    formation,
    pitch: lineup.starters.map(({ player, slot, index }) => ({ index, slot, player, from: 0, status: "ON" })),
    bench: [...lineup.bench],
    substitutions: 0,
    booked: [],
    goals: 0,
  };
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

/** The outfield starter still on the pitch rated lowest in their slot: the one making way for a tactical substitution. */
function weakestStarter(onPitch: readonly PitchEntry[]): PitchEntry | undefined {
  let weakest: PitchEntry | undefined;
  for (const entry of onPitch) {
    if (entry.slot === "GK" || entry.from !== 0) {
      continue;
    }
    if (weakest === undefined) {
      weakest = entry;
      continue;
    }
    const rating = ratingAt(entry.player, entry.slot);
    const weakestRating = ratingAt(weakest.player, weakest.slot);
    if (rating < weakestRating || (rating === weakestRating && entry.player.id < weakest.player.id)) {
      weakest = entry;
    }
  }
  return weakest;
}

/** Bench player replacing someone in a slot: the one rated best in that slot, ties broken by id. */
function replacementIndex(bench: readonly SquadPlayer[], slot: Position): number {
  let best = 0;
  bench.forEach((player, index) => {
    const rating = ratingAt(player, slot);
    const bestRating = ratingAt(bench[best], slot);
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
 * Plays one half from the state it starts in, with its own random stream, and returns the state after it:
 * 1. attack and defense of the players on the pitch, weighted by slot, form and morale, on ten after a red card;
 * 2. half of the match's expected goals, with home advantage, and half of its expected cards and injuries,
 *    counted with Poisson draws and spread over the half (the second one runs into stoppage time);
 * 3. scorers, assist providers, booked and injured players drawn among the players on the pitch at that minute.
 * In the first half an injured player's slot stays empty until half-time; in the second, he is replaced at once
 * while substitutions remain, and tactical substitutions take off the weakest starters. A sent-off player is
 * never replaced.
 */
export function simulateHalf(start: MatchState, rng: Rng, period: Period): MatchState {
  if (start.phase !== PHASE_BEFORE[period]) {
    throw new Error(`Cannot play the ${period} period of a match at ${start.phase}`);
  }
  const extraTime = period === "e1" || period === "e2";
  const substitutionLimit = extraTime ? MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS : MAX_SUBSTITUTIONS;
  const lastCounted = extraTime ? EXTRA_TIME_END_MINUTE : REGULATION_MINUTES;
  // Events past regular time are marked; a regular half's events keep exactly their old shape.
  const mark = (event: MatchEvent): MatchEvent => (extraTime ? { ...event, period: "EXTRA_TIME" } : event);
  const state = cloneState(start);
  const teams: Record<Side, TeamLive> = { home: state.home, away: state.away };

  const strengths: Record<Side, TeamStrength> = { home: liveStrength(teams.home), away: liveStrength(teams.away) };
  const expected: Record<Side, number> = {
    home: expectedGoals(strengths.home, strengths.away, HOME_ADVANTAGE),
    away: expectedGoals(strengths.away, strengths.home, 1 / HOME_ADVANTAGE),
  };
  const firstMinute = FIRST_MINUTE[period];
  const lastMinute =
    period === "h1"
      ? HALF_TIME_MINUTE
      : period === "h2"
        ? REGULATION_MINUTES + randomInt(rng, 0, MAX_STOPPAGE_MINUTES)
        : firstMinute + EXTRA_TIME_PERIOD_MINUTES - 1;
  // A period of extra time has its minutes' share of the match's expected incidents, its goals reduced by
  // EXTRA_TIME_INTENSITY; a regular half keeps its half, drawn below exactly as before the cup.
  const share = EXTRA_TIME_PERIOD_MINUTES / REGULATION_MINUTES;

  const incidents: Incident[] = [];
  const schedule = (side: Side, kind: IncidentKind, count: number, from: number, to: number): void => {
    for (let index = 0; index < count; index++) {
      incidents.push({ minute: randomInt(rng, from, to), side, kind });
    }
  };
  for (const side of SIDES) {
    if (extraTime) {
      schedule(side, "GOAL", poisson(rng, expected[side] * share * EXTRA_TIME_INTENSITY), firstMinute, lastMinute);
      schedule(side, "YELLOW_CARD", poisson(rng, YELLOW_CARDS_PER_TEAM * share), firstMinute, lastMinute);
      schedule(side, "RED_CARD", poisson(rng, RED_CARDS_PER_TEAM * share), firstMinute, lastMinute);
      schedule(side, "INJURY", poisson(rng, INJURIES_PER_TEAM * share), firstMinute, lastMinute);
      if (period === "e1") {
        schedule(side, "SUBSTITUTION", EXTRA_TIME_SUBSTITUTIONS, firstMinute, lastMinute);
      }
      continue;
    }
    schedule(side, "GOAL", poisson(rng, expected[side] / 2), firstMinute, lastMinute);
    schedule(side, "YELLOW_CARD", poisson(rng, YELLOW_CARDS_PER_TEAM / 2), firstMinute, lastMinute);
    schedule(side, "RED_CARD", poisson(rng, RED_CARDS_PER_TEAM / 2), firstMinute, lastMinute);
    schedule(side, "INJURY", poisson(rng, INJURIES_PER_TEAM / 2), firstMinute, lastMinute);
    if (period === "h2") {
      schedule(side, "SUBSTITUTION", SUBSTITUTIONS_PER_TEAM, SUBSTITUTION_MINUTE_MIN, SUBSTITUTION_MINUTE_MAX);
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

  for (const { minute, side, kind } of incidents) {
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
        const sentOff = drawOnPitch(rng, onPitch(team), ({ slot }) => CARD_SLOT_WEIGHTS[positionGroup(slot)]);
        if (sentOff === undefined) {
          break;
        }
        state.events.push(mark({ minute, side, type: "RED_CARD", playerId: sentOff.player.id }));
        leave(side, sentOff, minute, "SENT_OFF");
        break;
      }
      case "INJURY": {
        const injured = drawOnPitch(rng, onPitch(team), () => 1);
        if (injured === undefined) {
          break;
        }
        leave(side, injured, minute, "INJURED");
        state.events.push(mark({ minute, side, type: "INJURY", playerId: injured.player.id }));
        state.injuries.push({ playerId: injured.player.id, side, days: randomInt(rng, INJURY_DAYS_MIN, INJURY_DAYS_MAX) });
        if (period !== "h1") {
          substitute(side, injured, minute);
        }
        break;
      }
      case "SUBSTITUTION": {
        const leaving =
          team.substitutions < substitutionLimit && team.bench.length > 0 ? weakestStarter(onPitch(team)) : undefined;
        if (leaving !== undefined) {
          state.appearances.push(toAppearance(leaving, side, minute, lastCounted));
          substitute(side, leaving, minute);
        }
        break;
      }
    }
  }

  if (period === "h1") {
    state.phase = "HALF_TIME";
    return state;
  }
  if (period === "e1") {
    state.phase = "EXTRA_TIME_BREAK";
    return state;
  }
  const level = teams.home.goals === teams.away.goals;
  if (period === "h2" && state.knockout === true && level) {
    // Extra time to come: the players stay on, their time is counted at its end.
    state.phase = "REGULATION_END";
    state.regulationTime = lastMinute;
    return state;
  }
  state.phase = period === "e2" && level ? "SHOOTOUT" : "FULL_TIME";
  state.fullTime = lastMinute;
  for (const side of SIDES) {
    for (const entry of onPitch(teams[side])) {
      state.appearances.push(toAppearance(entry, side, lastMinute, lastCounted));
    }
  }
  return state;
}

/** The phase each period starts from, and its first minute. */
const PHASE_BEFORE: Readonly<Record<Period, MatchPhase>> = {
  h1: "KICK_OFF",
  h2: "HALF_TIME",
  e1: "REGULATION_END",
  e2: "EXTRA_TIME_BREAK",
};

const FIRST_MINUTE: Readonly<Record<Period, number>> = {
  h1: 1,
  h2: HALF_TIME_MINUTE + 1,
  e1: REGULATION_MINUTES + 1,
  e2: REGULATION_MINUTES + EXTRA_TIME_PERIOD_MINUTES + 1,
};

/** Slot indexes of a team's sent-off players: they stay empty, whatever the formation. */
export function sentOffSlots(team: TeamLive): Set<number> {
  return new Set(team.pitch.filter((entry) => entry.status === "SENT_OFF").map((entry) => entry.index));
}

/**
 * Substitutions a team may have made by the end of a break: MAX_SUBSTITUTIONS at half-time, one more
 * (EXTRA_TIME_SUBSTITUTIONS) at the end of regulation time before extra time.
 */
export function breakSubstitutionLimit(state: MatchState): number {
  return state.phase === "REGULATION_END" ? MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS : MAX_SUBSTITUTIONS;
}

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
 * Applies a team's choice at a break, half-time or the end of regulation time before extra time: the
 * substitutions, dated the minute after the break (46', or 91' in extra time), the players going off leaving at the
 * break (an injured one already left), then the formation and slots, moving players between slots being free.
 * Refused with a HalfTimeChoiceError when the choice breaks a rule: at most breakSubstitutionLimit in the match, a
 * player who went off never comes back, a sent-off player is not replaced and his slot stays empty, the eleven is
 * exactly the players on the pitch after the substitutions, and no slot stays empty while a substitution and a
 * substitute remain.
 */
export function applyHalfTimeChoice(start: MatchState, side: Side, choice: HalfTimeChoice): MatchState {
  const regulationEnd = start.phase === "REGULATION_END";
  if (start.phase !== "HALF_TIME" && !regulationEnd) {
    throw new HalfTimeChoiceError("not-half-time");
  }
  const limit = breakSubstitutionLimit(start);
  const breakMinute = regulationEnd ? REGULATION_MINUTES : HALF_TIME_MINUTE;
  const team = start[side];
  if (team.substitutions + choice.substitutions.length > limit) {
    throw new HalfTimeChoiceError("too-many-substitutions");
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
  if (placed.size < positions.length - barred.size && substitutionsLeft > 0 && substitutesLeft > 0) {
    throw new HalfTimeChoiceError("incomplete-lineup");
  }

  const state = cloneState(start);
  const kickOff = breakMinute + 1;
  for (const substitution of choice.substitutions) {
    const leaving = entryOf.get(substitution.out);
    if (leaving?.status === "ON") {
      state.appearances.push(toAppearance(leaving, side, breakMinute));
    }
    const event: MatchEvent = { minute: kickOff, side, type: "SUBSTITUTION", playerId: substitution.in, relatedPlayerId: substitution.out };
    state.events.push(regulationEnd ? { ...event, period: "EXTRA_TIME" } : event);
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
    pitch.push({ index: slot, slot: positions[slot], player, from, status: "ON" });
  }
  pitch.sort((a, b) => a.index - b.index);

  state[side] = {
    ...cloneTeam(team),
    formation: choice.formation,
    pitch,
    bench: team.bench.filter((player) => !comingOn.has(player.id)),
    substitutions: team.substitutions + choice.substitutions.length,
  };
  return state;
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
 * The shoot-out of a knockout match level after extra time, with its own stream (halfRngSeed(…, "shootout")): a drawn
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
 * What follows the second half of a knockout match level after 90 minutes: both periods of extra time, then the
 * shoot-out if still level, each with its stream from matchSeed. A state already at FULL_TIME is returned as it is.
 */
export function finishKnockout(state: MatchState, matchSeed: string): MatchState {
  if (state.phase !== "REGULATION_END") {
    return state;
  }
  const firstPeriod = simulateHalf(state, makeRng(halfRngSeed(matchSeed, "e1")), "e1");
  const extraTime = simulateHalf(firstPeriod, makeRng(halfRngSeed(matchSeed, "e2")), "e2");
  return extraTime.phase === "SHOOTOUT" ? simulateShootout(extraTime, makeRng(halfRngSeed(matchSeed, "shootout"))) : extraTime;
}

/** Both clubs' automatic half-time changes, for clubs that do not choose. */
export function applyAutomaticHalfTime(state: MatchState, sides: readonly Side[] = SIDES): MatchState {
  return sides.reduce((current, side) => applyHalfTimeChoice(current, side, automaticHalfTimeChoice(current, side)), state);
}

/**
 * Simulates a whole match without a pause: the first half, the automatic half-time changes of both clubs, then
 * the second half, each half with its own stream derived from matchSeed (halfRngSeed). A knockout match level after
 * 90 minutes goes on to extra time and a shoot-out (finishKnockout); a league match never draws more than before.
 */
export function simulateMatch(
  home: Lineup,
  away: Lineup,
  matchSeed: string,
  formations?: Readonly<Record<Side, FormationName>>,
  knockout: boolean = false,
): MatchResult {
  const halfTime = simulateHalf(startMatch(home, away, formations, knockout), makeRng(halfRngSeed(matchSeed, "h1")), "h1");
  const regulation = simulateHalf(applyAutomaticHalfTime(halfTime), makeRng(halfRngSeed(matchSeed, "h2")), "h2");
  return matchResult(finishKnockout(regulation, matchSeed));
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
 * Form after a match of the player's club: moved by the result, goals, assists and a red card when the
 * player took part, drifting back toward neutral otherwise.
 */
export function nextForm(form: number, stats: PlayerMatchStats | undefined, outcome: Outcome): number {
  if (stats === undefined) {
    const gap = CONDITION_NEUTRAL - form;
    return form + Math.sign(gap) * Math.min(FORM_REST_DRIFT, Math.abs(gap));
  }
  const change =
    FORM_BY_OUTCOME[outcome] +
    stats.goals * FORM_PER_GOAL +
    stats.assists * FORM_PER_ASSIST +
    (stats.redCards > 0 ? FORM_SENT_OFF : 0);
  return clampRating(form + change);
}
