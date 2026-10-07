import { poisson, randomInt, weightedIndex, type Rng } from "../lib/rng";
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
  HOME_ADVANTAGE,
  INJURIES_PER_TEAM,
  INJURY_DAYS_MAX,
  INJURY_DAYS_MIN,
  MAX_EXPECTED_GOALS,
  MAX_STOPPAGE_MINUTES,
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
  from: number; // minute the player came on, 0 for starters
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

type OnPitch = { player: SquadPlayer; slot: Position; from: number };

type TeamState = {
  onPitch: OnPitch[];
  bench: SquadPlayer[];
  substitutionsLeft: number;
  booked: Set<string>;
  goals: number;
};

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
 * Attack and defense of the starting eleven: each starter's attributes weighted for the group of their slot,
 * reduced by their familiarity with the slot (as ratingAt reduces the overall), adjusted for form and morale.
 */
export function teamStrength(lineup: Lineup): TeamStrength {
  const lineSizes: Record<PositionGroup, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const { slot } of lineup.starters) {
    lineSizes[positionGroup(slot)]++;
  }
  let attack = 0;
  let defense = 0;
  for (const { player, slot } of lineup.starters) {
    const group = positionGroup(slot);
    const share = (condition(player) * playerFamiliarity(player, slot)) / lineSizes[group];
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

function startingState(lineup: Lineup): TeamState {
  return {
    onPitch: lineup.starters.map(({ player, slot }) => ({ player, slot, from: 0 })),
    bench: [...lineup.bench],
    substitutionsLeft: SUBSTITUTIONS_PER_TEAM,
    booked: new Set(),
    goals: 0,
  };
}

function compareIncidents(a: Incident, b: Incident): number {
  return (
    a.minute - b.minute ||
    INCIDENT_ORDER[a.kind] - INCIDENT_ORDER[b.kind] ||
    SIDES.indexOf(a.side) - SIDES.indexOf(b.side)
  );
}

/** Index of an on-pitch player drawn by weight, or undefined when nobody can be drawn. */
function drawOnPitch(rng: Rng, onPitch: readonly OnPitch[], weight: (entry: OnPitch) => number): number | undefined {
  const weights = onPitch.map(weight);
  return weights.some((value) => value > 0) ? weightedIndex(rng, weights) : undefined;
}

/** The outfield starter still on the pitch rated lowest in their slot: the one making way for a tactical substitution. */
function weakestStarterIndex(onPitch: readonly OnPitch[]): number | undefined {
  let weakest: number | undefined;
  onPitch.forEach((entry, index) => {
    if (entry.slot === "GK" || entry.from !== 0) {
      return;
    }
    if (weakest === undefined) {
      weakest = index;
      return;
    }
    const current = onPitch[weakest];
    const rating = ratingAt(entry.player, entry.slot);
    const currentRating = ratingAt(current.player, current.slot);
    if (rating < currentRating || (rating === currentRating && entry.player.id < current.player.id)) {
      weakest = index;
    }
  });
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

function toAppearance(entry: OnPitch, side: Side, to: number): Appearance {
  return {
    playerId: entry.player.id,
    side,
    slot: entry.slot,
    from: entry.from,
    to,
    minutes: Math.max(1, Math.min(to, REGULATION_MINUTES) - Math.min(entry.from, REGULATION_MINUTES)),
  };
}

/**
 * Simulates a match between two lineups:
 * 1. attack and defense of each eleven, weighted by slot, form and morale;
 * 2. expected goals from the attack / defense ratio, with home advantage;
 * 3. goals, cards and injuries counted with Poisson draws and spread over the match;
 * 4. scorers, assist providers, booked and injured players drawn among the players on the pitch at that
 *    minute; injured players are replaced while substitutions remain, the rest are tactical changes.
 */
export function simulateMatch(home: Lineup, away: Lineup, rng: Rng): MatchResult {
  const strengths: Record<Side, TeamStrength> = { home: teamStrength(home), away: teamStrength(away) };
  const expected: Record<Side, number> = {
    home: expectedGoals(strengths.home, strengths.away, HOME_ADVANTAGE),
    away: expectedGoals(strengths.away, strengths.home, 1 / HOME_ADVANTAGE),
  };
  const fullTime = REGULATION_MINUTES + randomInt(rng, 0, MAX_STOPPAGE_MINUTES);

  const incidents: Incident[] = [];
  const schedule = (side: Side, kind: IncidentKind, count: number, firstMinute: number, lastMinute: number): void => {
    for (let index = 0; index < count; index++) {
      incidents.push({ minute: randomInt(rng, firstMinute, lastMinute), side, kind });
    }
  };
  for (const side of SIDES) {
    schedule(side, "GOAL", poisson(rng, expected[side]), 1, fullTime);
    schedule(side, "YELLOW_CARD", poisson(rng, YELLOW_CARDS_PER_TEAM), 1, fullTime);
    schedule(side, "RED_CARD", poisson(rng, RED_CARDS_PER_TEAM), 1, fullTime);
    schedule(side, "INJURY", poisson(rng, INJURIES_PER_TEAM), 1, fullTime);
    schedule(side, "SUBSTITUTION", SUBSTITUTIONS_PER_TEAM, SUBSTITUTION_MINUTE_MIN, SUBSTITUTION_MINUTE_MAX);
  }
  incidents.sort(compareIncidents);

  const teams: Record<Side, TeamState> = { home: startingState(home), away: startingState(away) };
  const events: MatchEvent[] = [];
  const appearances: Appearance[] = [];
  const injuries: Injury[] = [];

  const leave = (side: Side, index: number, minute: number): OnPitch => {
    const [entry] = teams[side].onPitch.splice(index, 1);
    appearances.push(toAppearance(entry, side, minute));
    return entry;
  };

  const substitute = (side: Side, leaving: OnPitch, minute: number): void => {
    const team = teams[side];
    if (team.substitutionsLeft === 0 || team.bench.length === 0) {
      return;
    }
    const [player] = team.bench.splice(replacementIndex(team.bench, leaving.slot), 1);
    team.substitutionsLeft--;
    team.onPitch.push({ player, slot: leaving.slot, from: minute });
    events.push({ minute, side, type: "SUBSTITUTION", playerId: player.id, relatedPlayerId: leaving.player.id });
  };

  for (const { minute, side, kind } of incidents) {
    const team = teams[side];
    switch (kind) {
      case "GOAL": {
        const scorerIndex = drawOnPitch(rng, team.onPitch, ({ player, slot }) => SCORER_SLOT_WEIGHTS[positionGroup(slot)] * player.shooting);
        if (scorerIndex === undefined) {
          break;
        }
        const scorer = team.onPitch[scorerIndex];
        team.goals++;
        let assistProviderId: string | undefined;
        if (rng() < ASSIST_CHANCE) {
          const assistIndex = drawOnPitch(rng, team.onPitch, (entry) =>
            entry === scorer ? 0 : ASSIST_SLOT_WEIGHTS[positionGroup(entry.slot)] * entry.player.passing,
          );
          assistProviderId = assistIndex === undefined ? undefined : team.onPitch[assistIndex].player.id;
        }
        events.push(
          assistProviderId === undefined
            ? { minute, side, type: "GOAL", playerId: scorer.player.id }
            : { minute, side, type: "GOAL", playerId: scorer.player.id, relatedPlayerId: assistProviderId },
        );
        break;
      }
      case "YELLOW_CARD": {
        const index = drawOnPitch(
          rng,
          team.onPitch,
          ({ player, slot }) => CARD_SLOT_WEIGHTS[positionGroup(slot)] * (team.booked.has(player.id) ? BOOKED_PLAYER_CARD_FACTOR : 1),
        );
        if (index === undefined) {
          break;
        }
        const { player } = team.onPitch[index];
        events.push({ minute, side, type: "YELLOW_CARD", playerId: player.id });
        if (team.booked.has(player.id)) {
          events.push({ minute, side, type: "RED_CARD", playerId: player.id });
          leave(side, index, minute);
        } else {
          team.booked.add(player.id);
        }
        break;
      }
      case "RED_CARD": {
        const index = drawOnPitch(rng, team.onPitch, ({ slot }) => CARD_SLOT_WEIGHTS[positionGroup(slot)]);
        if (index === undefined) {
          break;
        }
        events.push({ minute, side, type: "RED_CARD", playerId: team.onPitch[index].player.id });
        leave(side, index, minute);
        break;
      }
      case "INJURY": {
        const index = drawOnPitch(rng, team.onPitch, () => 1);
        if (index === undefined) {
          break;
        }
        const injured = leave(side, index, minute);
        events.push({ minute, side, type: "INJURY", playerId: injured.player.id });
        injuries.push({ playerId: injured.player.id, side, days: randomInt(rng, INJURY_DAYS_MIN, INJURY_DAYS_MAX) });
        substitute(side, injured, minute);
        break;
      }
      case "SUBSTITUTION": {
        const index = team.substitutionsLeft > 0 && team.bench.length > 0 ? weakestStarterIndex(team.onPitch) : undefined;
        if (index !== undefined) {
          substitute(side, leave(side, index, minute), minute);
        }
        break;
      }
    }
  }

  for (const side of SIDES) {
    for (const entry of teams[side].onPitch) {
      appearances.push(toAppearance(entry, side, fullTime));
    }
  }

  return { homeGoals: teams.home.goals, awayGoals: teams.away.goals, fullTime, events, appearances, injuries };
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
