import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import { PLAYER_REPUTATION_MARGIN, SQUAD_ROLES, SQUAD_SIZE_MIN } from "./balance";
import { contractYears, marketValueFor, renewalWage, signingBonus, wageFor } from "./economy";
import { formationPositions } from "./formations";
import { squadTemplate, type Position } from "./positions";
import { countByRole, squadStandard, type RosterPlayer } from "./squad-ai";
import {
  assistantSignings,
  contractForecasts,
  contractOutcomes,
  decideContracts,
  importantPlayers,
  type ContractOutcome,
  type ManagedRosterPlayer,
} from "./assistant-contracts";

function player(id: string, position: Position, overall: number, overrides: Partial<ManagedRosterPlayer> = {}): ManagedRosterPlayer {
  const age = overrides.age ?? 26;
  return {
    id,
    position,
    age,
    overall,
    potential: overall,
    wage: wageFor({ age, overall }),
    contractExpiring: false,
    choice: null,
    ...overrides,
  };
}

/** A whole squad of the world's template (23 players, 2 goalkeepers), each rated `overall`, under a running contract. */
const squadOf = (prefix: string, overall: number): ManagedRosterPlayer[] =>
  squadTemplate(23).map((position, index) => player(`${prefix}-${index + 1}`, position, overall));

/** Free agents enough in every role to replace anyone, or none at all. */
const PLENTY = SQUAD_ROLES.map(() => 5);
const NONE = SQUAD_ROLES.map(() => 0);

/** A squad of 70s (its standard: 70) and five contracts ending on 30 June, each a case of the AI clubs' rule. */
const EXPIRING = [
  player("evergreen", "CM", 70, { age: 34, contractExpiring: true }), // past 32, at the standard: kept
  player("veteran", "CM", 69, { age: 33, contractExpiring: true }), // past 32, under it: gone
  player("solid", "CB", 66, { contractExpiring: true }), // within 5 of it: kept
  player("weak", "CB", 60, { contractExpiring: true }), // further: gone
  player("prospect", "ST", 55, { age: 20, potential: 75, contractExpiring: true }), // young, his potential at it: kept
];
const SQUAD = [...squadOf("regular", 70), ...EXPIRING];

const outcomesOf = (squad: readonly ManagedRosterPlayer[], byRole: readonly number[], byAssistant: boolean) =>
  Object.fromEntries(contractOutcomes(squad, byRole, byAssistant));

describe("contractOutcomes", () => {
  it("renews the useful players and lets the others go, as an AI club does, the contracts running untouched", () => {
    expect(squadStandard(SQUAD)).toBe(70);
    expect(outcomesOf(SQUAD, PLENTY, true)).toEqual({
      evergreen: { intention: "renew", by: "assistant" },
      veteran: { intention: "leave", by: "assistant" },
      solid: { intention: "renew", by: "assistant" },
      weak: { intention: "leave", by: "assistant" },
      prospect: { intention: "renew", by: "assistant" },
    });
    // In the order of their value: the best first.
    expect([...contractOutcomes(SQUAD, PLENTY, true).keys()]).toEqual(["evergreen", "veteran", "solid", "weak", "prospect"]);
  });

  it("keeps a player whose role the free agents could not fill, the best first, never one his player let go", () => {
    const outfield = squadOf("regular", 70).filter((member) => member.position !== "GK");
    const goalkeepers = [
      player("keeper", "GK", 70),
      player("second", "GK", 60, { contractExpiring: true }),
      player("third", "GK", 58, { contractExpiring: true }),
    ];
    const squad = [...outfield, ...goalkeepers];
    const keepers = (byRole: readonly number[], byAssistant = true, choices: Record<string, "RENEW" | "LEAVE"> = {}) => {
      const outcomes = contractOutcomes(
        squad.map((member) => ({ ...member, choice: choices[member.id] ?? null })),
        byRole,
        byAssistant,
      );
      return { second: outcomes.get("second"), third: outcomes.get("third") };
    };
    const goalkeeperRole = countByRole([{ position: "GK" }]).indexOf(1);
    const oneKeeperFree = NONE.map((count, role) => (role === goalkeeperRole ? 1 : count));

    // Two goalkeepers needed, one staying, no free agent: the better of the two is kept.
    expect(keepers(NONE)).toEqual({ second: { intention: "renew", by: "assistant" }, third: { intention: "leave", by: "assistant" } });
    // A free goalkeeper to sign: both go.
    expect(keepers(oneKeeperFree)).toEqual({ second: { intention: "leave", by: "assistant" }, third: { intention: "leave", by: "assistant" } });
    // His player let the better one go: the other is kept in his place.
    expect(keepers(NONE, true, { second: "LEAVE" })).toEqual({
      second: { intention: "leave", by: "player" },
      third: { intention: "renew", by: "assistant" },
    });
    // While his player keeps the contracts, nobody is kept for him.
    expect(keepers(NONE, false)).toEqual({ second: { intention: "leave", by: "default" }, third: { intention: "leave", by: "default" } });
  });

  it("applies the player's own choice first, in either mode, and lets the others go while he keeps the contracts", () => {
    const squad = [
      ...SQUAD,
      player("star", "CM", 78, { contractExpiring: true, choice: "LEAVE" }),
      player("favourite", "CB", 52, { age: 35, contractExpiring: true, choice: "RENEW" }),
    ];
    const assisted = outcomesOf(squad, PLENTY, true);
    expect(assisted.star).toEqual({ intention: "leave", by: "player" });
    expect(assisted.favourite).toEqual({ intention: "renew", by: "player" });
    expect(assisted.solid).toEqual({ intention: "renew", by: "assistant" });

    const own = outcomesOf(squad, PLENTY, false);
    expect(own).toEqual({
      evergreen: { intention: "leave", by: "default" },
      veteran: { intention: "leave", by: "default" },
      solid: { intention: "leave", by: "default" },
      weak: { intention: "leave", by: "default" },
      prospect: { intention: "leave", by: "default" },
      star: { intention: "leave", by: "player" },
      favourite: { intention: "renew", by: "player" },
    } satisfies Record<string, ContractOutcome>);
  });
});

describe("contractForecasts", () => {
  it("tells what the assistant would do without the player's own choice, and nothing of it while the player keeps the contracts", () => {
    const squad = [
      ...SQUAD.map((member) => (member.id === "solid" ? { ...member, choice: "LEAVE" as const } : member)),
      player("favourite", "CB", 52, { age: 35, contractExpiring: true, choice: "RENEW" }),
    ];
    const assisted = contractForecasts(squad, PLENTY, true);
    expect(assisted.get("solid")).toEqual({ outcome: { intention: "leave", by: "player" }, assistant: "renew" });
    expect(assisted.get("favourite")).toEqual({ outcome: { intention: "renew", by: "player" }, assistant: "leave" });
    expect(assisted.get("weak")).toEqual({ outcome: { intention: "leave", by: "assistant" }, assistant: "leave" });
    expect(assisted.get("prospect")).toEqual({ outcome: { intention: "renew", by: "assistant" }, assistant: "renew" });
    expect(assisted.has("regular-1")).toBe(false);

    const own = contractForecasts(squad, PLENTY, false);
    expect(own.get("solid")).toEqual({ outcome: { intention: "leave", by: "player" }, assistant: null });
    expect(own.get("weak")).toEqual({ outcome: { intention: "leave", by: "default" }, assistant: null });
    expect(own.get("favourite")).toEqual({ outcome: { intention: "renew", by: "player" }, assistant: null });
  });
});

describe("decideContracts", () => {
  it("renews at the AI clubs' wage for a length drawn from the club's stream, the best first, and draws nothing for a departure", () => {
    const decisions = decideContracts(SQUAD, PLENTY, true, makeRng("contracts"));
    const rng = makeRng("contracts");
    const byId = new Map(SQUAD.map((member) => [member.id, member]));
    const renewal = (id: string) => {
      const member = byId.get(id) ?? player(id, "CM", 0);
      return { type: "renew", playerId: id, years: contractYears(member.age, rng), wage: renewalWage(member), by: "assistant" };
    };

    // The draws in the decisions' order: the evergreen (70), the solid (66), then the prospect (55).
    const evergreen = renewal("evergreen");
    const solid = renewal("solid");
    const prospect = renewal("prospect");
    expect(decisions).toEqual([
      evergreen,
      { type: "leave", playerId: "veteran", by: "assistant" },
      solid,
      { type: "leave", playerId: "weak", by: "assistant" },
      prospect,
    ]);
    // Past 33, two seasons at most; 1 to 5 otherwise.
    expect(evergreen.years).toBeLessThanOrEqual(2);
    for (const { years } of [evergreen, solid, prospect]) {
      expect(years).toBeGreaterThanOrEqual(1);
      expect(years).toBeLessThanOrEqual(5);
    }
    // The same stream, the same decisions.
    expect(decideContracts(SQUAD, PLENTY, true, makeRng("contracts"))).toEqual(decisions);
  });

  it("lets every contract go free while the player keeps them, but for his own choice to renew", () => {
    const squad = SQUAD.map((member) => (member.id === "weak" ? { ...member, choice: "RENEW" as const } : member));
    const decisions = decideContracts(squad, PLENTY, false, makeRng("own"));
    expect(decisions.filter((decision) => decision.type === "renew").map(({ playerId, by }) => ({ playerId, by }))).toEqual([
      { playerId: "weak", by: "player" },
    ]);
    expect(decisions.filter((decision) => decision.type === "leave").map(({ by }) => by)).toEqual(["default", "default", "default", "default"]);
  });
});

// « Lancer les jeunes » (docs/design/effectif-adjoint.md § 2.2): the same squad of 70s, its standard 70, and contracts ending
// on 30 June around the policy's two bars: a prospect's potential at the standard minus 3, and 30 to 32-year-olds kept
// from the standard minus 2 instead of 5.
describe("the contracts under « Lancer les jeunes »", () => {
  const CASES = [
    player("hopeful", "ST", 58, { age: 23, potential: 67, contractExpiring: true }), // 23, potential at the standard − 3
    player("short", "ST", 58, { age: 23, potential: 66, contractExpiring: true }), // one point below
    player("late", "ST", 58, { age: 24, potential: 75, contractExpiring: true }), // past the prospects' age
    player("thirty", "CM", 67, { age: 30, contractExpiring: true }), // 3 below the standard: kept until the policy
    player("ready", "CM", 68, { age: 32, contractExpiring: true }), // the standard − 2: kept either way
    player("young-ish", "CB", 66, { age: 29, contractExpiring: true }), // under 30: the standard − 5, as before
    player("old", "CB", 69, { age: 33, contractExpiring: true }), // past 32: the standard itself, as before
  ];
  const squad = [...squadOf("regular", 70), ...CASES];
  const intentions = (policy?: "BEST" | "YOUTH", byRole: readonly number[] = PLENTY) =>
    Object.fromEntries([...contractOutcomes(squad, byRole, true, policy)].map(([id, outcome]) => [id, outcome.intention]));

  it("renews the prospects whose potential reaches the standard minus 3, and asks 30 to 32-year-olds the standard minus 2", () => {
    expect(squadStandard(squad)).toBe(70);
    expect(intentions("YOUTH")).toEqual({
      hopeful: "renew",
      short: "leave",
      late: "leave",
      thirty: "leave",
      ready: "renew",
      "young-ish": "renew",
      old: "leave",
    });
    // « Meilleur onze », the default, as before the policies: the prospect's bar the standard, the margin 5 until 32.
    expect(intentions("BEST")).toEqual({
      hopeful: "leave",
      short: "leave",
      late: "leave",
      thirty: "renew",
      ready: "renew",
      "young-ish": "renew",
      old: "leave",
    });
    expect(intentions()).toEqual(intentions("BEST"));
  });

  it("still keeps a player let go whose role the free agents could not fill, and his player's own choice first", () => {
    // Without its regular midfielders nor a free one, the thirty-year-old is kept, as an AI club keeps a player its role needs.
    const midfield = countByRole([{ position: "CM" }]).indexOf(1);
    const noMidfielder = PLENTY.map((count, role) => (role === midfield ? 0 : count));
    const thin = squad.filter((member) => !(member.position === "CM" && member.id.startsWith("regular")));
    expect(squadStandard(thin)).toBe(70);
    expect(contractOutcomes(thin, noMidfielder, true, "YOUTH").get("thirty")).toEqual({ intention: "renew", by: "assistant" });
    expect(contractOutcomes(thin, PLENTY, true, "YOUTH").get("thirty")).toEqual({ intention: "leave", by: "assistant" });

    const chosen = squad.map((member) => (member.id === "hopeful" ? { ...member, choice: "LEAVE" as const } : member));
    expect(contractOutcomes(chosen, PLENTY, true, "YOUTH").get("hopeful")).toEqual({ intention: "leave", by: "player" });
    // Nothing of it while the player keeps the contracts.
    expect(contractOutcomes(squad, PLENTY, false, "YOUTH").get("hopeful")).toEqual({ intention: "leave", by: "default" });
  });

  it("tells it ahead as the turn decides it, with the same draws", () => {
    const forecasts = contractForecasts(squad, PLENTY, true, "YOUTH");
    expect(forecasts.get("hopeful")).toEqual({ outcome: { intention: "renew", by: "assistant" }, assistant: "renew" });
    expect(forecasts.get("thirty")).toEqual({ outcome: { intention: "leave", by: "assistant" }, assistant: "leave" });
    // His player's choice, and what the assistant would do without it, the policy's way.
    const chosen = squad.map((member) => (member.id === "thirty" ? { ...member, choice: "RENEW" as const } : member));
    expect(contractForecasts(chosen, PLENTY, true, "YOUTH").get("thirty")).toEqual({
      outcome: { intention: "renew", by: "player" },
      assistant: "leave",
    });

    const decisions = decideContracts(squad, PLENTY, true, makeRng("policy"), "YOUTH");
    expect(decisions.map((decision) => [decision.playerId, decision.type])).toEqual(
      [...contractOutcomes(squad, PLENTY, true, "YOUTH")].map(([id, outcome]) => [id, outcome.intention]),
    );
    expect(decideContracts(squad, PLENTY, true, makeRng("policy"))).toEqual(decideContracts(squad, PLENTY, true, makeRng("policy"), "BEST"));
  });
});

describe("assistantSignings", () => {
  const RICH = { budget: 500_000_000, reputation: 99 };
  const free = (id: string, position: Position, overall: number, age = 27): RosterPlayer => ({
    id,
    position,
    age,
    overall,
    potential: overall,
    wage: 0,
    contractExpiring: false,
  });
  const MARKET: RosterPlayer[] = [
    free("free-gk-1", "GK", 66),
    free("free-gk-2", "GK", 62),
    ...squadTemplate(23)
      .filter((position) => position !== "GK")
      .map((position, index) => free(`free-${position}-${index}`, position, 60 + (index % 5))),
  ];
  const bonusOf = (candidate: RosterPlayer): number => signingBonus(marketValueFor(candidate));

  it("signs nobody while the squad has twenty players and two goalkeepers, without a draw", () => {
    const rng = makeRng("floor");
    expect(assistantSignings(RICH, squadOf("full", 70), MARKET, rng)).toEqual([]);
    expect(rng()).toBe(makeRng("floor")());
    const twenty = squadOf("twenty", 70).filter((_, index) => index < SQUAD_SIZE_MIN);
    expect(twenty.filter((member) => member.position === "GK")).toHaveLength(2);
    expect(assistantSignings(RICH, twenty, MARKET, makeRng("floor"))).toEqual([]);
  });

  it("signs the goalkeeper missing, the best who would join, even in a squad of twenty or more", () => {
    const squad = squadOf("one-keeper", 70).filter((member, index) => member.position !== "GK" || index > 0);
    expect(squad.filter((member) => member.position === "GK")).toHaveLength(1);
    // A goalkeeper rated more than the margin above the club's reputation would refuse it: the next one signs.
    const club = { budget: 100_000_000, reputation: 66 - PLAYER_REPUTATION_MARGIN - 1 };
    const rng = makeRng("keeper");
    const signings = assistantSignings(club, squad, MARKET, rng);
    const expectedRng = makeRng("keeper");
    expect(signings).toEqual([
      {
        playerId: "free-gk-2",
        years: contractYears(27, expectedRng),
        wage: wageFor({ age: 27, overall: 62 }),
        bonus: bonusOf(free("free-gk-2", "GK", 62)),
      },
    ]);
  });

  it("fills a thin squad up to twenty, the roles missing first, each bonus out of the budget left", () => {
    const thin = squadOf("thin", 70).filter((member, index) => member.position === "GK" || index % 3 !== 0);
    expect(thin.length).toBeLessThan(SQUAD_SIZE_MIN);
    const signings = assistantSignings(RICH, thin, MARKET, makeRng("thin"));
    const byId = new Map(MARKET.map((candidate) => [candidate.id, candidate]));

    expect(thin.length + signings.length).toBe(SQUAD_SIZE_MIN);
    // No goalkeeper: the squad had its two.
    expect(signings.some(({ playerId }) => byId.get(playerId)?.position === "GK")).toBe(false);
    for (const signing of signings) {
      const candidate = byId.get(signing.playerId) ?? free("?", "CM", 0);
      expect(signing.bonus).toBe(bonusOf(candidate));
      expect(signing.wage).toBe(wageFor(candidate));
    }
    // The roles the squad missed come first: after them, its counts never short of the template's in a role it signed for.
    const after = countByRole([...thin, ...signings.map(({ playerId }) => byId.get(playerId) ?? free("?", "CM", 0))]);
    expect(after.reduce((sum, count) => sum + count, 0)).toBe(SQUAD_SIZE_MIN);
  });

  it("passes over a free agent whose bonus the budget left cannot pay, for a cheaper one", () => {
    const squad = squadOf("one-keeper", 70).filter((member, index) => member.position !== "GK" || index > 0);
    const cheap = free("cheap-keeper", "GK", 50, 31);
    const budget = bonusOf(cheap);
    expect(bonusOf(MARKET[0])).toBeGreaterThan(budget);
    expect(assistantSignings({ budget, reputation: 99 }, squad, [...MARKET, cheap], makeRng("cheap")).map(({ playerId }) => playerId)).toEqual([
      "cheap-keeper",
    ]);
    expect(assistantSignings({ budget: 0, reputation: 99 }, squad, MARKET, makeRng("broke"))).toEqual([]);
  });
});

describe("importantPlayers", () => {
  it("is the eleven the assistant would field in the club's formation, the whole squad available", () => {
    const formation = formationPositions("4-3-3");
    const squad = formation.flatMap((position, index) => [
      { id: `star-${index}`, position, overall: 80 },
      { id: `backup-${index}`, position, overall: 60 },
    ]);
    const important = importantPlayers(squad, formation);
    expect([...important].sort()).toEqual(formation.map((_, index) => `star-${index}`).sort());
    expect(importantPlayers([], formation).size).toBe(0);
  });
});
