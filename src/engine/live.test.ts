import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { MAX_SUBSTITUTION_WINDOWS, POSITION_PROFILES } from "./balance";
import { choiceEvent, decideChoice, isChoicePossible, withChoices } from "./choices";
import { DEFAULT_FORMATION_NAME, formationPositions } from "./formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "./generation";
import type { Lineup, SquadPlayer } from "./lineup";
import { playOn } from "./live";
import {
  applyAutomaticHalfTime,
  HalfTimeChoiceError,
  instructionAt,
  startMatch,
  type HalfTimeChoice,
  type HalfTimeChoiceIssue,
  type MatchState,
} from "./match";
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

/**
 * The home side's match played on boundary by boundary from kick-off to a minute, as the managed club's: with its choice
 * events, decided by the assistant, unless told otherwise.
 */
function stateAt(minute: number, seed: string, { knockout = false, choices = true } = {}): MatchState {
  const kickOff = startMatch(HOME, AWAY, undefined, knockout);
  let state = choices ? withChoices(kickOff, "home", seed) : kickOff;
  while (state.played < minute && state.phase !== "FULL_TIME") {
    state = playOn(state, "home", seed, {}, "segment");
  }
  return state.choices?.pending ? decideChoice(state, seed, null) : state;
}

/** The home side's eleven as it stands, with a substitute on in the slot of each player named, the bench in order. */
function substituting(state: MatchState, outs: readonly string[]): HalfTimeChoice {
  const substitutions = outs.map((out, index) => ({ out, in: state.home.bench[index].id }));
  const comingOn = new Map(substitutions.map((change) => [change.out, change.in]));
  return {
    formation: state.home.formation,
    starters: state.home.pitch
      .filter((entry) => entry.status === "ON")
      .map((entry) => ({ slot: entry.index, playerKey: comingOn.get(entry.player.id) ?? entry.player.id })),
    substitutions,
  };
}

/** An outfield starter of the home side still on the pitch. */
function starterOn(state: MatchState): string {
  const entry = state.home.pitch.find((candidate) => candidate.status === "ON" && candidate.slot !== "GK" && candidate.from === 0);
  if (entry === undefined) {
    throw new Error("No starter left on the pitch");
  }
  return entry.player.id;
}

function issueOf(run: () => unknown): HalfTimeChoiceIssue | null {
  try {
    run();
  } catch (error) {
    if (error instanceof HalfTimeChoiceError) {
      return error.issue;
    }
    throw error;
  }
  return null;
}

/** The match played on to its next boundary with the home side's changes, its event there decided by the assistant. */
function nextBoundary(state: MatchState, seed: string, changes: HalfTimeChoice | null): MatchState {
  const next = playOn(state, "home", seed, { changes }, "segment");
  return next.choices?.pending ? decideChoice(next, seed, null) : next;
}

const playedToTheEnd = (from: MatchState, seed: string): MatchState => {
  let state = from;
  while (state.phase !== "FULL_TIME") {
    state = playOn(state, "home", seed, {}, "break");
  }
  return state;
};

describe("the manager at a pause between two segments", () => {
  it("makes substitutions dated the minute after, in one of three windows during play, half-time apart", () => {
    const at15 = stateAt(15, "windows");
    const [first, incoming] = [starterOn(at15), at15.home.bench[0].id];
    const at30 = nextBoundary(at15, "windows", substituting(at15, [first]));
    expect(at30.events).toContainEqual({ minute: 16, side: "home", type: "SUBSTITUTION", playerId: incoming, relatedPlayerId: first });
    expect(at30.home.windows).toEqual([16]);
    expect(at30.home.pitch.find((entry) => entry.player.id === incoming)?.from).toBe(15);

    // A second window at 30', then half-time, which takes none.
    const halfTime = nextBoundary(at30, "windows", substituting(at30, [starterOn(at30)]));
    expect(halfTime.phase).toBe("HALF_TIME");
    expect(halfTime.home.windows).toEqual([16, 31]);
    const at60 = nextBoundary(halfTime, "windows", substituting(halfTime, [starterOn(halfTime)]));
    expect(at60.home.windows).toEqual([16, 31]);
    expect(at60.home.substitutions).toBe(3);

    // The third at 60', the last: at 75' a substitution is refused, other changes are not.
    const at75 = nextBoundary(at60, "windows", substituting(at60, [starterOn(at60)]));
    expect(at75.home.windows).toEqual([16, 31, 61]);
    expect(at75.home.windows).toHaveLength(MAX_SUBSTITUTION_WINDOWS);
    expect(issueOf(() => nextBoundary(at75, "windows", substituting(at75, [starterOn(at75)])))).toBe("no-window");
    expect(issueOf(() => nextBoundary(at75, "windows", { ...substituting(at75, []), formation: "4-4-2" }))).toBeNull();
  });

  it("takes over his side's substitutions: his assistant makes no tactical one any more, an injured player is still replaced", () => {
    let assistant = 0;
    for (let index = 0; index < 60; index++) {
      const seed = `takeover:${index}`;
      const halfTime = stateAt(45, seed);
      const own = playOn(halfTime, "home", seed, { changes: substituting(halfTime, [starterOn(halfTime)]) }, "segment");
      expect(own.home.manual).toBe(true);
      const state = playedToTheEnd(own, seed);
      const injuredAt = new Set(state.events.filter((event) => event.side === "home" && event.type === "INJURY").map((event) => event.minute));
      const later = state.events.filter((event) => event.side === "home" && event.type === "SUBSTITUTION" && event.minute > 46);
      // Only an injured player's replacement, or a choice event's substitution, dated the minute after its boundary.
      expect(later.every((event) => injuredAt.has(event.minute) || [61, 76].includes(event.minute))).toBe(true);

      const untouched = playedToTheEnd(halfTime, seed);
      assistant += untouched.events.filter((event) => event.side === "home" && event.type === "SUBSTITUTION" && event.minute > 46).length;
    }
    // Left alone, the assistant makes his three tactical substitutions in the second half.
    expect(assistant).toBeGreaterThan(60 * 2);
  });

  it("gives an instruction for the rest of the period of play, regular time or extra time, whatever the score does", () => {
    const at30 = stateAt(30, "instruction", { choices: false });
    let state = playOn(at30, "home", "instruction", { instruction: "ATTACK" }, "segment");
    expect(instructionAt(state, "home")).toBe("ATTACK");
    // Kept with the segments it plays, as his.
    expect(state.home.instructions?.at(-1)).toEqual({ from: 30, instruction: "ATTACK", source: "MANAGER" });
    while (state.phase !== "FULL_TIME") {
      expect(state.modifiers?.instructions.home).toBe("ATTACK");
      state = playOn(state, "home", "instruction", {}, "segment");
    }
    expect(state.modifiers?.instructions.home).toBeUndefined();

    // A cup tie level after 90 minutes: an instruction before extra time holds for both of its periods.
    const level = Array.from({ length: 80 }, (_, index) => `extra:${index}`)
      .map((seed) => ({ seed, state: stateAt(90, seed, { knockout: true, choices: false }) }))
      .find(({ state: candidate }) => candidate.phase === "REGULATION_END");
    if (level === undefined) {
      throw new Error("No cup tie level after 90 minutes among the seeds");
    }
    const closed = playOn(level.state, "home", level.seed, { instruction: "DEFEND" }, "segment");
    expect(closed.phase).toBe("EXTRA_TIME_BREAK");
    expect(instructionAt(closed, "home")).toBe("DEFEND");
    expect(playOn(level.state, "home", level.seed, {}, "segment").modifiers?.instructions.home).toBeUndefined();
  });

  it("refuses changes or an instruction away from a pause", () => {
    const kickOff = withChoices(startMatch(HOME, AWAY), "home", "refuse");
    expect(issueOf(() => playOn(kickOff, "home", "refuse", { instruction: "ATTACK" }))).toBe("not-half-time");
    expect(issueOf(() => playOn(kickOff, "home", "refuse", { changes: substituting(kickOff, []) }))).toBe("not-half-time");
  });

  it("keeps a player who plays on after a knock hurt through the changes of a pause", () => {
    const at30 = stateAt(30, "hurt");
    const event = choiceEvent("KNOCK", at30, "home", 30, makeRng("hurt"));
    const waiting: MatchState = { ...at30, choices: { side: "home", minutes: [30], pending: event, decisions: [] } };
    const halfTime = playOn(decideChoice(waiting, "hurt", { option: "PLAY_ON" }), "home", "hurt", {}, "segment");
    const resumed = applyAutomaticHalfTime(halfTime);
    expect(resumed.home.pitch.find((entry) => entry.player.id === event.playerId)).toMatchObject({ status: "ON", hurt: true });
  });

  it("offers an event that takes a player off with a window only, once he makes his substitutions himself", () => {
    const at60 = stateAt(60, "no-window");
    const used: MatchState = { ...at60, home: { ...at60.home, manual: true, windows: [16, 31, 56] } };
    expect(isChoicePossible("KNOCK", used, "home", 60)).toBe(false);
    expect(isChoicePossible("KNOCK", { ...used, home: { ...used.home, windows: [16, 31, 61] } }, "home", 60)).toBe(true);
    // His assistant's matches keep their events, as in a simulated match.
    expect(isChoicePossible("KNOCK", { ...used, home: { ...used.home, manual: undefined } }, "home", 60)).toBe(true);
  });
});
