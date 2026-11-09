import { describe, expect, it } from "vitest";
import type { DecisionView, FixtureWithEvents, MatchEventView } from "@/src/db/calendar";
import type { LiveStep } from "@/src/db/live-match";
import type { InstructionSpan } from "@/src/engine/instructions";
import { readAgain, withStep, type LiveData } from "./live-step";

const team = (name: string, isManaged: boolean) => ({
  clubSaveId: name,
  name,
  isManaged,
  colors: { primary: "#000000", secondary: "#ffffff" },
});

const event = (id: string, minute: number): MatchEventView => ({
  id,
  minute,
  type: "GOAL",
  period: "REGULAR",
  side: "home",
  playerName: "Ada Martin",
  playerKey: "p1",
  playerAge: 24,
  relatedPlayerName: null,
  relatedPlayerKey: null,
});

const decision = (sequence: number, minute: number): DecisionView => ({
  sequence,
  minute,
  kind: "SCUFFLE",
  option: "CALM",
  assistant: true,
  playerName: null,
  playerKey: null,
});

const MATCH: FixtureWithEvents = {
  id: "fixture",
  round: 1,
  cup: false,
  scheduledAt: new Date("2026-08-15T00:00:00Z"),
  competitionCode: "fr.1",
  home: team("Lyon", true),
  away: team("Nice", false),
  played: false,
  homeGoals: null,
  awayGoals: null,
  homeHalfTimeGoals: null,
  awayHalfTimeGoals: null,
  decidedBy: null,
  homePenalties: null,
  awayPenalties: null,
  events: [event("a", 12)],
  decisions: [decision(1, 15)],
  instructions: [],
};

const STARTED: InstructionSpan = { from: 0, instruction: "DEFEND", source: "START" };
const ATTACKING: InstructionSpan = { from: 15, instruction: "ATTACK", source: "MANAGER" };

const AT_15: LiveData = { match: MATCH, pause: { phase: "IN_PLAY", minute: 15, choice: null }, team: null, instructions: [STARTED] };

const STEP: LiveStep = {
  events: [event("b", 22)],
  decisions: [decision(2, 30)],
  instructions: [STARTED, ATTACKING],
  pause: { phase: "IN_PLAY", minute: 30, choice: null },
  team: null,
  result: null,
};

describe("a step of the live match", () => {
  it("adds its events and decisions after the page's, takes its instructions, and waits at its pause", () => {
    const next = withStep(AT_15, STEP);
    expect(next.match.events.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(next.match.decisions.map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(next.instructions).toEqual([STARTED, ATTACKING]);
    expect(next.pause).toEqual(STEP.pause);
    expect(next.match.played).toBe(false);
  });

  it("adds nothing twice: the page may have read the step's events meanwhile", () => {
    const read: LiveData = { ...AT_15, match: { ...MATCH, events: [event("a", 12), event("b", 22)], decisions: [decision(1, 15), decision(2, 30)] } };
    expect(withStep(read, STEP).match.events.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(withStep(read, STEP).match.decisions).toHaveLength(2);
  });

  it("ends the match with its result, waiting nowhere", () => {
    const final = withStep(AT_15, {
      ...STEP,
      pause: null,
      result: { homeGoals: 2, awayGoals: 2, decidedBy: "PENALTIES", homePenalties: 4, awayPenalties: 3 },
    });
    expect(final.pause).toBeNull();
    expect(final.match).toMatchObject({ played: true, homeGoals: 2, awayGoals: 2, decidedBy: "PENALTIES", homePenalties: 4, awayPenalties: 3 });
    expect(final.instructions).toEqual([STARTED, ATTACKING]);
  });
});

describe("the page read again", () => {
  const over: LiveData = { match: { ...MATCH, played: true, homeGoals: 1, awayGoals: 0 }, pause: null, team: null, instructions: null };
  const ended = withStep(AT_15, { ...STEP, pause: null, result: { homeGoals: 1, awayGoals: 0, decidedBy: null, homePenalties: null, awayPenalties: null } });

  it("keeps the instructions its steps brought to the final whistle: the server no longer has them", () => {
    const read = readAgain(ended, over);
    expect(read.match).toBe(over.match);
    expect(read.instructions).toEqual([STARTED, ATTACKING]);
  });

  it("takes the server's while the match waits: another tab may have played on", () => {
    const elsewhere: LiveData = { ...AT_15, pause: { phase: "HALF_TIME", minute: 45, choice: null }, instructions: [STARTED] };
    expect(readAgain(withStep(AT_15, STEP), elsewhere)).toBe(elsewhere);
  });

  it("keeps none of a match another tab took to its end: they would stop where the page's steps did", () => {
    expect(readAgain(withStep(AT_15, STEP), over).instructions).toBeNull();
  });

  it("never gives a match another one's", () => {
    expect(readAgain(ended, { ...over, match: { ...over.match, id: "another" } }).instructions).toBeNull();
  });
});
