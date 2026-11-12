import { describe, expect, it } from "vitest";
import { testTranslator } from "@/src/i18n/test-intl";
import { confidenceLevel, confidenceWords, isDecided, objectiveCurrent, objectiveExceed, objectiveGoal } from "./objectives";

const fr = testTranslator("fr", "objectives");
const en = testTranslator("en", "objectives");

describe("objectiveGoal and objectiveExceed", () => {
  it("names the ranking objective by its kind, and what exceeds it", () => {
    const finish = { kind: "RANKING", variant: "FINISH", target: 8, exceed: 5 } as const;
    const top = { kind: "RANKING", variant: "TOP", target: 3, exceed: 1 } as const;

    expect(objectiveGoal(finish, fr)).toBe("Finir 8e ou mieux");
    expect(objectiveGoal(finish, en)).toBe("Finish 8th or higher");
    expect(objectiveExceed(finish, fr)).toBe("Dépassé en finissant 5e ou mieux");
    expect(objectiveGoal(top, fr)).toBe("Finir dans le top 3");
    expect(objectiveExceed(top, en)).toBe("Exceeded with the title");
    expect(objectiveGoal({ kind: "RANKING", variant: "FINISH", target: 1, exceed: 1 }, fr)).toBe("Finir 1er ou mieux");
  });

  it("names the cup round to reach, and the optional objectives with their targets", () => {
    expect(objectiveGoal({ kind: "CUP", variant: null, target: 4, exceed: 6 }, fr)).toBe("Atteindre les quarts de finale");
    expect(objectiveExceed({ kind: "CUP", variant: null, target: 4, exceed: 6 }, en)).toBe("Exceeded by reaching the final");
    expect(objectiveGoal({ kind: "YOUTH", variant: null, target: 15, exceed: null }, fr)).toBe(
      "Titulariser 15 fois en championnat un joueur de 21 ans ou moins",
    );
    expect(objectiveGoal({ kind: "ENTERTAINMENT", variant: null, target: 55, exceed: null }, en)).toBe("Score at least 55 league goals");
    expect(objectiveExceed({ kind: "SOLIDITY", variant: null, target: 36, exceed: null }, fr)).toBeNull();
  });
});

describe("objectiveCurrent", () => {
  it("gives the figure an objective is judged on, in words", () => {
    expect(objectiveCurrent({ kind: "RANKING", current: 3, status: "ON_TRACK" }, fr, "fr")).toBe("3e actuellement");
    expect(objectiveCurrent({ kind: "RANKING", current: 2, status: "ACHIEVED" }, en, "en")).toBe("Finished 2nd");
    expect(objectiveCurrent({ kind: "CUP", current: 3, status: "MISSED" }, fr, "fr")).toBe("Éliminé : Huitièmes de finale");
    expect(objectiveCurrent({ kind: "CUP", current: 7, status: "EXCEEDED" }, en, "en")).toBe("Cup winners");
    expect(objectiveCurrent({ kind: "YOUTH", current: 1, status: "AT_RISK" }, fr, "fr")).toBe("1 titularisation au mieux");
    expect(objectiveCurrent({ kind: "RANKING", current: null, status: "ON_TRACK" }, fr, "fr")).toBeNull();
  });

  it("still gives the figure while it is too early to tell, as one of a season under way", () => {
    expect(objectiveCurrent({ kind: "RANKING", current: 18, status: "TOO_EARLY" }, fr, "fr")).toBe("18e actuellement");
    expect(objectiveCurrent({ kind: "RANKING", current: 18, status: "TOO_EARLY" }, en, "en")).toBe("18th now");
    expect(objectiveCurrent({ kind: "CUP", current: 2, status: "TOO_EARLY" }, fr, "fr")).toBe("Seizièmes de finale");
    expect(objectiveCurrent({ kind: "SOLIDITY", current: 3, status: "TOO_EARLY" }, fr, "fr")).toBe("3 buts encaissés");
  });
});

describe("isDecided", () => {
  it("knows an outcome from a status that is none yet", () => {
    expect((["EXCEEDED", "ACHIEVED", "MISSED", "ON_TRACK", "AT_RISK", "TOO_EARLY"] as const).map(isDecided)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("confidenceLevel", () => {
  it("splits the president's confidence in three", () => {
    expect([99, 60, 59, 40, 39, 1].map(confidenceLevel)).toEqual(["high", "high", "middle", "middle", "low", "low"]);
  });
});

describe("confidenceWords", () => {
  it("says the president's confidence by its level, or why it holds still while it is too early to judge", () => {
    expect(confidenceWords(57, false, fr)).toBe("Il attend des résultats");
    expect(confidenceWords(37, false, en)).toBe("Worried");
    expect(confidenceWords(59, true, fr)).toBe("Il te laisse le temps de démarrer");
    expect(confidenceWords(59, true, en)).toBe("Giving you time to settle in");
  });
});
