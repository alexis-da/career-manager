import { makeRng, poisson, randomInt, weightedIndex, type Rng } from "../lib/rng";
import {
  FRIENDLY_SUBSTITUTION_MINUTE,
  FRIENDLY_SUBSTITUTIONS,
  HOME_ADVANTAGE,
  INJURIES_PER_TEAM,
  INJURY_DAYS_MAX,
  INJURY_DAYS_MIN,
  REGULATION_GOAL_WEIGHTS,
  SCORER_SLOT_WEIGHTS,
  SEGMENT_MINUTES,
} from "./balance";
import { fitnessAfter, injuryRiskFactor } from "./fitness";
import { chooseFormation } from "./formation-choice";
import { formationPositions, type FormationName } from "./formations";
import { isAvailable, selectRestedLineup, type Lineup, type SquadPlayer } from "./lineup";
import type { Side } from "./match";
import { positionGroup, ratingAt, type Position } from "./positions";
import { formationStrength, expectedGoals, type TeamStrength } from "./strength";

// The light simulation of an international match (docs/design/selections.md § 4.7): the score, the minutes and scorers
// of its goals, who played how long, what it cost each one of his fitness, and the injuries, from the engine's own
// formulas (expected goals, goal weights, scorer weights, fitness, injury rate), without segments, events, cards,
// ratings or form. Pure: the match's seed draws everything.

const REGULATION_MINUTES = 90;

/** A nation's team for a break: its 23 as they are on the break's first date, and the formation it plays in. */
export type NationTeam<P extends SquadPlayer = SquadPlayer> = {
  code: string;
  players: readonly P[];
  formation: FormationName;
};

/**
 * A nation's formation for a break, as an AI club chooses its own (chooseFormation): the one its 23 bring the most
 * points in against the first divisions' average opponent. Chosen once a break.
 */
export function nationFormation(players: readonly SquadPlayer[]): FormationName {
  return chooseFormation(players, 1).formation;
}

/** A player's time on the pitch in a light match. */
export type LightAppearance = {
  side: Side;
  playerId: string;
  slot: Position;
  from: number; // minutes 1 to 90 he played: from + 1 to `to`
  to: number;
  fitness: number; // after the match
  injuryDays: number | null;
};

export type LightGoal = { side: Side; minute: number; playerId: string };

export type LightMatch = {
  homeGoals: number;
  awayGoals: number;
  goals: LightGoal[]; // in the order of the match
  appearances: LightAppearance[];
};

/** Seed of an international match: the save, its date, its two nations. */
export function internationalMatchRngSeed(saveSeed: string, date: Date, home: string, away: string): string {
  return `${saveSeed}:intl:${date.toISOString().slice(0, 10)}:${home}:${away}`;
}

/** The minutes of a match a player spends on the pitch, `from` excluded: a starter from 0, a substitute from his minute. */
type Spell<P extends SquadPlayer> = { player: P; slot: Position; from: number; to: number };

/**
 * A team's spells in a friendly: its eleven (selectRestedLineup: the injured out, a tired player rested where a rested
 * one is hardly worse), then at FRIENDLY_SUBSTITUTION_MINUTE its most tired outfield starters (then the least rated in
 * their slot, then the key) make way for the best available players left at their slots, FRIENDLY_SUBSTITUTIONS at most.
 */
function friendlySpells<P extends SquadPlayer>(team: NationTeam<P>): Spell<P>[] {
  const lineup: Lineup<P> = selectRestedLineup(team.players, formationPositions(team.formation));
  const starting = new Set(lineup.starters.map(({ player }) => player.id));
  const left = team.players.filter((player) => isAvailable(player) && !starting.has(player.id));
  const leaving = lineup.starters
    .filter(({ slot }) => slot !== "GK")
    .sort(
      (a, b) =>
        a.player.fitness - b.player.fitness ||
        ratingAt(a.player, a.slot) - ratingAt(b.player, b.slot) ||
        (a.player.id < b.player.id ? -1 : 1),
    )
    .slice(0, FRIENDLY_SUBSTITUTIONS);
  const out = new Map<string, P>();
  for (const starter of leaving) {
    const options = left.filter((player) => player.position !== "GK" && !out.has(player.id));
    if (options.length === 0) {
      break;
    }
    const best = options.reduce((chosen, player) =>
      ratingAt(player, starter.slot) > ratingAt(chosen, starter.slot) ||
      (ratingAt(player, starter.slot) === ratingAt(chosen, starter.slot) && player.id < chosen.id)
        ? player
        : chosen,
    );
    out.set(best.id, starter.player);
  }
  const replaced = new Map([...out].map(([substitute, starter]) => [starter.id, substitute]));
  const spells: Spell<P>[] = [];
  for (const { player, slot } of lineup.starters) {
    const substituteId = replaced.get(player.id);
    spells.push({ player, slot, from: 0, to: substituteId === undefined ? REGULATION_MINUTES : FRIENDLY_SUBSTITUTION_MINUTE });
    if (substituteId !== undefined) {
      const substitute = team.players.find((candidate) => candidate.id === substituteId);
      if (substitute !== undefined) {
        spells.push({ player: substitute, slot, from: FRIENDLY_SUBSTITUTION_MINUTE, to: REGULATION_MINUTES });
      }
    }
  }
  return spells;
}

const strengthOf = <P extends SquadPlayer>(team: NationTeam<P>): TeamStrength =>
  formationStrength(selectRestedLineup(team.players, formationPositions(team.formation)), team.formation);

/** The scorer of a goal at a minute: a player on the pitch, weighted as the engine weighs them (slot, shooting). */
function drawScorer<P extends SquadPlayer>(rng: Rng, spells: readonly Spell<P>[], minute: number): Spell<P> | undefined {
  const onPitch = spells.filter((spell) => spell.from < minute && minute <= spell.to);
  const weights = onPitch.map(({ player, slot }) => SCORER_SLOT_WEIGHTS[positionGroup(slot)] * player.shooting);
  return weights.some((weight) => weight > 0) ? onPitch[weightedIndex(rng, weights)] : undefined;
}

/**
 * A friendly between two nations, played light: each side's expected goals by the engine's formula (expectedGoals, its
 * strength in its formation, home advantage unless on neutral ground), its goals drawn by Poisson's law quarter-hour by
 * quarter-hour with the engine's weights (REGULATION_GOAL_WEIGHTS), each scorer among the players on the pitch then; the
 * fitness each player loses as in a match (fitnessAfter); the injuries at the engine's rate (INJURIES_PER_TEAM, more for
 * the tired, injuryRiskFactor), each on a player who played, weighted by his minutes, out INJURY_DAYS_MIN to
 * INJURY_DAYS_MAX days. The match's seed (internationalMatchRngSeed) draws everything.
 */
export function playLightFriendly<P extends SquadPlayer>(
  home: NationTeam<P>,
  away: NationTeam<P>,
  seed: string,
  options: { neutral: boolean } = { neutral: false },
): LightMatch {
  const rng = makeRng(seed);
  const venue = options.neutral ? 1 : HOME_ADVANTAGE;
  const strengths = { home: strengthOf(home), away: strengthOf(away) };
  const expected = {
    home: expectedGoals(strengths.home, strengths.away, venue),
    away: expectedGoals(strengths.away, strengths.home, 1 / venue),
  };
  const spells = { home: friendlySpells(home), away: friendlySpells(away) };

  const goals: LightGoal[] = [];
  const weightSum = REGULATION_GOAL_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  REGULATION_GOAL_WEIGHTS.forEach((weight, segment) => {
    for (const side of ["home", "away"] as const) {
      const count = poisson(rng, (expected[side] * weight) / weightSum);
      for (let goal = 0; goal < count; goal++) {
        const minute = segment * SEGMENT_MINUTES + randomInt(rng, 1, SEGMENT_MINUTES);
        const scorer = drawScorer(rng, spells[side], minute);
        if (scorer !== undefined) {
          goals.push({ side, minute, playerId: scorer.player.id });
        }
      }
    }
  });
  goals.sort((a, b) => a.minute - b.minute || (a.side === b.side ? 0 : a.side === "home" ? -1 : 1));

  const appearances: LightAppearance[] = [];
  for (const side of ["home", "away"] as const) {
    const played = spells[side].map((spell) => ({
      side,
      playerId: spell.player.id,
      slot: spell.slot,
      from: spell.from,
      to: spell.to,
      fitness: fitnessAfter(spell.player.fitness, spell.slot, spell.to - spell.from),
      injuryDays: null as number | null,
    }));
    const risk = played.reduce((sum, entry) => sum + injuryRiskFactor(entry.fitness), 0) / Math.max(1, played.length);
    const injuries = poisson(rng, INJURIES_PER_TEAM * risk);
    for (let injury = 0; injury < injuries; injury++) {
      const candidates = played.filter((entry) => entry.injuryDays === null);
      const weights = candidates.map((entry) => (entry.to - entry.from) * injuryRiskFactor(entry.fitness));
      if (!weights.some((weight) => weight > 0)) {
        break;
      }
      candidates[weightedIndex(rng, weights)].injuryDays = randomInt(rng, INJURY_DAYS_MIN, INJURY_DAYS_MAX);
    }
    appearances.push(...played);
  }

  return {
    homeGoals: goals.filter((goal) => goal.side === "home").length,
    awayGoals: goals.filter((goal) => goal.side === "away").length,
    goals,
    appearances,
  };
}
