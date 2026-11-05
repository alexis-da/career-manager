import { describe, expect, it } from "vitest";
import type { ObjectiveView } from "@/src/db/objectives";
import { NEUTRAL_BUDGET_COEFFICIENT } from "@/src/engine/balance";
import { budgetCoefficient, type ObjectiveKind, type ObjectiveOutcome } from "@/src/engine/objectives";
import {
  coefficientTone,
  formatCoefficient,
  isOptionalObjective,
  objectiveChoiceState,
  objectiveContribution,
  objectivesBehind,
  signedContribution,
  signedMoney,
} from "./season-start";

const objective = (kind: ObjectiveKind, overrides: Partial<ObjectiveView> = {}): ObjectiveView => ({
  kind,
  imposed: kind === "RANKING" || kind === "CUP",
  chosen: false,
  byAssistant: false,
  variant: kind === "RANKING" ? "FINISH" : null,
  target: 5,
  exceed: kind === "RANKING" ? 2 : null,
  status: "ON_TRACK",
  current: null,
  ...overrides,
});

const RANKING = objective("RANKING");

describe("objectiveChoiceState", () => {
  it("opens the choice on the three proposals, the assistant taking Jeunesse when it is one", () => {
    const choice = objectiveChoiceState({
      objectives: [RANKING, objective("YOUTH"), objective("ENTERTAINMENT"), objective("FINANCES")],
      choiceOpen: true,
    });
    expect(choice.state).toBe("open");
    expect(choice.state === "open" && choice.proposals.map((proposal) => proposal.kind)).toEqual(["YOUTH", "ENTERTAINMENT", "FINANCES"]);
    expect(choice.state === "open" && choice.assistant).toBe("YOUTH");
  });

  it("gives the assistant the first proposal when Jeunesse is not one", () => {
    const choice = objectiveChoiceState({
      objectives: [RANKING, objective("CUP"), objective("ENTERTAINMENT"), objective("SOLIDITY"), objective("FINANCES")],
      choiceOpen: true,
    });
    expect(choice.state === "open" && choice.assistant).toBe("ENTERTAINMENT");
    expect(choice.state === "open" && choice.proposals).toHaveLength(3);
  });

  it("locks the objective chosen, by the player or by the assistant", () => {
    const solidity = objective("SOLIDITY", { chosen: true });
    expect(objectiveChoiceState({ objectives: [RANKING, solidity], choiceOpen: false })).toEqual({ state: "chosen", chosen: solidity });
    const youth = objective("YOUTH", { chosen: true, byAssistant: true });
    expect(objectiveChoiceState({ objectives: [RANKING, youth], choiceOpen: false })).toEqual({ state: "chosen", chosen: youth });
  });

  it("closes the choice of a season begun without one, its proposals shown as they are", () => {
    const choice = objectiveChoiceState({
      objectives: [RANKING, objective("YOUTH"), objective("SOLIDITY"), objective("FINANCES")],
      choiceOpen: false,
    });
    expect(choice.state).toBe("closed");
    expect(choice.state === "closed" && choice.proposals).toHaveLength(3);
    expect(objectiveChoiceState({ objectives: [RANKING], choiceOpen: true }).state).toBe("closed");
  });

  it("tells the optional objectives from the imposed ones", () => {
    expect((["RANKING", "CUP", "YOUTH", "ENTERTAINMENT", "SOLIDITY", "FINANCES"] as const).map(isOptionalObjective)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });
});

describe("objectiveContribution", () => {
  const OUTCOMES: readonly ObjectiveOutcome[] = ["EXCEEDED", "ACHIEVED", "MISSED"];

  it("adds up, with 100, to the coefficient of every season's outcomes: the bounds never cut it", () => {
    for (const ranking of OUTCOMES) {
      for (const chosen of OUTCOMES) {
        const withoutCup = NEUTRAL_BUDGET_COEFFICIENT + objectiveContribution("RANKING", ranking) + objectiveContribution("YOUTH", chosen);
        expect(withoutCup).toBe(budgetCoefficient({ ranking, chosen }));
        for (const cup of OUTCOMES) {
          expect(withoutCup + objectiveContribution("CUP", cup)).toBe(budgetCoefficient({ ranking, cup, chosen }));
        }
      }
    }
  });

  it("weighs the ranking, the cup and the chosen objective as the design does", () => {
    expect(objectiveContribution("RANKING", "EXCEEDED")).toBe(20);
    expect(objectiveContribution("RANKING", "MISSED")).toBe(-15);
    expect(objectiveContribution("CUP", "ACHIEVED")).toBe(5);
    expect(objectiveContribution("FINANCES", "ACHIEVED")).toBe(10);
    expect(objectiveContribution("SOLIDITY", "MISSED")).toBe(0);
  });
});

describe("the coefficient and the amounts", () => {
  it("says a bonus above 1, a malus below, nothing at 1", () => {
    expect([110, 85, 100].map(coefficientTone)).toEqual(["bonus", "malus", "neutral"]);
  });

  it("writes the coefficient and what each outcome added to it, signed, in both languages", () => {
    expect(formatCoefficient(110, "fr")).toBe("1,10");
    expect(formatCoefficient(85, "en")).toBe("0.85");
    expect(signedContribution(10, "fr")).toBe("+0,10");
    expect(signedContribution(-15, "en")).toBe("-0.15");
    expect(signedContribution(0, "fr")).toBe("0,00");
  });

  it("signs the objectives' amount", () => {
    expect(signedMoney(4_200_000, "fr")).toBe("+4,2 M€");
    expect(signedMoney(-6_300_000, "en")).toBe("-€6.3m");
  });
});

describe("objectivesBehind", () => {
  const closed: NonNullable<Parameters<typeof objectivesBehind>[1]> = {
    startYear: 2026,
    met: 1,
    total: 2,
    objectives: [
      { kind: "RANKING", variant: "FINISH", target: 5, exceed: 2, outcome: "ACHIEVED", byAssistant: false },
      { kind: "YOUTH", variant: null, target: 15, exceed: null, outcome: "MISSED", byAssistant: true },
    ],
  };

  it("gives the objectives of the season just before the dotation's", () => {
    expect(objectivesBehind({ startYear: 2027 }, closed)).toEqual(closed.objectives);
  });

  it("gives none without a dotation, without closed objectives, or for another season's", () => {
    expect(objectivesBehind(null, closed)).toEqual([]);
    expect(objectivesBehind({ startYear: 2027 }, null)).toEqual([]);
    expect(objectivesBehind({ startYear: 2028 }, closed)).toEqual([]);
  });
});
