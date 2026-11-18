import { makeRng, poisson, randomInt, weightedIndex, type Rng } from "../lib/rng";
import {
  EXTRA_TIME_GOAL_WEIGHTS,
  EXTRA_TIME_PERIOD_MINUTES,
  HOME_ADVANTAGE,
  INJURIES_PER_TEAM,
  INJURY_DAYS_MAX,
  INJURY_DAYS_MIN,
  LIGHT_EXTRA_TIME_GOAL_SHARE,
  LIGHT_SUBSTITUTION_MINUTE,
  LIGHT_SUBSTITUTIONS,
  REGULATION_GOAL_WEIGHTS,
  SCORER_SLOT_WEIGHTS,
  SEGMENT_MINUTES,
  SHOOTOUT_KICKS,
} from "./balance";
import { fitnessAfter, injuryRiskFactor, recoveredFitness } from "./fitness";
import { chooseFormation } from "./formation-choice";
import { formationPositions, type FormationName } from "./formations";
import { isAvailable, selectRestedLineup, type Lineup, type SquadPlayer } from "./lineup";
import { shootoutChance, type Side } from "./match";
import { positionGroup, ratingAt, type Position } from "./positions";
import { formationStrength, expectedGoals, type TeamStrength } from "./strength";

// The light simulation of an international match (docs/design/selections.md § 4.6, 4.7): the score, the minutes and
// scorers of its goals, who played how long, what it cost each one of his fitness, and the injuries, from the engine's own
// formulas (expected goals, goal weights, scorer weights, fitness, injury rate), without segments, events, cards,
// ratings or form; a knockout match level after 90 minutes goes on to extra time and a shoot-out. Pure: the match's seed
// draws everything.

const REGULATION_MINUTES = 90;
const EXTRA_TIME_END = REGULATION_MINUTES + EXTRA_TIME_GOAL_WEIGHTS.length * EXTRA_TIME_PERIOD_MINUTES;
const DAY_MS = 86_400_000;

/** A nation's team for a break or a tournament: its 23 as they are on its first date, and the formation it plays in. */
export type NationTeam<P extends SquadPlayer = SquadPlayer> = {
  code: string;
  players: readonly P[];
  formation: FormationName;
};

/**
 * A nation's formation for a break or a tournament, as an AI club chooses its own (chooseFormation): the one its 23 bring
 * the most points in against the first divisions' average opponent. Chosen once a break.
 */
export function nationFormation(players: readonly SquadPlayer[]): FormationName {
  return chooseFormation(players, 1).formation;
}

/** A player's time on the pitch in a light match. */
export type LightAppearance = {
  side: Side;
  playerId: string;
  slot: Position;
  from: number; // the minutes he played: from + 1 to `to` (120 at most, after extra time)
  to: number;
  fitness: number; // after the match
  injuryDays: number | null;
};

export type LightGoal = { side: Side; minute: number; playerId: string }; // minute 91 to 120: extra time

/** How a light match is played: its venue, and whether it needs a winner. */
export type LightMatchOptions = {
  neutral: boolean; // no home advantage: a tournament's matches
  knockout: boolean; // level after 90 minutes: extra time, then a shoot-out
};

export type LightMatch = {
  homeGoals: number; // after extra time, a shoot-out apart
  awayGoals: number;
  goals: LightGoal[]; // in the order of the match
  appearances: LightAppearance[];
  decidedBy: "REGULATION" | "EXTRA_TIME" | "PENALTIES" | null; // null: not a knockout
  penalties: { home: number; away: number } | null;
  winner: Side | null; // a knockout's; null otherwise
};

/** Seed of an international match: the save, its date, its two nations. */
export function internationalMatchRngSeed(saveSeed: string, date: Date, home: string, away: string): string {
  return `${saveSeed}:intl:${date.toISOString().slice(0, 10)}:${home}:${away}`;
}

/** The minutes of a match a player spends on the pitch, `from` excluded: a starter from 0, a substitute from his minute. */
type Spell<P extends SquadPlayer> = { player: P; slot: Position; from: number; to: number };

/** The minutes of a light match's substitutions: LIGHT_SUBSTITUTIONS at LIGHT_SUBSTITUTION_MINUTE. */
const SUBSTITUTION_MINUTES: readonly number[] = Array.from({ length: LIGHT_SUBSTITUTIONS }, () => LIGHT_SUBSTITUTION_MINUTE);

/**
 * A team's spells over 90 minutes: its eleven (selectRestedLineup: the injured out, a tired player rested where a rested
 * one is hardly worse), then, at each substitution's minute, its most tired outfield starter still on (then the least
 * rated in his slot, then the key) makes way for the best available player left at his slot.
 */
function spellsOf<P extends SquadPlayer>(team: NationTeam<P>): Spell<P>[] {
  const lineup: Lineup<P> = selectRestedLineup(team.players, formationPositions(team.formation));
  const starting = new Set(lineup.starters.map(({ player }) => player.id));
  const left = team.players.filter((player) => isAvailable(player) && !starting.has(player.id));
  const minutes = SUBSTITUTION_MINUTES;
  const leaving = lineup.starters
    .filter(({ slot }) => slot !== "GK")
    .sort(
      (a, b) =>
        a.player.fitness - b.player.fitness ||
        ratingAt(a.player, a.slot) - ratingAt(b.player, b.slot) ||
        (a.player.id < b.player.id ? -1 : 1),
    )
    .slice(0, minutes.length);
  const out = new Map<string, { starter: P; minute: number }>();
  leaving.forEach((starter, index) => {
    const options = left.filter((player) => player.position !== "GK" && !out.has(player.id));
    if (options.length === 0) {
      return;
    }
    const best = options.reduce((chosen, player) =>
      ratingAt(player, starter.slot) > ratingAt(chosen, starter.slot) ||
      (ratingAt(player, starter.slot) === ratingAt(chosen, starter.slot) && player.id < chosen.id)
        ? player
        : chosen,
    );
    out.set(best.id, { starter: starter.player, minute: minutes[index] });
  });
  const replaced = new Map([...out].map(([substitute, { starter, minute }]) => [starter.id, { substitute, minute }]));
  const spells: Spell<P>[] = [];
  for (const { player, slot } of lineup.starters) {
    const change = replaced.get(player.id);
    spells.push({ player, slot, from: 0, to: change === undefined ? REGULATION_MINUTES : change.minute });
    if (change !== undefined) {
      const substitute = team.players.find((candidate) => candidate.id === change.substitute);
      if (substitute !== undefined) {
        spells.push({ player: substitute, slot, from: change.minute, to: REGULATION_MINUTES });
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

const SIDES: readonly Side[] = ["home", "away"];

/**
 * The goals of a period, quarter-hour by quarter-hour: in each, each side's goals drawn by Poisson's law at its share of
 * `expected` (weights[i] over `total`), each scorer among its players on the pitch then.
 */
function drawGoals<P extends SquadPlayer>(
  rng: Rng,
  expected: Record<Side, number>,
  weights: readonly number[],
  total: number,
  firstMinute: number,
  spells: Record<Side, Spell<P>[]>,
  goals: LightGoal[],
): void {
  weights.forEach((weight, segment) => {
    for (const side of SIDES) {
      const count = poisson(rng, (expected[side] * weight) / total);
      for (let goal = 0; goal < count; goal++) {
        const minute = firstMinute + segment * SEGMENT_MINUTES + randomInt(rng, 1, SEGMENT_MINUTES);
        const scorer = drawScorer(rng, spells[side], minute);
        if (scorer !== undefined) {
          goals.push({ side, minute, playerId: scorer.player.id });
        }
      }
    }
  });
}

/**
 * The shoot-out of a light knockout match level after extra time, as the engine plays one (simulateShootout): a drawn
 * side kicks first, then the sides alternate, SHOOTOUT_KICKS each unless one can no longer catch up, then one each until
 * a round is won; kickers among the players on the pitch, best shooter first, around again when all have kicked; each
 * kick succeeds with shootoutChance against the other side's goalkeeper.
 */
function lightShootout<P extends SquadPlayer>(rng: Rng, spells: Record<Side, Spell<P>[]>): { home: number; away: number } {
  const onPitch = (side: Side): Spell<P>[] => spells[side].filter((spell) => spell.to === EXTRA_TIME_END);
  const kickers = (side: Side): P[] =>
    onPitch(side)
      .map((spell) => spell.player)
      .sort((a, b) => b.shooting - a.shooting || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const keeper = (side: Side): P => {
    const players = onPitch(side);
    const inGoal = players.find((spell) => spell.slot === "GK") ?? [...players].sort((a, b) => b.player.goalkeeping - a.player.goalkeeping)[0];
    if (inGoal === undefined) {
      throw new Error("A shoot-out side without a player on the pitch");
    }
    return inGoal.player;
  };
  const order: Side[] = rng() < 0.5 ? ["home", "away"] : ["away", "home"];
  const lists: Record<Side, P[]> = { home: kickers("home"), away: kickers("away") };
  const keepers: Record<Side, P> = { home: keeper("home"), away: keeper("away") };
  const scored: Record<Side, number> = { home: 0, away: 0 };
  const taken: Record<Side, number> = { home: 0, away: 0 };
  const shoot = (side: Side): void => {
    const kicker = lists[side][taken[side] % lists[side].length];
    taken[side]++;
    scored[side] += rng() < shootoutChance(kicker.shooting, keepers[side === "home" ? "away" : "home"].goalkeeping) ? 1 : 0;
  };
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
  return scored;
}

/**
 * An international match played light: each side's expected goals by the engine's formula (expectedGoals, its strength in
 * its formation, home advantage unless on neutral ground), its goals drawn by Poisson's law quarter-hour by quarter-hour
 * with the engine's weights (REGULATION_GOAL_WEIGHTS), each scorer among the players on the pitch then. A knockout match
 * level after 90 minutes: extra time, a third of the expected goals (LIGHT_EXTRA_TIME_GOAL_SHARE) over its two periods
 * (EXTRA_TIME_GOAL_WEIGHTS), the players on the pitch at 90' playing on, then a shoot-out. The fitness each player loses
 * as in a match (fitnessAfter); the injuries at the engine's rate (INJURIES_PER_TEAM, more for the tired,
 * injuryRiskFactor), each on a player who played, weighted by his minutes, out INJURY_DAYS_MIN to INJURY_DAYS_MAX days.
 * The match's seed (internationalMatchRngSeed) draws everything; a friendly draws as it always did.
 */
export function playLightMatch<P extends SquadPlayer>(home: NationTeam<P>, away: NationTeam<P>, seed: string, options: LightMatchOptions): LightMatch {
  const rng = makeRng(seed);
  const venue = options.neutral ? 1 : HOME_ADVANTAGE;
  const strengths = { home: strengthOf(home), away: strengthOf(away) };
  const expected = {
    home: expectedGoals(strengths.home, strengths.away, venue),
    away: expectedGoals(strengths.away, strengths.home, 1 / venue),
  };
  const spells = { home: spellsOf(home), away: spellsOf(away) };

  const goals: LightGoal[] = [];
  const regulationWeights = REGULATION_GOAL_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  drawGoals(rng, expected, REGULATION_GOAL_WEIGHTS, regulationWeights, 0, spells, goals);
  const count = (side: Side): number => goals.filter((goal) => goal.side === side).length;

  let decidedBy: LightMatch["decidedBy"] = null;
  let penalties: LightMatch["penalties"] = null;
  if (options.knockout) {
    decidedBy = "REGULATION";
    if (count("home") === count("away")) {
      // The players on the pitch at 90' play on to 120'.
      for (const side of SIDES) {
        spells[side] = spells[side].map((spell) => (spell.to === REGULATION_MINUTES ? { ...spell, to: EXTRA_TIME_END } : spell));
      }
      const extraWeights = EXTRA_TIME_GOAL_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
      const extra = { home: expected.home * LIGHT_EXTRA_TIME_GOAL_SHARE, away: expected.away * LIGHT_EXTRA_TIME_GOAL_SHARE };
      drawGoals(rng, extra, EXTRA_TIME_GOAL_WEIGHTS, extraWeights, REGULATION_MINUTES, spells, goals);
      decidedBy = "EXTRA_TIME";
      if (count("home") === count("away")) {
        penalties = lightShootout(rng, spells);
        decidedBy = "PENALTIES";
      }
    }
  }
  goals.sort((a, b) => a.minute - b.minute || (a.side === b.side ? 0 : a.side === "home" ? -1 : 1));

  const appearances: LightAppearance[] = [];
  for (const side of SIDES) {
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

  const homeGoals = count("home");
  const awayGoals = count("away");
  const winner: Side | null = !options.knockout
    ? null
    : homeGoals !== awayGoals
      ? homeGoals > awayGoals
        ? "home"
        : "away"
      : penalties !== null && penalties.home > penalties.away
        ? "home"
        : "away";
  return { homeGoals, awayGoals, goals, appearances, decidedBy, penalties, winner };
}

/** A friendly, played light (playLightMatch): no extra time. */
export function playLightFriendly<P extends SquadPlayer>(
  home: NationTeam<P>,
  away: NationTeam<P>,
  seed: string,
  options: { neutral: boolean } = { neutral: false },
): LightMatch {
  return playLightMatch(home, away, seed, { neutral: options.neutral, knockout: false });
}

// ------------------------------------------------------------------ A session: a break, or a tournament

/** What a session does to a player called: his fitness and the day it is for, his injury, his caps and goals. */
export type PlayerRun = {
  fitness: number;
  asOf: Date;
  injuredUntil: Date | null;
  injuryDays: number | null;
  injuredOn: Date | null;
  caps: number;
  goals: number;
};

/**
 * The national teams of a break or a tournament, as its matches change them: each nation's squad called on its first
 * date, kept with the formation chosen then (nationFormation); a player's fitness recovers day by day between two dates
 * and is lost on the pitch, an injury keeps him out from its date. Pure: the matches' seeds draw.
 */
export type InternationalSession<P extends SquadPlayer> = {
  runs: ReadonlyMap<string, PlayerRun>; // by player id, every player called
  teamOn(code: string, date: Date): NationTeam<P>; // its players at their fitness then, the injured out
  play(home: string, away: string, date: Date, seed: string, options: LightMatchOptions): LightMatch;
};

const daysBetween = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));

export function internationalSession<P extends SquadPlayer>(called: ReadonlyMap<string, readonly P[]>, first: Date): InternationalSession<P> {
  const runs = new Map<string, PlayerRun>();
  const teams = new Map<string, NationTeam<P>>();
  for (const [code, players] of called) {
    for (const player of players) {
      runs.set(player.id, { fitness: player.fitness, asOf: first, injuredUntil: null, injuryDays: null, injuredOn: null, caps: 0, goals: 0 });
    }
    teams.set(code, { code, players, formation: nationFormation(players) });
  }
  const teamOn = (code: string, date: Date): NationTeam<P> => {
    const team = teams.get(code);
    if (team === undefined) {
      throw new Error(`Nation ${code} has no squad in this session`);
    }
    return {
      ...team,
      players: team.players.map((player) => {
        const run = runs.get(player.id);
        if (run === undefined) {
          return player;
        }
        return {
          ...player,
          fitness: recoveredFitness(run.fitness, daysBetween(run.asOf, date)),
          injured: run.injuredUntil !== null && run.injuredUntil > date,
        };
      }),
    };
  };
  const play = (home: string, away: string, date: Date, seed: string, options: LightMatchOptions): LightMatch => {
    const match = playLightMatch(teamOn(home, date), teamOn(away, date), seed, options);
    for (const appearance of match.appearances) {
      const run = runs.get(appearance.playerId);
      if (run === undefined) {
        continue;
      }
      run.fitness = appearance.fitness;
      run.asOf = date;
      run.caps++;
      if (appearance.injuryDays !== null) {
        run.injuryDays = appearance.injuryDays;
        run.injuredOn = date;
        run.injuredUntil = new Date(date.getTime() + appearance.injuryDays * DAY_MS);
      }
    }
    for (const goal of match.goals) {
      const run = runs.get(goal.playerId);
      if (run !== undefined) {
        run.goals++;
      }
    }
    return match;
  };
  return { runs, teamOn, play };
}
