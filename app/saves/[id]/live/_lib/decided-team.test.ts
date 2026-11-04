import { describe, expect, it } from "vitest";
import type { ChoiceEventView, HalfTimePlayer, HalfTimeTeam } from "@/src/db/live-match";
import { KNOCK_SHARE, MAX_SUBSTITUTION_WINDOWS, MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import type { Instruction } from "@/src/engine/instructions";
import { decidedTeam } from "./decided-team";

const player = (id: string): HalfTimePlayer => ({
  id,
  position: "CM",
  overall: 70,
  injured: false,
  injuredUntil: null,
  form: 50,
  fitness: 80,
  fitnessFactor: 0.9,
  condition: 0.9,
  firstName: "Léo",
  lastName: id,
  age: 25,
});

const STARTERS = Array.from({ length: 11 }, (_, index) => `s${index}`);

const TEAM: HalfTimeTeam = {
  phase: "IN_PLAY",
  minute: 60,
  maxSubstitutions: MAX_SUBSTITUTIONS,
  substitutions: 1,
  windows: { used: 1, max: MAX_SUBSTITUTION_WINDOWS, open: true },
  manual: false,
  instruction: { current: "DEFEND", source: "START", assistant: "DEFEND", starting: "DEFEND" },
  formation: "4-3-3",
  starters: STARTERS,
  injured: [],
  sentOff: [],
  bench: ["b0", "b1"],
  booked: [],
  hurt: [],
  players: [...STARTERS, "b0", "b1"].map(player),
  clubColors: { primary: "#000000", secondary: "#ffffff" },
};

const knock: ChoiceEventView = {
  minute: 60,
  kind: "KNOCK",
  player: "Léo s7",
  playerKey: "s7",
  options: [
    { option: "TAKE_OFF", playerKey: "s7", player: "Léo s7", chance: null, replacement: { key: "b1", name: "Léo b1" }, instruction: null },
    { option: "PLAY_ON", playerKey: "s7", player: "Léo s7", chance: null, replacement: null, instruction: null },
  ],
  assistant: 0,
};

describe("the team a decision on a choice event leaves", () => {
  it("brings the substitute the event names on in the slot of the player taken off, in this pause's window", () => {
    const { team, change } = decidedTeam(TEAM, knock, 0);
    expect(change).toEqual({ out: "s7", in: "b1" });
    expect(team.starters[7]).toBe("b1");
    expect(team.bench).toEqual(["b0"]);
    expect(team.substitutions).toBe(2);
    expect(team.windows).toEqual({ used: 2, max: MAX_SUBSTITUTION_WINDOWS, open: true });
  });

  it("takes no window at a break: half-time and the breaks of extra time are none", () => {
    const { team } = decidedTeam({ ...TEAM, phase: "EXTRA_TIME_BREAK", minute: 105 }, { ...knock, minute: 105 }, 0);
    expect(team.windows).toEqual(TEAM.windows);
  });

  it("plays a knocked player on hurt, at a share of his strength", () => {
    const { team, change } = decidedTeam(TEAM, knock, 1);
    expect(change).toBeNull();
    expect(team.starters).toEqual(STARTERS);
    expect(team.hurt).toEqual(["s7"]);
    expect(team.players.find(({ id }) => id === "s7")?.condition).toBeCloseTo(0.9 * KNOCK_SHARE);
  });

  it("gives a late tactical choice's instruction, the event's: carrying on, the one the club started with", () => {
    const offered = (option: "DEFEND" | "ATTACK" | "STEADY", instruction: Instruction): ChoiceEventView["options"][number] => ({
      option,
      playerKey: null,
      player: null,
      chance: null,
      replacement: null,
      instruction,
    });
    const event = (kind: "LEADING" | "CHASING", options: ChoiceEventView["options"]): ChoiceEventView => ({
      minute: 75,
      kind,
      player: null,
      playerKey: null,
      options,
      assistant: 0,
    });

    // Started closed (TEAM), and ahead: carrying on keeps the game closed, now until the end whatever the score.
    const leading = event("LEADING", [offered("DEFEND", "DEFEND"), offered("ATTACK", "ATTACK"), offered("STEADY", "DEFEND")]);
    expect(decidedTeam(TEAM, leading, 1)).toEqual({
      team: { ...TEAM, instruction: { current: "ATTACK", source: "EVENT", assistant: "DEFEND", starting: "DEFEND" } },
      change: null,
    });
    expect(decidedTeam(TEAM, leading, 2).team.instruction).toEqual({ current: "DEFEND", source: "EVENT", assistant: "DEFEND", starting: "DEFEND" });

    // Started balanced, and behind: the assistant attacks, carrying on is going back to the balanced start.
    const behind: HalfTimeTeam = { ...TEAM, instruction: { current: "ATTACK", source: "ASSISTANT", assistant: "ATTACK", starting: "BALANCED" } };
    const chasing = event("CHASING", [offered("ATTACK", "ATTACK"), offered("STEADY", "BALANCED")]);
    expect(decidedTeam(behind, chasing, 1).team.instruction).toEqual({ current: "BALANCED", source: "EVENT", assistant: "ATTACK", starting: "BALANCED" });
  });

  it("leaves the team as it is for a decision that changes nobody now", () => {
    const scuffle: ChoiceEventView = {
      minute: 30,
      kind: "SCUFFLE",
      player: "Léo s4",
      playerKey: "s4",
      options: [
        { option: "CALM", playerKey: null, player: null, chance: null, replacement: null, instruction: null },
        { option: "PROTEST", playerKey: "s4", player: "Léo s4", chance: null, replacement: null, instruction: null },
      ],
      assistant: 0,
    };
    expect(decidedTeam(TEAM, scuffle, 1)).toEqual({ team: TEAM, change: null });
  });
});
