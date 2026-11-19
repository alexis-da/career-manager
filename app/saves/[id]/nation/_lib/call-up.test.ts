import { describe, expect, it } from "vitest";
import type { CallUpCandidate } from "@/src/db/national-view";
import { CALL_UP_SIZE } from "@/src/engine/balance";
import type { Position } from "@/src/engine/positions";
import { callUpIssue, callUpLines, goalkeepersOf, initialSelection, selectedKeys, shownCandidates } from "./call-up";

function candidate(key: string, position: Position, overall: number, extra: Partial<CallUpCandidate> = {}): CallUpCandidate {
  return {
    key,
    firstName: "Jo",
    lastName: key,
    position,
    overall,
    age: 25,
    club: "Lyon",
    ownClub: false,
    fitness: 100,
    caps: 0,
    goals: 0,
    injured: false,
    ...extra,
  };
}

/** A line of players, best first: « DF1 » rated 80, « DF2 » 79… */
const line = (prefix: string, position: Position, count: number, best: number): CallUpCandidate[] =>
  Array.from({ length: count }, (_, index) => candidate(`${prefix}${index + 1}`, position, best - index));

/** A nation's candidates, best first as the editor sorts them. */
function candidates(): CallUpCandidate[] {
  return [...line("GK", "GK", 5, 80), ...line("DF", "CB", 20, 79), ...line("MF", "CM", 20, 79), ...line("FW", "ST", 20, 79)].sort(
    (a, b) => b.overall - a.overall || (a.key < b.key ? -1 : 1),
  );
}

/** His assistant's 23: three goalkeepers, seven defenders, seven midfielders, four forwards, two more defenders. */
const ASSISTANT = [
  ...["GK1", "GK2", "GK3"],
  ...["DF1", "DF2", "DF3", "DF4", "DF5", "DF6", "DF7", "DF8", "DF9"],
  ...["MF1", "MF2", "MF3", "MF4", "MF5", "MF6", "MF7"],
  ...["FW1", "FW2", "FW3", "FW4"],
];

describe("the list the sheet opens on", () => {
  it("is his own list, else his assistant's", () => {
    const pool = candidates();
    expect(initialSelection({ chosen: null, assistant: ASSISTANT, candidates: pool })).toEqual(ASSISTANT);
    const own = ASSISTANT.map((key) => (key === "FW4" ? "FW5" : key));
    expect(initialSelection({ chosen: own, assistant: ASSISTANT, candidates: pool })).toEqual(own);
  });

  it("leaves out a player injured on the first date, or gone from the candidates", () => {
    const pool = candidates().map((entry) => (entry.key === "MF2" ? { ...entry, injured: true } : entry));
    const own = [...ASSISTANT.slice(0, 22), "gone"];
    const opened = initialSelection({ chosen: own, assistant: ASSISTANT, candidates: pool });
    expect(opened).not.toContain("MF2");
    expect(opened).not.toContain("gone");
    // The first 22 of the assistant's but MF2: he picks the two others himself.
    expect(opened).toEqual(ASSISTANT.slice(0, 22).filter((key) => key !== "MF2"));
  });
});

describe("the candidates shown", () => {
  it("keeps both lists and his club's players, then the best others of each line, in their order", () => {
    const pool = candidates().map((entry) => (entry.key === "DF20" ? { ...entry, ownClub: true } : entry));
    const chosen = ASSISTANT.map((key) => (key === "FW4" ? "FW18" : key));
    const shown = shownCandidates({ chosen, assistant: ASSISTANT, candidates: pool }, 2);
    const keys = shown.map((entry) => entry.key);
    // Both lists, the lowest rated of them included.
    for (const key of [...ASSISTANT, "FW18"]) {
      expect(keys).toContain(key);
    }
    // His club's defender, rated last of his line.
    expect(keys).toContain("DF20");
    // Two others a line, the best: GK4 and GK5, DF10 and DF11, MF8 and MF9, FW5 and FW6.
    expect(keys.filter((key) => ![...ASSISTANT, "FW18", "DF20"].includes(key)).sort()).toEqual(
      ["DF10", "DF11", "FW5", "FW6", "GK4", "GK5", "MF8", "MF9"].sort(),
    );
    // The editor's order: best first.
    expect(shown).toEqual(pool.filter((entry) => keys.includes(entry.key)));
  });

  it("shows every candidate of a small nation", () => {
    const pool = candidates().slice(0, 30);
    expect(shownCandidates({ chosen: null, assistant: [], candidates: pool })).toHaveLength(pool.length);
  });
});

describe("the sheet's lines", () => {
  it("goes from the goal outwards, each line's players called first, best first, then the others", () => {
    const pool = candidates();
    const selected = new Set(["GK2", "GK3", "DF5"]);
    const lines = callUpLines(pool, selected);
    expect(lines.map((entry) => entry.line)).toEqual(["GK", "DF", "MF", "FW"]);
    expect(lines[0].called.map((entry) => entry.key)).toEqual(["GK2", "GK3"]);
    expect(lines[0].others.map((entry) => entry.key)).toEqual(["GK1", "GK4", "GK5"]);
    expect(lines[1].called.map((entry) => entry.key)).toEqual(["DF5"]);
    expect(lines[2].called).toEqual([]);
    expect(lines[2].others).toHaveLength(20);
  });

  it("never puts an injured player among those called", () => {
    const pool = candidates().map((entry) => (entry.key === "GK1" ? { ...entry, injured: true } : entry));
    const [goalkeepers] = callUpLines(pool, new Set(["GK1", "GK2"]));
    expect(goalkeepers.called.map((entry) => entry.key)).toEqual(["GK2"]);
    expect(goalkeepers.others.map((entry) => entry.key)).toContain("GK1");
  });
});

describe("what the list sends, and why it cannot yet", () => {
  it("sends the players called, in the candidates' order", () => {
    const pool = candidates();
    const keys = selectedKeys(pool, new Set(["FW1", "GK1", "unknown"]));
    expect(keys).toEqual(["GK1", "FW1"]);
  });

  it("asks for 23 players first", () => {
    const pool = candidates();
    expect(callUpIssue(pool, new Set(ASSISTANT.slice(0, 18)))).toEqual({ kind: "count", count: 18 });
    expect(callUpIssue(pool, new Set([...ASSISTANT, "FW5"]))).toEqual({ kind: "count", count: CALL_UP_SIZE + 1 });
  });

  it("then three goalkeepers", () => {
    const pool = candidates();
    const twoGoalkeepers = new Set([...ASSISTANT.filter((key) => key !== "GK3"), "FW5"]);
    expect(callUpIssue(pool, twoGoalkeepers)).toEqual({ kind: "goalkeepers", count: 2 });
    expect(goalkeepersOf(pool, twoGoalkeepers)).toBe(2);
    expect(callUpIssue(pool, new Set(ASSISTANT))).toBeNull();
  });

  it("does not count a player injured on the first date", () => {
    const pool = candidates().map((entry) => (entry.key === "MF1" ? { ...entry, injured: true } : entry));
    expect(callUpIssue(pool, new Set(ASSISTANT))).toEqual({ kind: "count", count: CALL_UP_SIZE - 1 });
    expect(selectedKeys(pool, new Set(ASSISTANT))).not.toContain("MF1");
  });
});
