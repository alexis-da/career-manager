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

export type MatchEventType = "GOAL" | "YELLOW_CARD" | "RED_CARD" | "INJURY" | "SUBSTITUTION";

export type MatchEvent = {
  minute: number; // 1–90, above 90 in stoppage time
  side: Side;
  type: MatchEventType;
  playerId: string; // GOAL: the scorer; SUBSTITUTION: the player coming on
  relatedPlayerId?: string; // GOAL: the assist provider, if any; SUBSTITUTION: the player going off
};

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
  fullTime: number; // minute of the final whistle, stoppage time included
  events: MatchEvent[]; // in chronological order
  appearances: Appearance[]; // one per player who took part
  injuries: Injury[];
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

/** A half of a match: the first from 1' to 45', the second from 46' to the final whistle. */
export type Period = "h1" | "h2";

export type MatchPhase = "KICK_OFF" | "HALF_TIME" | "FULL_TIME";

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

/** Seed of one half: each half has its own stream, so the second half replays from the half-time state alone. */
export function halfRngSeed(matchSeed: string, period: Period): string {
  return `${matchSeed}:${period}`;
}

function condition(player: SquadPlayer): number {
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

/** A match before kick-off; both lineups are in the 4-3-3 of AI clubs unless told otherwise. */
export function startMatch(
  home: Lineup,
  away: Lineup,
  formations: Readonly<Record<Side, FormationName>> = { home: DEFAULT_FORMATION_NAME, away: DEFAULT_FORMATION_NAME },
): MatchState {
  return {
    phase: "KICK_OFF",
    fullTime: null,
    home: startingTeam(home, formations.home),
    away: startingTeam(away, formations.away),
    events: [],
    appearances: [],
    injuries: [],
  };
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

function toAppearance(entry: PitchEntry, side: Side, to: number): Appearance {
  return {
    playerId: entry.player.id,
    side,
    slot: entry.slot,
    from: entry.from,
    to,
    minutes: Math.max(1, Math.min(to, REGULATION_MINUTES) - Math.min(entry.from, REGULATION_MINUTES)),
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
  const expectedPhase: MatchPhase = period === "h1" ? "KICK_OFF" : "HALF_TIME";
  if (start.phase !== expectedPhase) {
    throw new Error(`Cannot play the ${period} half of a match at ${start.phase}`);
  }
  const state = cloneState(start);
  const teams: Record<Side, TeamLive> = { home: state.home, away: state.away };

  const strengths: Record<Side, TeamStrength> = { home: liveStrength(teams.home), away: liveStrength(teams.away) };
  const expected: Record<Side, number> = {
    home: expectedGoals(strengths.home, strengths.away, HOME_ADVANTAGE),
    away: expectedGoals(strengths.away, strengths.home, 1 / HOME_ADVANTAGE),
  };
  const firstMinute = period === "h1" ? 1 : HALF_TIME_MINUTE + 1;
  const lastMinute = period === "h1" ? HALF_TIME_MINUTE : REGULATION_MINUTES + randomInt(rng, 0, MAX_STOPPAGE_MINUTES);

  const incidents: Incident[] = [];
  const schedule = (side: Side, kind: IncidentKind, count: number, from: number, to: number): void => {
    for (let index = 0; index < count; index++) {
      incidents.push({ minute: randomInt(rng, from, to), side, kind });
    }
  };
  for (const side of SIDES) {
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
    state.appearances.push(toAppearance(entry, side, minute));
    entry.status = status;
  };

  /** Puts the substitute rated best in the slot in place of the player who left it, while substitutions remain. */
  const substitute = (side: Side, leaving: PitchEntry, minute: number): void => {
    const team = teams[side];
    if (team.substitutions >= MAX_SUBSTITUTIONS || team.bench.length === 0) {
      return;
    }
    const [player] = team.bench.splice(replacementIndex(team.bench, leaving.slot), 1);
    team.substitutions++;
    team.pitch[team.pitch.indexOf(leaving)] = { index: leaving.index, slot: leaving.slot, player, from: minute, status: "ON" };
    state.events.push({ minute, side, type: "SUBSTITUTION", playerId: player.id, relatedPlayerId: leaving.player.id });
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
          assistProviderId === undefined
            ? { minute, side, type: "GOAL", playerId: scorer.player.id }
            : { minute, side, type: "GOAL", playerId: scorer.player.id, relatedPlayerId: assistProviderId },
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
        state.events.push({ minute, side, type: "YELLOW_CARD", playerId: booked.player.id });
        if (team.booked.includes(booked.player.id)) {
          state.events.push({ minute, side, type: "RED_CARD", playerId: booked.player.id });
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
        state.events.push({ minute, side, type: "RED_CARD", playerId: sentOff.player.id });
        leave(side, sentOff, minute, "SENT_OFF");
        break;
      }
      case "INJURY": {
        const injured = drawOnPitch(rng, onPitch(team), () => 1);
        if (injured === undefined) {
          break;
        }
        leave(side, injured, minute, "INJURED");
        state.events.push({ minute, side, type: "INJURY", playerId: injured.player.id });
        state.injuries.push({ playerId: injured.player.id, side, days: randomInt(rng, INJURY_DAYS_MIN, INJURY_DAYS_MAX) });
        if (period === "h2") {
          substitute(side, injured, minute);
        }
        break;
      }
      case "SUBSTITUTION": {
        const leaving =
          team.substitutions < MAX_SUBSTITUTIONS && team.bench.length > 0 ? weakestStarter(onPitch(team)) : undefined;
        if (leaving !== undefined) {
          state.appearances.push(toAppearance(leaving, side, minute));
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
  state.phase = "FULL_TIME";
  state.fullTime = lastMinute;
  for (const side of SIDES) {
    for (const entry of onPitch(teams[side])) {
      state.appearances.push(toAppearance(entry, side, lastMinute));
    }
  }
  return state;
}

/** Slot indexes of a team's sent-off players: they stay empty, whatever the formation. */
export function sentOffSlots(team: TeamLive): Set<number> {
  return new Set(team.pitch.filter((entry) => entry.status === "SENT_OFF").map((entry) => entry.index));
}

/**
 * The half-time changes of a club that does not choose: each player injured in the first half is replaced, in
 * slot order, by the substitute rated best in his slot (ratingAt), while substitutions remain. Nobody else
 * changes, and a sent-off player is never replaced.
 */
export function automaticHalfTimeChoice(state: MatchState, side: Side): HalfTimeChoice {
  const team = state[side];
  const bench = [...team.bench];
  let substitutions = team.substitutions;
  const starters: HalfTimeChoice["starters"] = [];
  const changes: HalfTimeChoice["substitutions"] = [];
  for (const entry of [...team.pitch].sort((a, b) => a.index - b.index)) {
    if (entry.status === "ON") {
      starters.push({ slot: entry.index, playerKey: entry.player.id });
    } else if (entry.status === "INJURED" && substitutions < MAX_SUBSTITUTIONS && bench.length > 0) {
      const [player] = bench.splice(replacementIndex(bench, entry.slot), 1);
      substitutions++;
      changes.push({ in: player.id, out: entry.player.id });
      starters.push({ slot: entry.index, playerKey: player.id });
    }
  }
  return { formation: team.formation, starters, substitutions: changes };
}

/**
 * Applies a team's half-time choice: the substitutions, dated HALF_TIME_MINUTE + 1, the players going off leaving
 * at HALF_TIME_MINUTE (an injured one already left), then the formation and slots, moving players between slots
 * being free. Refused with a HalfTimeChoiceError when the choice breaks a rule: at most MAX_SUBSTITUTIONS in the
 * match, a player who went off never comes back, a sent-off player is not replaced and his slot stays empty, the
 * eleven is exactly the players on the pitch after the substitutions, and no slot stays empty while a substitution
 * and a substitute remain.
 */
export function applyHalfTimeChoice(start: MatchState, side: Side, choice: HalfTimeChoice): MatchState {
  if (start.phase !== "HALF_TIME") {
    throw new HalfTimeChoiceError("not-half-time");
  }
  const team = start[side];
  if (team.substitutions + choice.substitutions.length > MAX_SUBSTITUTIONS) {
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
  const substitutionsLeft = MAX_SUBSTITUTIONS - team.substitutions - choice.substitutions.length;
  const substitutesLeft = team.bench.length - comingOn.size;
  if (placed.size < positions.length - barred.size && substitutionsLeft > 0 && substitutesLeft > 0) {
    throw new HalfTimeChoiceError("incomplete-lineup");
  }

  const state = cloneState(start);
  const kickOff = HALF_TIME_MINUTE + 1;
  for (const substitution of choice.substitutions) {
    const leaving = entryOf.get(substitution.out);
    if (leaving?.status === "ON") {
      state.appearances.push(toAppearance(leaving, side, HALF_TIME_MINUTE));
    }
    state.events.push({ minute: kickOff, side, type: "SUBSTITUTION", playerId: substitution.in, relatedPlayerId: substitution.out });
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
    const from = comingOn.has(playerKey) ? HALF_TIME_MINUTE : (current?.from ?? 0);
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

/** The result of a finished match. */
export function matchResult(state: MatchState): MatchResult {
  if (state.phase !== "FULL_TIME" || state.fullTime === null) {
    throw new Error(`The match is not finished: ${state.phase}`);
  }
  const halfTimeGoals = (side: Side): number =>
    state.events.filter((event) => event.type === "GOAL" && event.side === side && event.minute <= HALF_TIME_MINUTE).length;
  return {
    ...scoreOf(state),
    homeHalfTimeGoals: halfTimeGoals("home"),
    awayHalfTimeGoals: halfTimeGoals("away"),
    fullTime: state.fullTime,
    events: state.events,
    appearances: state.appearances,
    injuries: state.injuries,
  };
}

/** Both clubs' automatic half-time changes, for clubs that do not choose. */
export function applyAutomaticHalfTime(state: MatchState, sides: readonly Side[] = SIDES): MatchState {
  return sides.reduce((current, side) => applyHalfTimeChoice(current, side, automaticHalfTimeChoice(current, side)), state);
}

/**
 * Simulates a whole match without a pause: the first half, the automatic half-time changes of both clubs, then
 * the second half, each half with its own stream derived from matchSeed (halfRngSeed).
 */
export function simulateMatch(
  home: Lineup,
  away: Lineup,
  matchSeed: string,
  formations?: Readonly<Record<Side, FormationName>>,
): MatchResult {
  const halfTime = simulateHalf(startMatch(home, away, formations), makeRng(halfRngSeed(matchSeed, "h1")), "h1");
  return matchResult(simulateHalf(applyAutomaticHalfTime(halfTime), makeRng(halfRngSeed(matchSeed, "h2")), "h2"));
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
