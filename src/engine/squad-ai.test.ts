import { describe, expect, it } from "vitest";
import { makeRng, shuffle } from "../lib/rng";
import { MIN_GOALKEEPERS, SQUAD_SIZE_MAX, SQUAD_SIZE_MIN } from "./balance";
import { wageFor } from "./economy";
import type { Position } from "./generation";
import { planSquad, type RosterClub, type RosterPlayer, type SquadDecision } from "./squad-ai";

const RICH_CLUB: RosterClub = { id: "club", wageBudget: 500_000_000 };

function roster(prefix: string, counts: Partial<Record<Position, number>>, overall: number): RosterPlayer[] {
  return (Object.entries(counts) as [Position, number][]).flatMap(([position, count]) =>
    Array.from({ length: count }, (_, index) => player(`${prefix}-${position}-${index + 1}`, position, overall)),
  );
}

function player(id: string, position: Position, overall: number, overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  const age = overrides.age ?? 26;
  return {
    id,
    position,
    age,
    overall,
    potential: overall,
    wage: wageFor({ age, overall }),
    contractExpiring: false,
    ...overrides,
  };
}

/** The squad after applying the decisions: kept and renewed players, plus signings. */
function apply(squad: readonly RosterPlayer[], market: readonly RosterPlayer[], decisions: readonly SquadDecision[]) {
  const released = new Set(decisions.filter((d) => d.type === "release").map((d) => d.playerId));
  const signed = new Set(decisions.filter((d) => d.type === "sign").map((d) => d.playerId));
  const wages = new Map(decisions.flatMap((d) => (d.type === "release" ? [] : [[d.playerId, d.wage] as const])));
  const players = [
    ...squad.filter((member) => !released.has(member.id)),
    ...market.filter((candidate) => signed.has(candidate.id)),
  ];
  return {
    players,
    payroll: players.reduce((sum, member) => sum + (wages.get(member.id) ?? member.wage), 0),
    goalkeepers: players.filter((member) => member.position === "GK").length,
  };
}

const idsOf = (decisions: readonly SquadDecision[], type: SquadDecision["type"]) =>
  decisions.filter((decision) => decision.type === type).map((decision) => decision.playerId).sort();

describe("planSquad", () => {
  it("renews the expiring players worth keeping and releases the others", () => {
    const squad = [
      ...roster("regular", { GK: 2, DF: 7, MF: 7, FW: 4 }, 70),
      player("solid", "DF", 69, { contractExpiring: true }),
      player("weak", "MF", 58, { contractExpiring: true }),
      player("prospect", "FW", 55, { age: 20, potential: 74, contractExpiring: true }),
      player("veteran", "MF", 67, { age: 34, contractExpiring: true }),
    ];
    const market = roster("free", { MF: 3 }, 64);

    const decisions = planSquad(RICH_CLUB, squad, market, makeRng("renewals"));

    expect(idsOf(decisions, "renew")).toEqual(["prospect", "solid"]);
    expect(idsOf(decisions, "release")).toEqual(["veteran", "weak"]);
    for (const decision of decisions) {
      if (decision.type === "renew") {
        const renewed = squad.find((member) => member.id === decision.playerId);
        expect(decision.wage).toBeGreaterThanOrEqual(renewed?.wage ?? Infinity);
        expect(decision.years).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("keeps an expiring goalkeeper the free agent market cannot replace", () => {
    const squad = [
      ...roster("regular", { DF: 8, MF: 8, FW: 5 }, 70),
      player("first-keeper", "GK", 72),
      player("backup-keeper", "GK", 50, { contractExpiring: true }),
    ];

    const decisions = planSquad(RICH_CLUB, squad, roster("free", { DF: 2 }, 60), makeRng("keeper"));

    expect(idsOf(decisions, "renew")).toEqual(["backup-keeper"]);
    expect(idsOf(decisions, "release")).toEqual([]);
  });

  it("signs free agents up to 20–25 players with 2 goalkeepers, within the wage budget", () => {
    const squad = roster("regular", { DF: 6, MF: 6, FW: 3 }, 68);
    const market = [
      ...roster("free-a", { GK: 3, DF: 4, MF: 4, FW: 3 }, 66),
      ...roster("free-b", { GK: 1, DF: 3, MF: 3, FW: 3 }, 58),
    ];
    const club = { id: "club", wageBudget: 60_000_000 };

    const decisions = planSquad(club, squad, market, makeRng("signings"));
    const after = apply(squad, market, decisions);

    expect(after.players.length).toBeGreaterThanOrEqual(SQUAD_SIZE_MIN);
    expect(after.players.length).toBeLessThanOrEqual(SQUAD_SIZE_MAX);
    expect(after.goalkeepers).toBeGreaterThanOrEqual(MIN_GOALKEEPERS);
    expect(after.payroll).toBeLessThanOrEqual(club.wageBudget);
    for (const decision of decisions.filter((d) => d.type === "sign")) {
      const signed = market.find((candidate) => candidate.id === decision.playerId);
      expect(decision.wage).toBe(signed === undefined ? -1 : wageFor(signed));
    }
  });

  it("signs nobody when the squad is full, however good the free agents", () => {
    // A squad at save creation: the 23 world players and 2 young players.
    const squad = roster("regular", { GK: 2, DF: 9, MF: 9, FW: 5 }, 60);
    const market = roster("free", { GK: 3, DF: 5, MF: 5, FW: 5 }, 70);

    const decisions = planSquad(RICH_CLUB, squad, market, makeRng("full-squad"));

    expect(squad).toHaveLength(SQUAD_SIZE_MAX);
    expect(idsOf(decisions, "sign")).toEqual([]);
    expect(apply(squad, market, decisions).players).toHaveLength(SQUAD_SIZE_MAX);
  });

  it("signs nobody once the wage budget is used up", () => {
    const squad = roster("regular", { GK: 1, DF: 6, MF: 6, FW: 3 }, 68);
    const payroll = squad.reduce((sum, member) => sum + member.wage, 0);

    const decisions = planSquad({ id: "club", wageBudget: payroll }, squad, roster("free", { GK: 2, DF: 3 }, 60), makeRng("broke"));

    expect(idsOf(decisions, "sign")).toEqual([]);
  });

  it("releases the weakest players under contract above 25, keeping 2 goalkeepers", () => {
    const squad = [
      ...roster("regular", { GK: 2, DF: 9, MF: 9, FW: 5 }, 70),
      player("weakest-df", "DF", 55),
      player("weakest-mf", "MF", 56),
    ];

    const decisions = planSquad(RICH_CLUB, squad, [], makeRng("surplus"));
    const after = apply(squad, [], decisions);

    expect(idsOf(decisions, "release")).toEqual(["weakest-df", "weakest-mf"]);
    expect(after.players).toHaveLength(SQUAD_SIZE_MAX);
    expect(after.goalkeepers).toBe(2);
  });

  it("is deterministic and does not depend on the order of the players", () => {
    const squad = [
      ...roster("regular", { GK: 1, DF: 6, MF: 7, FW: 4 }, 67),
      player("expiring-1", "DF", 66, { contractExpiring: true }),
      player("expiring-2", "FW", 52, { age: 31, contractExpiring: true }),
    ];
    const market = roster("free", { GK: 2, DF: 3, MF: 2, FW: 2 }, 63);
    const plan = (seed: string, order: string) =>
      planSquad(RICH_CLUB, shuffle(makeRng(order), squad), shuffle(makeRng(`${order}-market`), market), makeRng(seed));

    expect(plan("same", "order-a")).toEqual(plan("same", "order-b"));
    expect(plan("same", "order-a").length).toBeGreaterThan(0);
  });

  it("signs a missing goalkeeper even with a full squad, then releases an outfield player", () => {
    const squad = [
      player("keeper", "GK", 70),
      player("expiring-keeper", "GK", 52, { contractExpiring: true }),
      ...roster("regular", { DF: 9, MF: 9, FW: 5 }, 70),
      player("weakest-fw", "FW", 55),
    ];
    const market = roster("free", { GK: 1 }, 68);

    const decisions = planSquad(RICH_CLUB, squad, market, makeRng("full-squad-keeper"));
    const after = apply(squad, market, decisions);

    expect(idsOf(decisions, "sign")).toEqual(["free-GK-1"]);
    expect(idsOf(decisions, "release")).toEqual(["expiring-keeper", "weakest-fw"]);
    expect(after.goalkeepers).toBe(MIN_GOALKEEPERS);
    expect(after.players).toHaveLength(SQUAD_SIZE_MAX);
  });
});
