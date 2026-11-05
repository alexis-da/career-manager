import type { HalfTimePlayer, HalfTimeTeam } from "@/src/db/live-match";
import { MAX_SUBSTITUTION_WINDOWS, MAX_SUBSTITUTIONS } from "@/src/engine/balance";

// The managed club at a pause, for the tests of the live page: a 4-3-3 of the same midfielder, its bench empty unless told
// otherwise.

/**
 * A player at a pause: a midfielder rated 70, his outfield attributes at 70, at 80 of fitness, nothing done in the match,
 * unless told otherwise.
 */
export const halfTimePlayer = (id: string, overrides: Partial<HalfTimePlayer> = {}): HalfTimePlayer => ({
  id,
  position: "CM",
  overall: 70,
  injured: false,
  injuredUntil: null,
  form: 50,
  fitness: 80,
  fitnessFactor: 0.9,
  condition: 0.9,
  attributes: { pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70, goalkeeping: 20 },
  actions: { goals: 0, assists: 0, yellowCards: 0, redCards: 0 },
  firstName: "Léo",
  lastName: id,
  age: 25,
  ...overrides,
});

/** The eleven's keys, slot by slot. */
export const STARTERS: readonly string[] = Array.from({ length: 11 }, (_, index) => `s${index}`);

/** The club at half-time, nothing made yet, its players those of its slots and its bench. */
export function halfTimeTeam(overrides: Partial<HalfTimeTeam> = {}): HalfTimeTeam {
  const bench = overrides.bench ?? [];
  return {
    phase: "HALF_TIME",
    minute: 45,
    maxSubstitutions: MAX_SUBSTITUTIONS,
    substitutions: 0,
    windows: { used: 0, max: MAX_SUBSTITUTION_WINDOWS, open: true },
    manual: false,
    instruction: { current: "BALANCED", source: "START", assistant: "BALANCED", starting: "BALANCED" },
    formation: "4-3-3",
    starters: [...STARTERS],
    injured: [],
    sentOff: [],
    bench,
    booked: [],
    hurt: [],
    players: [...STARTERS, ...bench].map((id) => halfTimePlayer(id)),
    clubColors: { primary: "#000000", secondary: "#ffffff" },
    ...overrides,
  };
}
