/**
 * Balance of the match engine (npm run measure:balance -- [--matches=N] [--seeds=N] [--engine-only] [--world-only]
 * [--out=file.json]).
 *
 * Engine, on the pure functions, without a database: wins, draws and losses by strength gap, then the isolated effect of
 * each factor, everything else equal, the formations with their profiles and the instructions against the assistant's rule. Two teams of the same synthetic level, every player at his position's profile, no
 * random spread; only the tested team changes. A case plays --matches matches (default 20 000), half of them at home, half
 * away, unless it is about the venue, on the same seeds as every other case, so that two cases differ by the factor alone.
 *
 * World, on a save of the local database: a complete season of a worldVersion 2 save for each of --seeds seeds (default
 * 3), its goals, draws, home wins, points gap, upsets and final form, the AI starters' fitness at kick-off, the players
 * they rest and the suspensions they serve; the same leagues played on paper, squads frozen at kick-off, form at 50, for what a season's form,
 * fatigue and injuries add; and the formations on real squads. Each save and its
 * throwaway owner are deleted at the end. Writes to the database: the local one only.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import {
  BASE_GOALS_PER_TEAM,
  FORM_RETENTION,
  FORMATION_PROFILES,
  HOME_ADVANTAGE,
  POSITION_PROFILES,
  SEGMENT_MINUTES,
  STRENGTH_EXPONENT,
} from "../src/engine/balance";
import { DEFAULT_FORMATION_NAME, FORMATION_NAMES, formationPositions, type FormationName } from "../src/engine/formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "../src/engine/generation";
import { isSuspended } from "../src/engine/discipline";
import { recoveredFitness } from "../src/engine/fitness";
import { averageStarterRating, selectLineup, selectRestedLineup, type Lineup, type SquadPlayer } from "../src/engine/lineup";
import {
  applyAutomaticHalfTime,
  assistantInstruction,
  expectedGoals,
  formationStrength,
  knockoutWinner,
  matchResult,
  simulateMatch,
  simulateSegment,
  startMatch,
  type Instruction,
  type MatchResult,
  type MatchState,
  type Segment,
  type Side,
} from "../src/engine/match";
import { positionGroup, ratingAt, secondaryPositions, type Position } from "../src/engine/positions";

const OWNER = "test-owner-measure-engine";

/** The synthetic teams' level: a player's attributes are this plus his position's profile. */
const BASE_LEVEL = 70;

/** Strength gaps measured, in points on every attribute. */
const GAPS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

/** Other base levels, for the gaps alone: the ratio between two teams, not their difference, drives the engine. */
const OTHER_LEVELS = [58, 76];
const LEVEL_GAPS = [2, 5, 10];

/** The slots of the 4-3-3 the tests touch. */
const SLOT = { GK: 0, CB: 2, CM: 6, ST: 9 } as const;

type Options = { matches: number; seeds: number; engine: boolean; world: boolean; out: string | undefined };

function parseOptions(argv: readonly string[]): Options {
  const value = (name: string): string | undefined => argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  return {
    matches: Number(value("matches") ?? 20_000),
    seeds: Number(value("seeds") ?? 3),
    engine: !argv.includes("--world-only"),
    world: !argv.includes("--engine-only"),
    out: value("out"),
  };
}

const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;
const fixed = (value: number, digits = 1): string => round(value, digits).toFixed(digits);
const signed = (value: number, digits = 2): string => `${value > 0 ? "+" : ""}${fixed(value, digits)}`;

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

// ------------------------------------------------------------------ Synthetic teams

function syntheticPlayer(id: string, position: Position, level: number): SquadPlayer {
  const attributes = Object.fromEntries(
    ATTRIBUTE_NAMES.map((name) => [name, clampRating(level + POSITION_PROFILES[position][name])]),
  ) as Record<AttributeName, number>;
  return { id, position, overall: overallFor(position, attributes), injured: false, form: 50, morale: 50, fitness: 100, ...attributes };
}

const BENCH: readonly Position[] = ["GK", "CB", "RB", "CDM", "CM", "RW", "ST"];

/** A team at a level, every starter at his position in the formation, a bench three points below it. */
function syntheticTeam(name: string, level: number, formation: FormationName = DEFAULT_FORMATION_NAME): Lineup {
  return {
    starters: formationPositions(formation).map((slot, index) => ({
      player: syntheticPlayer(`${name}#${index}`, slot, level),
      slot,
      index,
    })),
    bench: BENCH.map((position, index) => syntheticPlayer(`${name}#bench${index}`, position, level - 3)),
  };
}

/** A lineup with some starters changed: the rest of the team stays what it is. */
function withStarters(lineup: Lineup, change: (player: SquadPlayer, index: number) => SquadPlayer): Lineup {
  return { ...lineup, starters: lineup.starters.map((entry) => ({ ...entry, player: change(entry.player, entry.index) })) };
}

const withStarter = (lineup: Lineup, slot: number, change: (player: SquadPlayer) => SquadPlayer): Lineup =>
  withStarters(lineup, (player, index) => (index === slot ? change(player) : player));

/** A key whose secondary positions at this primary position include the slot, or do not. */
function keyWithSecondary(primary: Position, slot: Position, wanted: boolean): string {
  for (let index = 0; index < 100_000; index++) {
    const key = `probe-${primary}-${index}`;
    if (secondaryPositions(key, primary).includes(slot) === wanted) {
      return key;
    }
  }
  throw new Error(`No key with${wanted ? "" : "out"} ${slot} as a secondary position of ${primary}`);
}

/** The same player, attributes included, at another primary position: only his familiarity with the slot changes. */
const familiarPlayer = (player: SquadPlayer, primary: Position, slot: Position, secondary: boolean): SquadPlayer => ({
  ...player,
  position: primary,
  id: keyWithSecondary(primary, slot, secondary),
});

// ------------------------------------------------------------------ Matches and tallies

type Tally = { matches: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };

const emptyTally = (): Tally => ({ matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });

const percent = (part: number, whole: number): number => (100 * part) / whole;
const pointsPerMatch = (tally: Tally): number => (3 * tally.wins + tally.draws) / tally.matches;

type Venue = "both" | "home" | "away";

/** Plays one match; `tested` is the side of the team the case is about. */
type Play = (home: Lineup, away: Lineup, seed: string, tested: Side) => MatchResult;

const plainMatch =
  (formations?: Readonly<Record<"tested" | "other", FormationName>>): Play =>
  (home, away, seed, tested) =>
    simulateMatch(
      home,
      away,
      seed,
      formations === undefined
        ? undefined
        : {
            home: tested === "home" ? formations.tested : formations.other,
            away: tested === "away" ? formations.tested : formations.other,
          },
    );

/** Runs a case on the same seeds as every other one: a difference between two cases comes from their teams alone. */
function duel(tested: Lineup, other: Lineup, matches: number, venue: Venue = "both", play: Play = plainMatch()): Tally {
  const tally = emptyTally();
  for (let index = 0; index < matches; index++) {
    const seed = `balance:${index}`;
    const side: Side = venue === "home" || (venue === "both" && index % 2 === 0) ? "home" : "away";
    const result = side === "home" ? play(tested, other, seed, side) : play(other, tested, seed, side);
    const [scored, conceded] = side === "home" ? [result.homeGoals, result.awayGoals] : [result.awayGoals, result.homeGoals];
    tally.matches++;
    tally.goalsFor += scored;
    tally.goalsAgainst += conceded;
    if (scored > conceded) {
      tally.wins++;
    } else if (scored < conceded) {
      tally.losses++;
    } else {
      tally.draws++;
    }
  }
  return tally;
}

const SEGMENTS: readonly Segment[] = ["s1", "s2", "s3", "s4", "s5", "s6"];

/** What a side plays at the start of a segment, from the state of the match and the minutes played. */
type Policy = (state: MatchState, side: Side, played: number) => Instruction;

/**
 * Plays a match segment by segment, as simulateMatch does, with a callback before each segment: a change to the state
 * (a player sent off) and the tested side's instruction. The other side follows the assistant's rule.
 */
function segmentBySegment(
  home: Lineup,
  away: Lineup,
  seed: string,
  tested: Side,
  before: (state: MatchState, segment: Segment) => MatchState,
  policy: Policy = assistantInstruction,
): MatchResult {
  let state = startMatch(home, away);
  for (const [index, segment] of SEGMENTS.entries()) {
    const ready = before(segment === "s4" ? applyAutomaticHalfTime(state) : state, segment);
    state = simulateSegment(ready, seed, segment, { [tested]: policy(ready, tested, index * SEGMENT_MINUTES) });
  }
  return matchResult(state);
}

/** The tested side's player of a slot sent off when a segment starts: his slot is empty from there on. */
const matchWithRedCard =
  (segment: Segment, slot: number): Play =>
  (home, away, seed, tested) =>
    segmentBySegment(home, away, seed, tested, (state, current) =>
      current !== segment
        ? state
        : {
            ...state,
            [tested]: {
              ...state[tested],
              pitch: state[tested].pitch.map((entry) => (entry.index === slot ? { ...entry, status: "SENT_OFF" } : entry)),
            },
          },
    );

/**
 * At the 60th minute, the tested side's player of a slot gives way to a fresh one of the same level and position: the
 * value of a fresh legs at that minute, the substitution counted.
 */
const matchWithFreshSubstitute =
  (slot: number, level: number): Play =>
  (home, away, seed, tested) =>
    segmentBySegment(home, away, seed, tested, (state, current) => {
      const team = state[tested];
      const entry = team.pitch.find((candidate) => candidate.index === slot && candidate.status === "ON");
      if (current !== "s5" || entry === undefined) {
        return state;
      }
      const fresh = syntheticPlayer(`fresh-${slot}`, entry.player.position, level);
      return {
        ...state,
        [tested]: {
          ...team,
          substitutions: team.substitutions + 1,
          pitch: team.pitch.map((candidate) => (candidate === entry ? { ...candidate, player: fresh, from: 60 } : candidate)),
        },
      };
    });

/** A match where the tested side follows a policy of its own; the other one, the assistant's rule. */
const matchWithPolicy =
  (policy: Policy): Play =>
  (home, away, seed, tested) =>
    segmentBySegment(home, away, seed, tested, (state) => state, policy);

// ------------------------------------------------------------------ Engine report

/** A team's expected goals on neutral ground, both in the 4-3-3 of AI clubs, from the code's formula, without a draw. */
function neutralGoals(team: Lineup, opponent: Lineup): number {
  return expectedGoals(formationStrength(team, DEFAULT_FORMATION_NAME), formationStrength(opponent, DEFAULT_FORMATION_NAME), 1);
}

function resultColumns(tally: Tally, baseline: Tally): string[] {
  return [
    fixed(percent(tally.wins, tally.matches)),
    fixed(percent(tally.draws, tally.matches)),
    fixed(percent(tally.losses, tally.matches)),
    fixed(tally.goalsFor / tally.matches, 2),
    fixed(tally.goalsAgainst / tally.matches, 2),
    fixed(pointsPerMatch(tally), 3),
    signed(pointsPerMatch(tally) - pointsPerMatch(baseline), 3),
  ];
}

const RESULT_HEADERS = ["wins %", "draws %", "losses %", "goals for", "goals against", "pts/match", "Δ pts/match"];

function gapTables(options: Options, sections: string[]): void {
  const base = syntheticTeam("other", BASE_LEVEL);
  const equal = duel(syntheticTeam("tested", BASE_LEVEL), base, options.matches);
  const rows = GAPS.map((gap) => {
    const team = syntheticTeam("tested", BASE_LEVEL + gap);
    const tally = duel(team, base, options.matches);
    const home = duel(team, base, options.matches / 2, "home");
    const away = duel(team, base, options.matches / 2, "away");
    return [
      `+${gap}`,
      fixed(averageStarterRating(team) - averageStarterRating(base)),
      fixed(neutralGoals(team, base), 2),
      fixed(neutralGoals(base, team), 2),
      ...resultColumns(tally, equal).slice(0, 6),
      fixed(percent(home.wins, home.matches)),
      fixed(percent(away.wins, away.matches)),
    ];
  });
  sections.push(
    `## 1. By strength gap (both teams level ${BASE_LEVEL} + gap on the stronger one, ${options.matches} matches a row)`,
    table(
      ["gap", "rating gap", "λ stronger", "λ weaker", ...RESULT_HEADERS.slice(0, 6), "wins at home %", "wins away %"],
      rows,
    ),
  );

  const levelRows = OTHER_LEVELS.flatMap((level) =>
    LEVEL_GAPS.map((gap) => {
      const other = syntheticTeam("other", level);
      const team = syntheticTeam("tested", level + gap);
      const tally = duel(team, other, options.matches);
      return [String(level), `+${gap}`, fixed(neutralGoals(team, other), 2), fixed(neutralGoals(other, team), 2), ...resultColumns(tally, tally).slice(0, 3)];
    }),
  );
  sections.push(
    "### The same gaps at other levels",
    table(["base level", "gap", "λ stronger", "λ weaker", "wins %", "draws %", "losses %"], levelRows),
  );
}

type Case = { label: string; team?: Lineup; venue?: Venue; play?: Play };

function caseRows(cases: readonly Case[], options: Options, base: Lineup, other: Lineup, baseline: Tally): string[][] {
  return cases.map(({ label, team = base, venue = "both", play }) => {
    const tally = duel(team, other, options.matches, venue, play);
    return [
      label,
      fixed(averageStarterRating(team), 2),
      fixed(neutralGoals(team, other), 3),
      fixed(neutralGoals(other, team), 3),
      ...resultColumns(tally, baseline),
    ];
  });
}

const CASE_HEADERS = ["case", "mean rating", "λ tested", "λ other", ...RESULT_HEADERS];

function factorTables(options: Options, sections: string[]): void {
  const base = syntheticTeam("tested", BASE_LEVEL);
  const other = syntheticTeam("other", BASE_LEVEL);
  const baseline = duel(base, other, options.matches);
  const report = (title: string, cases: readonly Case[]): void => {
    sections.push(title, table(CASE_HEADERS, caseRows(cases, options, base, other, baseline)));
  };
  const allForm = (form: number): Lineup => withStarters(base, (player) => ({ ...player, form }));
  const allMorale = (morale: number): Lineup => withStarters(base, (player) => ({ ...player, morale }));
  const allFitness = (fitness: number): Lineup => ({
    starters: base.starters.map((entry) => ({ ...entry, player: { ...entry.player, fitness } })),
    bench: base.bench.map((player) => ({ ...player, fitness })),
  });

  report(`## 2. Isolated factors (level ${BASE_LEVEL} against level ${BASE_LEVEL}, ${options.matches} matches a row)`, [
    { label: "baseline: equal teams" },
    { label: "+1 point on every attribute", team: syntheticTeam("tested", BASE_LEVEL + 1) },
    { label: "at home", venue: "home" },
    { label: "away", venue: "away" },
    { label: "form +10 (eleven)", team: allForm(60) },
    { label: "form +20 (eleven)", team: allForm(70) },
    { label: "form -10 (eleven)", team: allForm(40) },
    { label: "form -20 (eleven)", team: allForm(30) },
    { label: "form +20 (striker alone)", team: withStarter(base, SLOT.ST, (player) => ({ ...player, form: 70 })) },
    { label: "morale +20 (eleven), never moves in the game", team: allMorale(70) },
    { label: "fitness 85 at kick-off (eleven and bench)", team: allFitness(85) },
    { label: "fitness 75 at kick-off (eleven and bench)", team: allFitness(75) },
    { label: "a fresh CM of the same level at the 60th", play: matchWithFreshSubstitute(SLOT.CM, BASE_LEVEL) },
    { label: "a fresh ST of the same level at the 60th", play: matchWithFreshSubstitute(SLOT.ST, BASE_LEVEL) },
    { label: "fitness 75 at kick-off, a fresh ST at the 60th", team: allFitness(75), play: matchWithFreshSubstitute(SLOT.ST, BASE_LEVEL) },
  ]);

  const offPosition = (slot: number, primary: Position, secondary = false): Lineup =>
    withStarter(base, slot, (player) => familiarPlayer(player, primary, base.starters[slot].slot, secondary));
  report("### One player off position, same attributes: familiarity alone", [
    { label: "ST slot: secondary position (0.97), RW", team: offPosition(SLOT.ST, "RW", true) },
    { label: "ST slot: same line (0.92), RW", team: offPosition(SLOT.ST, "RW") },
    { label: "ST slot: next line (0.8), CM", team: offPosition(SLOT.ST, "CM") },
    { label: "ST slot: opposite line (0.6), CB", team: offPosition(SLOT.ST, "CB") },
    { label: "ST slot: goalkeeper (0.4)", team: offPosition(SLOT.ST, "GK") },
    { label: "CM slot: secondary position (0.97), CDM", team: offPosition(SLOT.CM, "CDM", true) },
    { label: "CM slot: same line (0.92), CAM", team: offPosition(SLOT.CM, "CAM") },
    { label: "CM slot: next line (0.8), CB", team: offPosition(SLOT.CM, "CB") },
    { label: "CM slot: goalkeeper (0.4)", team: offPosition(SLOT.CM, "GK") },
    { label: "CB slot: secondary position (0.97), RB", team: offPosition(SLOT.CB, "RB", true) },
    { label: "CB slot: same line (0.92), RB", team: offPosition(SLOT.CB, "RB") },
    { label: "CB slot: next line (0.8), CDM", team: offPosition(SLOT.CB, "CDM") },
    { label: "CB slot: opposite line (0.6), ST", team: offPosition(SLOT.CB, "ST") },
    { label: "CB slot: goalkeeper (0.4)", team: offPosition(SLOT.CB, "GK") },
    { label: "GK slot: outfield player (0.4)", team: offPosition(SLOT.GK, "CB") },
  ]);

  const realPlayer = (slot: number, primary: Position): Lineup =>
    withStarter(base, slot, () => syntheticPlayer("real", primary, BASE_LEVEL));
  report("### One player off position, his own attributes: familiarity and the wrong profile", [
    { label: "RW at ST", team: realPlayer(SLOT.ST, "RW") },
    { label: "CM at ST", team: realPlayer(SLOT.ST, "CM") },
    { label: "CB at ST", team: realPlayer(SLOT.ST, "CB") },
    { label: "CAM at CM", team: realPlayer(SLOT.CM, "CAM") },
    { label: "CB at CM", team: realPlayer(SLOT.CM, "CB") },
    { label: "RB at CB", team: realPlayer(SLOT.CB, "RB") },
    { label: "CM at CB", team: realPlayer(SLOT.CB, "CM") },
    { label: "ST at CB", team: realPlayer(SLOT.CB, "ST") },
    { label: "CB in goal", team: realPlayer(SLOT.GK, "CB") },
  ]);

  const replaced = (slot: number, drop: number): Lineup =>
    withStarter(base, slot, (player) => syntheticPlayer(`sub-${slot}-${drop}`, player.position, BASE_LEVEL - drop));
  report("### A starter out injured, his substitute starts in his slot", [
    { label: "ST, substitute 3 points below", team: replaced(SLOT.ST, 3) },
    { label: "ST, substitute 5 points below", team: replaced(SLOT.ST, 5) },
    { label: "ST, substitute 10 points below", team: replaced(SLOT.ST, 10) },
    { label: "CM, substitute 5 points below", team: replaced(SLOT.CM, 5) },
    { label: "CB, substitute 5 points below", team: replaced(SLOT.CB, 5) },
    { label: "GK, substitute 5 points below", team: replaced(SLOT.GK, 5) },
    { label: "GK, substitute 10 points below", team: replaced(SLOT.GK, 10) },
  ]);

  // An injured player is replaced at once by the engine: the table above weighs his substitute.
  report("### Sent off during a match: ten from the next segment on", [
    { label: "red card before kick-off, CM: 90 minutes at ten", play: matchWithRedCard("s1", SLOT.CM) },
    { label: "red card before kick-off, ST", play: matchWithRedCard("s1", SLOT.ST) },
    { label: "red card before kick-off, CB", play: matchWithRedCard("s1", SLOT.CB) },
    { label: "red card in the first 15 minutes, CM: 75 minutes at ten", play: matchWithRedCard("s2", SLOT.CM) },
    { label: "red card in the first half, CM: second half at ten", play: matchWithRedCard("s4", SLOT.CM) },
    { label: "red card in the first half, ST", play: matchWithRedCard("s4", SLOT.ST) },
    { label: "red card in the first half, CB", play: matchWithRedCard("s4", SLOT.CB) },
    { label: "red card in the first half, GK", play: matchWithRedCard("s4", SLOT.GK) },
    { label: "red card before the 75th minute, CM: last 15 minutes at ten", play: matchWithRedCard("s6", SLOT.CM) },
  ]);

  const ahead = (state: MatchState, side: Side): number =>
    state[side].goals - state[side === "home" ? "away" : "home"].goals;
  const always =
    (instruction: Instruction): Policy =>
    () =>
      instruction;
  const instructionCases = (team: Lineup, against: Lineup, label: string): string[][] => {
    const reference = duel(team, against, options.matches, "both", matchWithPolicy(assistantInstruction));
    const policies: readonly (readonly [string, Policy])[] = [
      ["the assistant's rule (reference)", assistantInstruction],
      ["Équilibré all match", always("BALANCED")],
      ["Attaquer all match", always("ATTACK")],
      ["Fermer all match", always("DEFEND")],
      [
        "rule without Attaquer: Équilibré when behind",
        (state, side, played) => (ahead(state, side) < 0 ? "BALANCED" : assistantInstruction(state, side, played)),
      ],
      [
        "rule without Fermer: Équilibré one goal ahead",
        (state, side, played) => (ahead(state, side) > 0 ? "BALANCED" : assistantInstruction(state, side, played)),
      ],
      [
        "Attaquer behind from half-time",
        (state, side, played) => (ahead(state, side) < 0 && played >= 45 ? "ATTACK" : assistantInstruction(state, side, played)),
      ],
      [
        "Fermer ahead by any margin from the 60th",
        (state, side, played) => (ahead(state, side) > 0 && played >= 60 ? "DEFEND" : assistantInstruction(state, side, played)),
      ],
      [
        "Attaquer level from the 75th",
        (state, side, played) => (ahead(state, side) === 0 && played >= 75 ? "ATTACK" : assistantInstruction(state, side, played)),
      ],
    ];
    return policies.map(([name, policy]) => {
      const tally = duel(team, against, options.matches, "both", matchWithPolicy(policy));
      return [label, name, ...resultColumns(tally, reference)];
    });
  };
  sections.push(
    `### Instructions of the tested team, the other one following the assistant's rule (${options.matches} matches a row)`,
    "Rule: Attaquer when behind from the 60th minute, Fermer one goal ahead from the 75th, Équilibré otherwise; read at the start of each segment.",
    table(
      ["tested team", "instructions", ...RESULT_HEADERS],
      [
        ...instructionCases(base, other, `level ${BASE_LEVEL}, equal`),
        ...instructionCases(syntheticTeam("tested", BASE_LEVEL + 5), other, `level ${BASE_LEVEL + 5}, stronger`),
        ...instructionCases(syntheticTeam("tested", BASE_LEVEL - 5), other, `level ${BASE_LEVEL - 5}, weaker`),
      ],
    ),
  );

  const formationCases: Case[] = FORMATION_NAMES.map((formation) => ({
    label: formation,
    team: syntheticTeam("tested", BASE_LEVEL, formation),
    play: plainMatch({ tested: formation, other: DEFAULT_FORMATION_NAME }),
  }));
  const formationRows = formationCases.map(({ label, team, play }) => {
    const lineup = team ?? base;
    const tally = duel(lineup, other, options.matches, "both", play);
    const formation = label as FormationName;
    const strength = formationStrength(lineup, formation);
    const profile = FORMATION_PROFILES[formation];
    return [
      label,
      `${signed(100 * (profile.attack - 1), 0)} % / ${signed(100 * (profile.defense - 1), 0)} %`,
      fixed(strength.attack, 2),
      fixed(strength.defense, 2),
      ...resultColumns(tally, baseline),
    ];
  });
  const lines = FORMATION_NAMES.map((formation) => {
    const positions = formationPositions(formation).map(positionGroup);
    return `${formation}: ${(["DF", "MF", "FW"] as const).map((line) => `${positions.filter((group) => group === line).length} ${line}`).join(", ")}`;
  });
  sections.push(
    `### Formation, an ideal eleven at level ${BASE_LEVEL} in each, its profile applied, against a 4-3-3`,
    lines.join(" · "),
    table(["formation", "profile attack / defense", "attack", "defense", ...RESULT_HEADERS], formationRows),
  );

  const knockoutCase = (gap: number): string[] => {
    const team = syntheticTeam("tested", BASE_LEVEL + gap);
    let regulation = 0;
    let extraTime = 0;
    let shootout = 0;
    let advanced = 0;
    for (let index = 0; index < options.matches; index++) {
      const seed = `balance:${index}`;
      const side: Side = index % 2 === 0 ? "home" : "away";
      const result =
        side === "home" ? simulateMatch(team, other, seed, undefined, true) : simulateMatch(other, team, seed, undefined, true);
      regulation += result.decidedBy === "REGULATION" ? 1 : 0;
      extraTime += result.decidedBy === "EXTRA_TIME" ? 1 : 0;
      shootout += result.decidedBy === "PENALTIES" ? 1 : 0;
      advanced += knockoutWinner(result) === side ? 1 : 0;
    }
    return [`+${gap}`, ...[regulation, extraTime, shootout, advanced].map((count) => fixed(percent(count, options.matches)))];
  };
  sections.push(
    "### Knockout match",
    table(["gap", "in 90 minutes %", "in extra time %", "on penalties %", "stronger team through %"], [0, 2, 5, 10].map(knockoutCase)),
  );
}

// ------------------------------------------------------------------ World report

type LeagueFixture = { homeGoals: number; awayGoals: number; homeStrength: number; awayStrength: number };

type LeagueRecord = {
  code: string;
  tier: number;
  fixtures: LeagueFixture[];
  points: number[]; // final table, from the first to the last
  strengthOfRank: number[]; // strength at kick-off, in the order of the final table
  formOfRank: number[]; // final form of the eleven best players, in the same order
};

const GAP_BUCKETS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 5],
  [5, 8],
  [8, 12],
  [12, 99],
];

function spread(values: readonly number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  return `${fixed(sorted[0], 1)} to ${fixed(sorted[sorted.length - 1], 1)}, median ${fixed(sorted[Math.floor(sorted.length / 2)], 1)}`;
}

const SCOPES: readonly (readonly [string, (record: LeagueRecord) => boolean])[] = [
  ["all", () => true],
  ["first divisions", (record) => record.tier === 1],
  ["second divisions", (record) => record.tier === 2],
];

function seasonRows(records: readonly LeagueRecord[]): string[][] {
  return SCOPES.map(([name, keep]) => {
    const leagues = records.filter(keep);
    const fixtures = leagues.flatMap((record) => record.fixtures);
    const goals = fixtures.reduce((sum, fixture) => sum + fixture.homeGoals + fixture.awayGoals, 0);
    const homeWins = fixtures.filter((fixture) => fixture.homeGoals > fixture.awayGoals).length;
    const draws = fixtures.filter((fixture) => fixture.homeGoals === fixture.awayGoals).length;
    const gaps = leagues.map((record) => record.points[0] - record.points[record.points.length - 1]);
    const champions = leagues.map((record) => record.points[0] / ((record.points.length - 1) * 2));
    return [
      name,
      String(fixtures.length),
      fixed(goals / fixtures.length, 2),
      fixed(percent(homeWins, fixtures.length)),
      fixed(percent(draws, fixtures.length)),
      fixed(percent(fixtures.length - homeWins - draws, fixtures.length)),
      fixed(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
      spread(gaps),
      fixed(champions.reduce((sum, value) => sum + value, 0) / champions.length, 2),
    ];
  });
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

type FatigueRecord = {
  starters: number[]; // every AI starter's fitness at kick-off
  rotations: number; // AI starters rested for a fresher player, as selectRestedLineup does
  clubSeasons: number; // AI clubs' seasons
  byMonth: Map<string, number[]>;
  suspensions: { red: number; yellows: number }; // AI players' matches missed through suspension, by cause
};

/**
 * Plays a save's remaining dates as playRemainingMatchdays does, looking first at each date's AI lineups: their players
 * suspended for that match (withSuspensions), the fitness their starters will have once the days of rest are counted (as
 * playNextMatchday counts them), and how many tired starters selectRestedLineup rests.
 */
async function playSeasonWatchingFatigue(
  saveId: string,
  fatigue: FatigueRecord,
  prisma: typeof import("../src/db/client").prisma,
  squadsOf: typeof import("../src/db/matchday").squadsOf,
  playerSelect: typeof import("../src/db/matchday").PLAYER_SELECT,
  playNextMatchday: typeof import("../src/db/matchday").playNextMatchday,
  withSuspensions: typeof import("../src/db/matchday").withSuspensions,
): Promise<void> {
  for (;;) {
    const [save, next] = await Promise.all([
      prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
      prisma.fixture.findFirst({ where: { saveId, played: false }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
    ]);
    if (next === null) {
      return;
    }
    const fixtures = await prisma.fixture.findMany({
      where: { saveId, played: false, scheduledAt: next.scheduledAt },
      select: {
        homeClubSave: { select: { id: true, isManaged: true } },
        awayClubSave: { select: { id: true, isManaged: true } },
        season: { select: { competition: { select: { kind: true } } } },
      },
    });
    const clubs = fixtures
      .flatMap((fixture) => [fixture.homeClubSave, fixture.awayClubSave].map((club) => ({ ...club, kind: fixture.season.competition.kind })))
      .filter((club) => !club.isManaged);
    const rows = await prisma.playerSave.findMany({ where: { saveId, clubSaveId: { in: clubs.map((club) => club.id) } }, select: playerSelect });
    const days = Math.round((next.scheduledAt.getTime() - save.currentDate.getTime()) / 86_400_000);
    const { squads, stateByKey } = squadsOf(rows, next.scheduledAt);
    const month = next.scheduledAt.toISOString().slice(0, 7);
    for (const club of clubs) {
      const squad = withSuspensions(squads.get(club.id) ?? [], club.kind, stateByKey).map((player) => ({
        ...player,
        fitness: recoveredFitness(player.fitness, days),
      }));
      for (const player of squad) {
        const discipline = stateByKey.get(player.id)?.discipline;
        if (discipline !== undefined && isSuspended(discipline, club.kind)) {
          fatigue.suspensions[discipline.suspendedMatches > 0 ? "red" : "yellows"]++;
        }
      }
      const rested = selectRestedLineup(squad);
      const plain = new Set(selectLineup(squad).starters.map((starter) => starter.player.id));
      fatigue.rotations += rested.starters.filter((starter) => !plain.has(starter.player.id)).length;
      const fitness = rested.starters.map((starter) => starter.player.fitness);
      fatigue.starters.push(...fitness);
      fatigue.byMonth.set(month, [...(fatigue.byMonth.get(month) ?? []), ...fitness]);
    }
    await playNextMatchday(saveId);
  }
}

function fatigueTables(fatigue: FatigueRecord, sections: string[]): void {
  const meanOf = (values: readonly number[]): string => fixed(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
  const below = (values: readonly number[], threshold: number): string =>
    fixed(percent(values.filter((value) => value < threshold).length, Math.max(1, values.length)));
  sections.push(
    "### Fatigue: AI starters' fitness at kick-off, league and cup matches",
    table(
      ["month", "starts", "mean fitness", "below 85 %", "below 75 %", "lowest"],
      [...fatigue.byMonth]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, values]) => [month, String(values.length), meanOf(values), below(values, 85), below(values, 75), fixed(values.reduce((low, value) => Math.min(low, value), 100), 0)]),
    ),
    `Whole seasons: mean ${meanOf(fatigue.starters)}, ${below(fatigue.starters, 75)} % of starts below 75; ${fatigue.rotations} tired starters rested, ${fixed(fatigue.rotations / Math.max(1, fatigue.clubSeasons))} per club and season.`,
    `Suspensions served by AI players: ${fixed((fatigue.suspensions.red + fatigue.suspensions.yellows) / Math.max(1, fatigue.clubSeasons))} matches missed per club and season, ${fixed(fatigue.suspensions.red / Math.max(1, fatigue.clubSeasons))} after a red card, ${fixed(fatigue.suspensions.yellows / Math.max(1, fatigue.clubSeasons))} after five yellows.`,
  );
}

function worldTables(records: readonly LeagueRecord[], frozen: readonly LeagueRecord[], sections: string[]): void {
  const scopes = SCOPES;
  const seasonHeaders = ["scope", "matches", "goals/match", "home wins %", "draws %", "away wins %", "1st - last, pts", "range", "champion pts/match"];
  sections.push(
    "## 3. Complete seasons of a worldVersion 2 save (league matches only)",
    table(seasonHeaders, seasonRows(records)),
    "Reference points of real football: 2.6 to 2.8 goals a match, 24 to 27 % of draws, 43 to 46 % of home wins.",
    "### The same leagues on paper: squads frozen at kick-off, form at 50, no injury carried, no transfer",
    table(seasonHeaders, seasonRows(frozen)),
  );

  const formRows = scopes.map(([name, keep]) => {
    const leagues = records.filter(keep);
    const third = (record: LeagueRecord, part: number): number[] => {
      const size = Math.floor(record.formOfRank.length / 3);
      return record.formOfRank.slice(part * size, part === 2 ? undefined : (part + 1) * size);
    };
    const all = leagues.flatMap((record) => record.formOfRank);
    return [
      name,
      fixed(mean(leagues.map((record) => record.formOfRank[0]))),
      fixed(mean(leagues.flatMap((record) => third(record, 0)))),
      fixed(mean(leagues.flatMap((record) => third(record, 1)))),
      fixed(mean(leagues.flatMap((record) => third(record, 2)))),
      fixed(mean(leagues.map((record) => record.formOfRank[record.formOfRank.length - 1]))),
      `${fixed(Math.min(...all))} to ${fixed(Math.max(...all))}`,
    ];
  });
  sections.push(
    "### Mean form of a club's eleven best players at the end of the season (neutral: 50)",
    table(["scope", "champion", "top third", "middle third", "bottom third", "last club", "all clubs, range"], formRows),
  );

  const upsetRows = scopes.flatMap(([name, keep]) => {
    const fixtures = records.filter(keep).flatMap((record) => record.fixtures);
    return GAP_BUCKETS.map(([from, to]) => {
      const inBucket = fixtures.filter((fixture) => {
        const gap = Math.abs(fixture.homeStrength - fixture.awayStrength);
        return gap >= from && gap < to;
      });
      const stronger = inBucket.filter((fixture) => {
        const homeStronger = fixture.homeStrength >= fixture.awayStrength;
        return homeStronger ? fixture.homeGoals > fixture.awayGoals : fixture.awayGoals > fixture.homeGoals;
      }).length;
      const draws = inBucket.filter((fixture) => fixture.homeGoals === fixture.awayGoals).length;
      const total = Math.max(1, inBucket.length);
      return [
        name,
        to === 99 ? `${from}+` : `${from}-${to}`,
        String(inBucket.length),
        fixed(percent(stronger, total)),
        fixed(percent(draws, total)),
        fixed(percent(inBucket.length - stronger - draws, total)),
      ];
    });
  });
  sections.push(
    "### Upsets, by gap of mean starter rating at the season's kick-off",
    table(["scope", "rating gap", "matches", "stronger wins %", "draws %", "weaker wins %"], upsetRows),
  );

  const summaryRows = scopes.map(([name, keep]) => {
    const leagues = records.filter(keep);
    const strongestWon = leagues.filter((record) => record.strengthOfRank[0] === Math.max(...record.strengthOfRank)).length;
    const strengthGaps = leagues.map((record) => Math.max(...record.strengthOfRank) - Math.min(...record.strengthOfRank));
    const decided = leagues.flatMap((record) => record.fixtures).filter((fixture) => Math.abs(fixture.homeStrength - fixture.awayStrength) >= 1);
    const upsets = decided.filter((fixture) =>
      fixture.homeStrength > fixture.awayStrength ? fixture.awayGoals > fixture.homeGoals : fixture.homeGoals > fixture.awayGoals,
    ).length;
    return [
      name,
      `${strongestWon} / ${leagues.length}`,
      fixed(strengthGaps.reduce((sum, gap) => sum + gap, 0) / strengthGaps.length),
      `${upsets} / ${decided.length}`,
      fixed(percent(upsets, Math.max(1, decided.length))),
    ];
  });
  sections.push(
    "### Surprises over the seasons",
    table(
      ["scope", "strongest club champion", "strongest - weakest club, rating", "weaker wins (gap ≥ 1)", "%"],
      summaryRows,
    ),
  );
}

async function measureWorld(options: Options, sections: string[]): Promise<void> {
  // Loaded here: the engine's measures need no database.
  const { prisma } = await import("../src/db/client");
  const { isLocalDatabase } = await import("../src/db/database-url");
  const { squadsOf, PLAYER_SELECT } = await import("../src/db/matchday");
  const { createSave } = await import("../src/db/saves");
  const { getStandings } = await import("../src/db/standings");
  const { DEMO_CLUB_SLUG } = await import("../src/db/test-support");
  const { playNextMatchday, withSuspensions } = await import("../src/db/matchday");

  const url = process.env.DATABASE_URL ?? "";
  if (url === "" || !isLocalDatabase(url)) {
    throw new Error("Refusing to write anywhere else than the local database");
  }

  const records: LeagueRecord[] = [];
  const fatigue: FatigueRecord = { starters: [], rotations: 0, clubSeasons: 0, byMonth: new Map(), suspensions: { red: 0, yellows: 0 } };
  const frozen: LeagueRecord[] = [];
  const formationRows: string[][] = [];
  const club = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  try {
    for (let seedIndex = 0; seedIndex < options.seeds; seedIndex++) {
      const started = performance.now();
      await prisma.user.createMany({ data: [{ id: OWNER, kind: "REGISTERED", lastSeenAt: new Date() }], skipDuplicates: true });
      const { id: saveId } = await createSave({
        name: `Mesure équilibrage ${seedIndex + 1}`,
        managerName: "Test",
        clubId: club.id,
        seed: `measure-balance-${seedIndex + 1}`,
        ownerId: OWNER,
        worldVersion: 2,
      });

      const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
      const rows = await prisma.playerSave.findMany({ where: { saveId, clubSaveId: { not: null } }, select: PLAYER_SELECT });
      const { squads } = squadsOf(rows, save.currentDate);
      const strength = new Map([...squads].map(([clubSaveId, squad]) => [clubSaveId, averageStarterRating(selectLineup(squad))]));
      const seasons = await prisma.season.findMany({
        where: { saveId, completed: false, competition: { kind: "LEAGUE" } },
        select: { id: true, competition: { select: { code: true, tier: true } } },
      });

      if (seedIndex === 0) {
        formationRows.push(...(await measureFormations(saveId, seasons, squads, options, prisma)));
      }

      const clubs = await prisma.clubSave.findMany({
        where: { saveId },
        select: { id: true, isManaged: true, club: { select: { slug: true } }, competition: { select: { code: true } } },
      });
      const idOfSlug = new Map(clubs.map((row) => [row.club.slug, row.id]));
      for (const season of seasons) {
        const members = clubs.filter((row) => row.competition.code === season.competition.code).map((row) => row.id);
        frozen.push(frozenLeague(season, members, squads, strength, seedIndex));
      }

      fatigue.clubSeasons += clubs.filter((row) => !row.isManaged).length;
      await playSeasonWatchingFatigue(saveId, fatigue, prisma, squadsOf, PLAYER_SELECT, playNextMatchday, withSuspensions);

      const final = await prisma.playerSave.findMany({
        where: { saveId, clubSaveId: { not: null } },
        select: { clubSaveId: true, overall: true, form: true },
      });
      const formOfClub = new Map(
        [...Map.groupBy(final, (player) => player.clubSaveId)].map(([clubSaveId, players]) => [
          clubSaveId,
          mean([...players].sort((a, b) => b.overall - a.overall).slice(0, 11).map((player) => player.form)),
        ]),
      );
      for (const season of seasons) {
        const [fixtures, standings] = await Promise.all([
          prisma.fixture.findMany({
            where: { saveId, seasonId: season.id },
            select: { homeGoals: true, awayGoals: true, homeClubSaveId: true, awayClubSaveId: true },
          }),
          getStandings(saveId, season.id),
        ]);
        records.push({
          code: season.competition.code,
          tier: season.competition.tier,
          fixtures: fixtures.map((fixture) => ({
            homeGoals: fixture.homeGoals ?? 0,
            awayGoals: fixture.awayGoals ?? 0,
            homeStrength: strength.get(fixture.homeClubSaveId) ?? 0,
            awayStrength: strength.get(fixture.awayClubSaveId) ?? 0,
          })),
          points: standings.map((row) => row.points),
          strengthOfRank: standings.map((row) => strength.get(idOfSlug.get(row.club) ?? "") ?? 0),
          formOfRank: standings.map((row) => formOfClub.get(idOfSlug.get(row.club) ?? "") ?? 0),
        });
      }
      await prisma.user.delete({ where: { id: OWNER } });
      console.log(`  seed ${seedIndex + 1}: ${Math.round((performance.now() - started) / 1000)} s`);
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: OWNER } });
    await prisma.$disconnect();
  }

  worldTables(records, frozen, sections);
  fatigueTables(fatigue, sections);
  sections.push(
    "### Formations on real squads, against the median club of the league in its 4-3-3",
    table(
      ["club", "formation", "mean rating", "attack", "defense", "off-position starters", ...RESULT_HEADERS.slice(0, 3), "Δ pts/match against the 4-3-3"],
      formationRows,
    ),
  );
}

type LeagueSeason = { id: string; competition: { code: string; tier: number } };

/** A league played on paper, home and away: nothing evolves, the eleven picked at kick-off plays every match. */
function frozenLeague(
  season: LeagueSeason,
  clubs: readonly string[],
  squads: ReadonlyMap<string, SquadPlayer[]>,
  strength: ReadonlyMap<string, number>,
  seedIndex: number,
): LeagueRecord {
  const lineups = new Map(clubs.map((club) => [club, selectLineup((squads.get(club) ?? []).map((player) => ({ ...player, form: 50 })))]));
  const points = new Map(clubs.map((club) => [club, 0]));
  const fixtures: LeagueFixture[] = [];
  for (const home of clubs) {
    for (const away of clubs) {
      const [homeLineup, awayLineup] = [lineups.get(home), lineups.get(away)];
      if (home === away || homeLineup === undefined || awayLineup === undefined) {
        continue;
      }
      const { homeGoals, awayGoals } = simulateMatch(homeLineup, awayLineup, `frozen:${seedIndex}:${home}:${away}`);
      points.set(home, (points.get(home) ?? 0) + (homeGoals > awayGoals ? 3 : homeGoals === awayGoals ? 1 : 0));
      points.set(away, (points.get(away) ?? 0) + (awayGoals > homeGoals ? 3 : homeGoals === awayGoals ? 1 : 0));
      fixtures.push({ homeGoals, awayGoals, homeStrength: strength.get(home) ?? 0, awayStrength: strength.get(away) ?? 0 });
    }
  }
  const table = [...points].sort(([, a], [, b]) => b - a);
  return {
    code: season.competition.code,
    tier: season.competition.tier,
    fixtures,
    points: table.map(([, value]) => value),
    strengthOfRank: table.map(([club]) => strength.get(club) ?? 0),
    formOfRank: table.map(() => 50),
  };
}

async function measureFormations(
  saveId: string,
  seasons: readonly LeagueSeason[],
  squads: ReadonlyMap<string, SquadPlayer[]>,
  options: Options,
  prisma: typeof import("../src/db/client").prisma,
): Promise<string[][]> {
  const league = seasons.find((season) => season.competition.code === "fr.1") ?? seasons[0];
  const clubs = await prisma.clubSave.findMany({
    where: { saveId, competition: { code: league.competition.code } },
    select: { id: true, club: { select: { slug: true, initialRank: true } } },
    orderBy: { club: { initialRank: "asc" } },
  });
  const median = clubs[Math.floor(clubs.length / 2)];
  const opponent = selectLineup(squads.get(median.id) ?? []);
  const tested = [clubs[0], clubs[Math.floor(clubs.length / 4)], clubs[clubs.length - 1]];
  const rows: string[][] = [];
  for (const row of tested) {
    const squad = squads.get(row.id) ?? [];
    let reference: Tally | undefined;
    for (const formation of FORMATION_NAMES) {
      const lineup = selectLineup(squad, formationPositions(formation));
      const tally = duel(lineup, opponent, options.matches, "both", plainMatch({ tested: formation, other: DEFAULT_FORMATION_NAME }));
      reference ??= tally;
      const strength = formationStrength(lineup, formation);
      const offPosition = lineup.starters.filter(({ player, slot }) => ratingAt(player, slot) < player.overall).length;
      rows.push([
        row.club.slug,
        formation,
        fixed(averageStarterRating(lineup), 2),
        fixed(strength.attack, 2),
        fixed(strength.defense, 2),
        String(offPosition),
        ...resultColumns(tally, reference).slice(0, 3),
        signed(pointsPerMatch(tally) - pointsPerMatch(reference), 3),
      ]);
    }
  }
  return rows;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const started = performance.now();
  const sections: string[] = [
    `Base ${BASE_GOALS_PER_TEAM} goals, exponent ${STRENGTH_EXPONENT}, home advantage ${HOME_ADVANTAGE}, form retention ${FORM_RETENTION}. ${
      options.matches
    } matches a case: a share is good to about ±${fixed(
      100 * 1.96 * Math.sqrt(0.25 / options.matches),
    )} points, a difference between two cases much closer, on the same seeds.`,
  ];
  if (options.engine) {
    gapTables(options, sections);
    factorTables(options, sections);
    console.log(`Engine: ${Math.round((performance.now() - started) / 1000)} s`);
  }
  if (options.world) {
    await measureWorld(options, sections);
  }
  const text = sections.join("\n\n");
  console.log(`\n${text}`);
  if (options.out !== undefined) {
    writeFileSync(options.out, text);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
