import { describe, expect, it } from "vitest";
import { makeRng } from "../lib/rng";
import {
  assistantObjective,
  boardConfidence,
  budgetCoefficient,
  cupObjective,
  divisionOf,
  expectedSeasonGoals,
  leagueRankingObjective,
  OBJECTIVES_JUDGED_FROM_MATCH,
  objectiveOutcome,
  objectiveProgress,
  objectivesRngSeed,
  objectiveStatus,
  OPTIONAL_OBJECTIVES,
  optionalTarget,
  proposedObjectives,
  rankingObjective,
  rankingOutcome,
  reputationThird,
  seasonConfidence,
  tooEarlyToJudge,
  type SeasonProgress,
} from "./objectives";

const ENGLAND_1 = divisionOf("en.1", 1, 20, 2); // three relegated
const ENGLAND_2 = divisionOf("en.2", 2, 24, 2); // three promoted
const FRANCE_1 = divisionOf("fr.1", 1, 18, 2); // two relegated
const FRANCE_2 = divisionOf("fr.2", 2, 18, 2); // two promoted
const ENGLAND_ALONE = divisionOf("en.1", 1, 20, 1); // a worldVersion 1 save: one division, nobody goes down

describe("divisionOf", () => {
  it("gives a worldVersion 2 league its country's places going up or down, a worldVersion 1 league none", () => {
    expect(ENGLAND_1).toEqual({ clubCount: 20, tier: 1, promotionPlaces: 0, relegationPlaces: 3 });
    expect(FRANCE_2).toEqual({ clubCount: 18, tier: 2, promotionPlaces: 2, relegationPlaces: 0 });
    expect(ENGLAND_ALONE).toEqual({ clubCount: 20, tier: 1, promotionPlaces: 0, relegationPlaces: 0 });
  });
});

describe("rankingObjective", () => {
  it("asks the three best expected of a first division for the top three, the title exceeding it", () => {
    expect(rankingObjective(1, ENGLAND_1)).toEqual({ variant: "TOP", target: 3, exceed: 1 });
    expect(rankingObjective(3, FRANCE_1)).toEqual({ variant: "TOP", target: 3, exceed: 1 });
    expect(rankingObjective(2, ENGLAND_ALONE)).toEqual({ variant: "TOP", target: 3, exceed: 1 });
  });

  it("asks the four best expected of a second division to go up, its title exceeding it", () => {
    expect(rankingObjective(4, ENGLAND_2)).toEqual({ variant: "PROMOTION", target: 3, exceed: 1 });
    expect(rankingObjective(1, FRANCE_2)).toEqual({ variant: "PROMOTION", target: 2, exceed: 1 });
  });

  it("asks those expected in the relegation zone or just above it to stay up, three places above the zone exceeding it", () => {
    expect(rankingObjective(15, ENGLAND_1)).toEqual({ variant: "SURVIVAL", target: 17, exceed: 15 });
    expect(rankingObjective(20, ENGLAND_1)).toEqual({ variant: "SURVIVAL", target: 17, exceed: 15 });
    expect(rankingObjective(14, FRANCE_1)).toEqual({ variant: "SURVIVAL", target: 16, exceed: 14 });
  });

  it("asks the others to finish at their expected rank or better, three places better to exceed it, never the last place", () => {
    expect(rankingObjective(14, ENGLAND_1)).toEqual({ variant: "FINISH", target: 14, exceed: 11 });
    expect(rankingObjective(4, ENGLAND_1)).toEqual({ variant: "FINISH", target: 4, exceed: 1 });
    expect(rankingObjective(5, ENGLAND_2)).toEqual({ variant: "FINISH", target: 5, exceed: 2 });
    expect(rankingObjective(24, ENGLAND_2)).toEqual({ variant: "FINISH", target: 23, exceed: 20 });
    expect(rankingObjective(20, ENGLAND_ALONE)).toEqual({ variant: "FINISH", target: 19, exceed: 16 });
  });
});

describe("leagueRankingObjective", () => {
  it("is rankingObjective in the league's division, its country's places going up and down in a worldVersion 2 save", () => {
    expect(leagueRankingObjective({ code: "en.1", tier: 1, clubCount: 20 }, 11, 2)).toEqual(rankingObjective(11, ENGLAND_1));
    expect(leagueRankingObjective({ code: "en.2", tier: 2, clubCount: 24 }, 4, 2)).toEqual({ variant: "PROMOTION", target: 3, exceed: 1 });
    expect(leagueRankingObjective({ code: "fr.1", tier: 1, clubCount: 18 }, 16, 2)).toEqual(rankingObjective(16, FRANCE_1));
    expect(leagueRankingObjective({ code: "en.1", tier: 1, clubCount: 20 }, 20, 1)).toEqual(rankingObjective(20, ENGLAND_ALONE));
  });
});

describe("rankingOutcome", () => {
  it("exceeds at or above the exceeding rank, achieves at or above the target, misses below it", () => {
    const objective = { target: 8, exceed: 5 };

    expect(rankingOutcome(objective, 5)).toBe("EXCEEDED");
    expect(rankingOutcome(objective, 6)).toBe("ACHIEVED");
    expect(rankingOutcome(objective, 8)).toBe("ACHIEVED");
    expect(rankingOutcome(objective, 9)).toBe("MISSED");
  });
});

describe("budgetCoefficient", () => {
  it("adds each outcome's hundredths to 100", () => {
    expect(budgetCoefficient({})).toBe(100);
    expect(budgetCoefficient({ ranking: "EXCEEDED" })).toBe(120);
    expect(budgetCoefficient({ ranking: "ACHIEVED" })).toBe(110);
    expect(budgetCoefficient({ ranking: "MISSED" })).toBe(85);
    expect(budgetCoefficient({ ranking: "ACHIEVED", cup: "MISSED", chosen: "ACHIEVED" })).toBe(115);
  });

  it("stays within 70 and 140", () => {
    expect(budgetCoefficient({ ranking: "EXCEEDED", cup: "EXCEEDED", chosen: "ACHIEVED" })).toBe(140);
    expect(budgetCoefficient({ ranking: "MISSED", cup: "MISSED", chosen: "MISSED" })).toBe(80);
  });
});

describe("proposedObjectives and assistantObjective", () => {
  it("proposes three of the four, the same for the same seed, each left out in turn over the seeds", () => {
    const left = new Set<string>();
    for (let year = 2026; year < 2046; year++) {
      const proposed = proposedObjectives(makeRng(objectivesRngSeed("graine", year)));
      expect(proposed).toHaveLength(3);
      expect(proposed).toEqual(proposedObjectives(makeRng(objectivesRngSeed("graine", year))));
      left.add(OPTIONAL_OBJECTIVES.find((kind) => !proposed.includes(kind)) ?? "");
    }
    expect(left).toEqual(new Set(OPTIONAL_OBJECTIVES));
  });

  it("takes Jeunesse when it is proposed, otherwise the first proposed", () => {
    expect(assistantObjective(["YOUTH", "SOLIDITY", "FINANCES"])).toBe("YOUTH");
    expect(assistantObjective(["ENTERTAINMENT", "YOUTH", "FINANCES"])).toBe("YOUTH");
    expect(assistantObjective(["ENTERTAINMENT", "SOLIDITY", "FINANCES"])).toBe("ENTERTAINMENT");
  });
});

describe("cupObjective", () => {
  it("names the quarter-finals and the round of 16 for a first division's best two thirds, two more rounds to exceed", () => {
    expect(cupObjective(1, 1, 2)).toEqual({ target: 4, exceed: 6 });
    expect(cupObjective(1, 2, 2)).toEqual({ target: 3, exceed: 5 });
  });

  it("asks at least one round past the club's entry, so that the draw reaches none", () => {
    expect(cupObjective(1, 3, 2)).toEqual({ target: 3, exceed: 5 });
    expect(cupObjective(2, 1, 1)).toEqual({ target: 2, exceed: 4 });
    expect(cupObjective(2, 1, 2)).toEqual({ target: 3, exceed: 5 });
    expect(cupObjective(2, 3, 1)).toEqual({ target: 2, exceed: 4 });
  });

  it("splits a division in thirds by reputation rank", () => {
    expect([1, 6, 7, 12, 13, 18].map((rank) => reputationThird(rank, 18))).toEqual([1, 1, 2, 2, 3, 3]);
    expect([1, 6, 7, 14, 20].map((rank) => reputationThird(rank, 20))).toEqual([1, 1, 2, 3, 3]);
  });
});

describe("optionalTarget and expectedSeasonGoals", () => {
  it("expects more goals of a stronger team, and sets Spectacle above and Solidité below its expected goals", () => {
    const even = expectedSeasonGoals({ attack: 70, defense: 70 }, { attack: 70, defense: 70 }, 38);
    const strong = expectedSeasonGoals({ attack: 78, defense: 78 }, { attack: 70, defense: 70 }, 38);

    expect(even.scored).toBeCloseTo(even.conceded, 6);
    expect(strong.scored).toBeGreaterThan(even.scored);
    expect(strong.conceded).toBeLessThan(even.conceded);
    expect(optionalTarget("ENTERTAINMENT", { scored: 50, conceded: 40 })).toBe(55);
    expect(optionalTarget("SOLIDITY", { scored: 50, conceded: 40 })).toBe(36);
    expect(optionalTarget("YOUTH", even)).toBe(15);
    expect(optionalTarget("FINANCES", even)).toBe(0);
  });
});

describe("objectiveProgress", () => {
  const start: SeasonProgress = {
    played: 0,
    total: 38,
    rank: 10,
    cup: { reached: 2, out: false },
    youthStarts: 0,
    scored: 0,
    conceded: 0,
    balance: 0,
    over: false,
  };

  it("puts every objective on track before the first match", () => {
    for (const objective of [
      { kind: "RANKING", target: 6, exceed: 3 },
      { kind: "CUP", target: 4, exceed: 6 },
      { kind: "YOUTH", target: 15, exceed: null },
      { kind: "ENTERTAINMENT", target: 55, exceed: null },
      { kind: "SOLIDITY", target: 36, exceed: null },
      { kind: "FINANCES", target: 0, exceed: null },
    ] as const) {
      expect(objectiveProgress(objective, start)).toBe("ON_TRACK");
    }
  });

  it("reads the ranking against its target during the season, and its outcome at the end", () => {
    const ranking = { kind: "RANKING", target: 6, exceed: 3 } as const;
    expect(objectiveProgress(ranking, { ...start, played: 10, rank: 6 })).toBe("ON_TRACK");
    expect(objectiveProgress(ranking, { ...start, played: 10, rank: 7 })).toBe("AT_RISK");
    expect(objectiveOutcome(ranking, { ...start, played: 38, rank: 3 })).toBe("EXCEEDED");
    expect(objectiveOutcome(ranking, { ...start, played: 38, rank: 9 })).toBe("MISSED");
  });

  it("decides the cup as soon as the run ends or goes far enough", () => {
    const cup = { kind: "CUP", target: 4, exceed: 6 } as const;
    expect(objectiveProgress(cup, { ...start, cup: { reached: 3, out: false } })).toBe("ON_TRACK");
    expect(objectiveProgress(cup, { ...start, cup: { reached: 4, out: false } })).toBe("ACHIEVED");
    expect(objectiveProgress(cup, { ...start, cup: { reached: 3, out: true } })).toBe("MISSED");
    expect(objectiveProgress(cup, { ...start, cup: { reached: 6, out: false } })).toBe("EXCEEDED");
    expect(objectiveOutcome(cup, { ...start, cup: { reached: 5, out: true } })).toBe("ACHIEVED");
  });

  it("follows the pace of Jeunesse, Spectacle and Solidité, and decides them when nothing can change", () => {
    const youth = { kind: "YOUTH", target: 15, exceed: null } as const;
    expect(objectiveProgress(youth, { ...start, played: 19, youthStarts: 8 })).toBe("ON_TRACK");
    expect(objectiveProgress(youth, { ...start, played: 19, youthStarts: 6 })).toBe("AT_RISK");
    expect(objectiveProgress(youth, { ...start, played: 30, youthStarts: 6 })).toBe("MISSED");
    expect(objectiveProgress(youth, { ...start, played: 20, youthStarts: 15 })).toBe("ACHIEVED");

    const entertainment = { kind: "ENTERTAINMENT", target: 55, exceed: null } as const;
    expect(objectiveProgress(entertainment, { ...start, played: 19, scored: 28 })).toBe("ON_TRACK");
    expect(objectiveProgress(entertainment, { ...start, played: 19, scored: 20 })).toBe("AT_RISK");
    expect(objectiveProgress(entertainment, { ...start, played: 35, scored: 55 })).toBe("ACHIEVED");
    expect(objectiveOutcome(entertainment, { ...start, played: 38, scored: 54 })).toBe("MISSED");

    const solidity = { kind: "SOLIDITY", target: 36, exceed: null } as const;
    expect(objectiveProgress(solidity, { ...start, played: 19, conceded: 18 })).toBe("ON_TRACK");
    expect(objectiveProgress(solidity, { ...start, played: 19, conceded: 19 })).toBe("AT_RISK");
    expect(objectiveProgress(solidity, { ...start, played: 30, conceded: 37 })).toBe("MISSED");
    expect(objectiveOutcome(solidity, { ...start, played: 38, conceded: 36 })).toBe("ACHIEVED");
  });

  it("asks Bonne gestion for a balance of zero or more", () => {
    const finances = { kind: "FINANCES", target: 0, exceed: null } as const;
    expect(objectiveProgress(finances, { ...start, balance: -1 })).toBe("AT_RISK");
    expect(objectiveOutcome(finances, { ...start, balance: 0 })).toBe("ACHIEVED");
    expect(objectiveOutcome(finances, { ...start, balance: -2_000_000 })).toBe("MISSED");
  });
});

describe("boardConfidence", () => {
  it("rises and falls with the objectives, within 1–99", () => {
    expect(boardConfidence({ ranking: "ON_TRACK" })).toBe(55);
    expect(boardConfidence({ ranking: "ON_TRACK", cup: "ON_TRACK", chosen: "ON_TRACK" })).toBe(59);
    expect(boardConfidence({ ranking: "AT_RISK", cup: "MISSED", chosen: "AT_RISK" })).toBe(25);
    expect(boardConfidence({ ranking: "EXCEEDED", cup: "EXCEEDED", chosen: "ACHIEVED" })).toBe(99);
    expect(boardConfidence({ ranking: "MISSED", cup: "MISSED", chosen: "MISSED" })).toBe(5);
  });
});

describe("too early to judge", () => {
  /** A first-division season of 34 league matches, its cup on, the club's first match lost 0-3: 18th of 18. */
  const afterADefeat: SeasonProgress = {
    played: 1,
    total: 34,
    rank: 18,
    cup: { reached: 2, out: false },
    youthStarts: 0,
    scored: 0,
    conceded: 3,
    balance: 0,
    over: false,
  };

  it("judges the season's objectives from the club's fifth league match, or once the season is over", () => {
    expect(OBJECTIVES_JUDGED_FROM_MATCH).toBe(5);
    expect([0, 1, 4, 5, 6, 34].map((played) => tooEarlyToJudge({ played, over: false }))).toEqual([true, true, true, false, false, false]);
    expect(tooEarlyToJudge({ played: 3, over: true })).toBe(false);
  });

  it("shows an undecided objective too early to tell until then, and an outcome always", () => {
    expect(objectiveStatus("ON_TRACK", true)).toBe("TOO_EARLY");
    expect(objectiveStatus("AT_RISK", true)).toBe("TOO_EARLY");
    for (const outcome of ["EXCEEDED", "ACHIEVED", "MISSED"] as const) {
      expect(objectiveStatus(outcome, true)).toBe(outcome);
      expect(objectiveStatus(outcome, false)).toBe(outcome);
    }
    expect(objectiveStatus("ON_TRACK", false)).toBe("ON_TRACK");
    expect(objectiveStatus("AT_RISK", false)).toBe("AT_RISK");
  });

  it("judges nothing on a lost first match, but a cup run ended is missed", () => {
    const early = tooEarlyToJudge(afterADefeat);
    const ranking = { kind: "RANKING", target: 6, exceed: 3 } as const;
    const youth = { kind: "YOUTH", target: 15, exceed: null } as const;
    const cup = { kind: "CUP", target: 4, exceed: 6 } as const;

    // At risk on the rules' reading…
    expect(objectiveProgress(ranking, afterADefeat)).toBe("AT_RISK");
    expect(objectiveProgress(youth, afterADefeat)).toBe("AT_RISK");
    // …too early to tell on the screens.
    expect(objectiveStatus(objectiveProgress(ranking, afterADefeat), early)).toBe("TOO_EARLY");
    expect(objectiveStatus(objectiveProgress(youth, afterADefeat), early)).toBe("TOO_EARLY");
    expect(objectiveStatus(objectiveProgress(cup, { ...afterADefeat, cup: { reached: 2, out: true } }), early)).toBe("MISSED");
    // The fifth match judges them.
    const fifth = { ...afterADefeat, played: 5 };
    expect(objectiveStatus(objectiveProgress(ranking, fifth), tooEarlyToJudge(fifth))).toBe("AT_RISK");
  });

  it("holds the president's confidence the season opened with until then, the chosen objective counted on track", () => {
    // The audit's case: one defeat, the league and the chosen objective at risk, would make him worried (37).
    const standing = { ranking: "AT_RISK", cup: "ON_TRACK", chosen: "AT_RISK" } as const;
    expect(boardConfidence(standing)).toBe(37);
    expect(seasonConfidence(standing, true)).toBe(boardConfidence({ ranking: "ON_TRACK", cup: "ON_TRACK", chosen: "ON_TRACK" }));
    expect(seasonConfidence(standing, true)).toBe(59);
    // Decided or not, every objective counts on track: an early cup exit too.
    expect(seasonConfidence({ ranking: "AT_RISK", cup: "MISSED" }, true)).toBe(57);
    // Without a cup, before the choice: the season's opening value, then the chosen objective's points once chosen.
    expect(seasonConfidence({ ranking: "AT_RISK" }, true)).toBe(55);
    expect(seasonConfidence({ ranking: "AT_RISK", chosen: "AT_RISK" }, true)).toBe(57);
  });

  it("follows where the objectives stand from then on", () => {
    const standing = { ranking: "AT_RISK", cup: "MISSED", chosen: "AT_RISK" } as const;
    expect(seasonConfidence(standing, false)).toBe(boardConfidence(standing));
    expect(seasonConfidence({ ranking: "EXCEEDED", cup: "EXCEEDED", chosen: "ACHIEVED" }, false)).toBe(99);
  });
});
