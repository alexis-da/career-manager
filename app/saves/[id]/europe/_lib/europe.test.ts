import { describe, expect, it } from "vitest";
import { europePrizes } from "@/src/engine/europe";
import { testTranslator } from "@/src/i18n/test-intl";
import {
  bracketRounds,
  europeNext,
  europeSteps,
  isUndecided,
  managedCompetition,
  managedStanding,
  nextMatchSentence,
  nextPrize,
  prizeSentence,
  rankTone,
  shownCompetition,
  sideLabel,
  standingSentence,
  standingStatus,
  type BracketRound,
  type BracketSide,
  type EuropeNext,
  type StepState,
} from "./europe";
import { competition, DATES, knockoutPhase, match, playoffs, table, team } from "./test-support";

const t = { fr: testTranslator("fr", "europe"), en: testTranslator("en", "europe") };

const sideText = (side: BracketSide): string =>
  side.kind === "club" ? side.club.name : side.kind === "winnerOf" ? `W(${side.clubs[0].name}/${side.clubs[1].name})` : "?";

const sides = (round: BracketRound | undefined): string[][] => (round?.ties ?? []).map((tie) => [sideText(tie.home), sideText(tie.away)]);

const states = (steps: { state: StepState }[] | null): StepState[] | null => steps?.map(({ state }) => state) ?? null;

describe("the competition shown", () => {
  const view = {
    competitions: [competition(table(null), false), competition(table(3, 15), false, [], "eu.2")],
    managedCode: "eu.2" as const,
  };

  it("is the one the address asks for, else the managed club's, else the year's first", () => {
    expect(shownCompetition(view, "eu.1").code).toBe("eu.1");
    expect(shownCompetition(view, undefined).code).toBe("eu.2");
    expect(shownCompetition(view, "en.1").code).toBe("eu.2");
    expect(shownCompetition({ ...view, managedCode: null }, undefined).code).toBe("eu.1");
  });

  it("knows the managed club's, none when it did not qualify", () => {
    expect(managedCompetition(view)?.code).toBe("eu.2");
    expect(managedCompetition({ ...view, managedCode: null })).toBeNull();
  });
});

describe("the league phase's table", () => {
  it("tones the first four blue, the next eight neutral, the others not at all", () => {
    expect([1, 4, 5, 12, 13, 20].map(rankTone)).toEqual(["direct", "direct", "playoff", "playoff", null, null]);
  });
});

describe("the managed club's standing", () => {
  it("is none without a competition, or in one it does not play", () => {
    expect(managedStanding(null)).toEqual({ kind: "none" });
    expect(managedStanding(competition(table(null), false))).toEqual({ kind: "none" });
    expect(europeSteps(null, { kind: "none" })).toBeNull();
  });

  it("gives its rank and points during the league phase", () => {
    const underWay = competition(table(7, 20, 3), false);
    expect(managedStanding(underWay)).toEqual({ kind: "league", rank: 7, points: 39, played: 3 });
    expect(states(europeSteps(underWay, managedStanding(underWay)))).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("sends the 5th to 12th to the play-offs, the first four straight to the quarter-finals, the others home", () => {
    const seventh = competition(table(7), true, playoffs(table(7)));
    expect(managedStanding(seventh)).toEqual({ kind: "through", stage: 2 });
    expect(states(europeSteps(seventh, managedStanding(seventh)))).toEqual(["passed", "current", "upcoming", "upcoming", "upcoming"]);

    const second = competition(table(2), true, playoffs(table(2)));
    expect(managedStanding(second)).toEqual({ kind: "through", stage: 3 });
    expect(states(europeSteps(second, managedStanding(second)))).toEqual(["passed", "exempt", "current", "upcoming", "upcoming"]);

    const fifteenth = competition(table(15), true, playoffs(table(15)));
    expect(managedStanding(fifteenth)).toEqual({ kind: "out", stage: 1, rank: 15 });
    expect(states(europeSteps(fifteenth, managedStanding(fifteenth)))).toEqual(["lost", "unreached", "unreached", "unreached", "unreached"]);
  });

  it("takes a club through a tie won before the next round is scheduled, and out of one lost", () => {
    // The managed club's play-off played, the others still to play: no quarter-final scheduled yet.
    const won = competition(table(7), true, playoffs(table(7), [5, 11, 7, 9]).filter((tie) => tie.home.isManaged));
    expect(managedStanding(won)).toEqual({ kind: "through", stage: 3 });

    const lost = competition(table(10), true, playoffs(table(10), [5, 11, 7, 9]));
    expect(managedStanding(lost)).toEqual({ kind: "out", stage: 2, rank: 10 });
    expect(states(europeSteps(lost, managedStanding(lost)))).toEqual(["passed", "lost", "unreached", "unreached", "unreached"]);
  });

  it("knows the winner, and the beaten finalist", () => {
    const winner = competition(table(2), true, knockoutPhase(table(2), 2));
    expect(managedStanding(winner)).toEqual({ kind: "won" });
    expect(states(europeSteps(winner, managedStanding(winner)))).toEqual(["passed", "exempt", "passed", "passed", "passed"]);

    const beaten = competition(table(2), true, knockoutPhase(table(2), 5));
    expect(managedStanding(beaten)).toEqual({ kind: "out", stage: 5, rank: 2 });
    expect(states(europeSteps(beaten, managedStanding(beaten)))).toEqual(["passed", "exempt", "passed", "passed", "lost"]);
  });

  it("badges the club still in, out or the winner", () => {
    expect(
      [
        { kind: "none" } as const,
        { kind: "league", rank: 3, points: 6, played: 2 } as const,
        { kind: "through", stage: 4 } as const,
        { kind: "out", stage: 3, rank: 4 } as const,
        { kind: "won" } as const,
      ].map((standing) => standingStatus(standing)),
    ).toEqual([null, "in", "in", "out", "won"]);
  });

  it("says where it stands in both languages", () => {
    expect(standingSentence({ kind: "league", rank: 7, points: 7, played: 3 }, 6, t.fr)).toBe("Phase de ligue : 7e, 7 pts");
    expect(standingSentence({ kind: "league", rank: 1, points: 1, played: 1 }, 6, t.fr)).toBe("Phase de ligue : 1er, 1 pt");
    expect(standingSentence({ kind: "league", rank: 2, points: 4, played: 2 }, 6, t.en)).toBe("League phase: 2nd, 4 pts");
    expect(standingSentence({ kind: "league", rank: 3, points: 0, played: 0 }, 4, t.fr)).toBe(
      "Phase de ligue : 4 matchs, les 4 premiers en quarts, du 5e au 12e en barrages",
    );
    expect(standingSentence({ kind: "through", stage: 3 }, 6, t.fr)).toBe("Qualifié pour les quarts");
    expect(standingSentence({ kind: "out", stage: 2, rank: 9 }, 6, t.fr)).toBe("Éliminé en barrages");
    expect(standingSentence({ kind: "out", stage: 1, rank: 15 }, 6, t.fr)).toBe("Éliminé en phase de ligue (15e)");
    expect(standingSentence({ kind: "out", stage: 5, rank: 3 }, 6, t.en)).toBe("Beaten in the final");
    expect(standingSentence({ kind: "won" }, 6, t.fr)).toBe("Vainqueur");
    expect(standingSentence({ kind: "none" }, 6, t.fr)).toBe("Pas qualifié cette saison : finis dans les 6 premiers ou gagne la coupe");
    expect(standingSentence({ kind: "none" }, 6, t.en)).toBe("Not qualified this season: finish in the top six or win the cup");
  });
});

describe("the knockout bracket", () => {
  it("has nothing but its rounds' dates before the end of the league phase, the final on neutral ground", () => {
    const rounds = bracketRounds(competition(table(2, 20, 3), false));
    expect(rounds.map(({ round, date, neutral }) => [round, date, neutral])).toEqual([
      [7, DATES[6], false],
      [8, DATES[7], false],
      [9, DATES[8], false],
      [10, DATES[9], true],
    ]);
    expect(rounds.every(isUndecided)).toBe(true);
  });

  it("is known from the end of the league phase: the play-offs scheduled, the first four waiting for their winners", () => {
    const rows = table(2);
    const [playoffRound, quarters, semis, final] = bracketRounds(competition(rows, true, playoffs(rows)));
    expect(sides(playoffRound)).toEqual([
      ["Club 5", "Club 12"],
      ["Club 6", "Club 11"],
      ["Club 7", "Club 10"],
      ["Club 8", "Club 9"],
    ]);
    expect(playoffRound.ties.every((tie) => tie.match !== null)).toBe(true);
    expect(sides(quarters)).toEqual([
      ["Club 1", "W(Club 8/Club 9)"],
      ["Club 2", "W(Club 7/Club 10)"],
      ["Club 3", "W(Club 6/Club 11)"],
      ["Club 4", "W(Club 5/Club 12)"],
    ]);
    // The first four at home, whoever wins the play-offs.
    expect(quarters.ties.map((tie) => [tie.venueKnown, tie.match])).toEqual(Array(4).fill([true, null]));
    expect([isUndecided(quarters), isUndecided(semis), isUndecided(final)]).toEqual([false, true, true]);
  });

  it("names the ties still to schedule by the clubs through, or the ties they come from", () => {
    const rows = table(2);
    const [, quarters, semis] = bracketRounds(competition(rows, true, playoffs(rows, [5, 11, 7, 9])));
    expect(sides(quarters)).toEqual([
      ["Club 1", "Club 9"],
      ["Club 2", "Club 7"],
      ["Club 3", "Club 11"],
      ["Club 4", "Club 5"],
    ]);
    // The 1st's side against the 4th's, the 2nd's against the 3rd's: either may turn out the better ranked.
    expect(sides(semis)).toEqual([
      ["W(Club 1/Club 9)", "W(Club 4/Club 5)"],
      ["W(Club 2/Club 7)", "W(Club 3/Club 11)"],
    ]);
    expect(semis.ties.map((tie) => tie.venueKnown)).toEqual([false, false]);
  });

  it("follows the results to the final, each scheduled match in its place", () => {
    const rows = table(2);
    const [, quarters, semis, final] = bracketRounds(competition(rows, true, knockoutPhase(rows)));
    expect(sides(quarters)).toEqual([
      ["Club 1", "Club 9"],
      ["Club 2", "Club 7"],
      ["Club 3", "Club 11"],
      ["Club 4", "Club 5"],
    ]);
    expect(sides(semis)).toEqual([
      ["Club 1", "Club 5"],
      ["Club 2", "Club 11"],
    ]);
    expect(sides(final)).toEqual([["Club 2", "Club 5"]]);
    expect(final.neutral).toBe(true);
    expect(final.ties[0].match?.id).toBe("m10-2-5");
  });

  it("shows a round's scheduled matches as they are should the bracket not hold them", () => {
    const rows = table(2);
    const [playoffRound] = bracketRounds(competition(rows, true, [match(rows, 7, 5, 9)]));
    expect(sides(playoffRound)).toEqual([["Club 5", "Club 9"]]);
  });

  it("names a side to come in both languages", () => {
    const rows = table(2);
    const winnerOf: BracketSide = { kind: "winnerOf", clubs: [team(rows[7]), team(rows[8])] };
    expect(sideLabel(winnerOf, t.fr)).toBe("Vainqueur Club 8 – Club 9");
    expect(sideLabel(winnerOf, t.en)).toBe("Winners of Club 8 v Club 9");
    expect(sideLabel({ kind: "unknown" }, t.fr)).toBe("À déterminer");
    expect(sideLabel({ kind: "club", club: team(rows[0]) }, t.en)).toBe("Club 1");
  });
});

describe("what comes next for the managed club", () => {
  it("is its next match not played, at home or away", () => {
    const rows = table(7, 20, 1);
    const matches = [match(rows, 1, 7, 3, 0), match(rows, 2, 12, 7)];
    expect(europeNext(competition(rows, false), matches)).toEqual({
      kind: "match",
      round: 2,
      date: DATES[1],
      opponent: { kind: "club", name: "Club 12" },
      venue: "away",
    });
  });

  it("is the table's end for a club whose league phase matches are played before the others'", () => {
    const rows = table(5, 15, 4);
    expect(europeNext(competition(rows, false, [], "eu.2"), [match(rows, 5, 5, 1, 0)])).toEqual({ kind: "tableEnd", date: DATES[5] });
  });

  it("is a quarter-final at home against a play-off's winner for the first four", () => {
    const rows = table(2);
    expect(europeNext(competition(rows, true, playoffs(rows)), [])).toEqual({
      kind: "match",
      round: 8,
      date: DATES[7],
      opponent: { kind: "winnerOf", home: "Club 7", away: "Club 10" },
      venue: "home",
    });
  });

  it("is the final on neutral ground, and nothing once the club is out or the winner", () => {
    const rows = table(2);
    const phase = knockoutPhase(rows);
    const managed = phase.filter((tie) => tie.home.isManaged || tie.away.isManaged);
    expect(europeNext(competition(rows, true, phase), managed)).toMatchObject({ kind: "match", round: 10, venue: "neutral" });
    expect(europeNext(competition(rows, true, knockoutPhase(rows, 2)), [])).toBeNull();
    expect(europeNext(competition(table(15), true, playoffs(table(15))), [])).toBeNull();
    expect(europeNext(null, [])).toBeNull();
  });

  it("says who and where in both languages", () => {
    type NextMatch = Extract<EuropeNext, { kind: "match" }>;
    const next = (opponent: NextMatch["opponent"], venue: NextMatch["venue"]): NextMatch => ({ kind: "match", round: 8, date: DATES[7], opponent, venue });
    const winnerOf = { kind: "winnerOf", home: "Club 7", away: "Club 10" } as const;
    expect(nextMatchSentence(next(winnerOf, "home"), t.fr)).toBe("vs le vainqueur de Club 7 – Club 10 · domicile");
    expect(nextMatchSentence(next(winnerOf, "home"), t.en)).toBe("vs the winners of Club 7 v Club 10 · home");
    expect(nextMatchSentence(next({ kind: "club", name: "Club 5" }, "neutral"), t.fr)).toBe("vs Club 5 · terrain neutre");
    expect(nextMatchSentence(next({ kind: "club", name: "Club 5" }, null), t.fr)).toBe("vs Club 5");
    expect(nextMatchSentence(next({ kind: "unknown" }, null), t.fr)).toBe("Adversaire à déterminer");
  });

  it("puts the next prize at stake: a win and the first four in the league phase, then the round to win", () => {
    const lauriers = europePrizes("eu.1");
    const fanions = europePrizes("eu.2");
    expect(nextPrize("eu.1", { kind: "league", rank: 7, points: 7, played: 3 })).toEqual({
      kind: "league",
      win: lauriers.leagueWin,
      topFour: lauriers.quarterFinalQualification,
    });
    expect(nextPrize("eu.2", { kind: "through", stage: 2 })).toEqual({ kind: "playoff", amount: fanions.quarterFinalQualification });
    expect(nextPrize("eu.1", { kind: "through", stage: 3 })).toEqual({ kind: "quarter", amount: lauriers.quarterFinalWin });
    expect(nextPrize("eu.1", { kind: "through", stage: 4 })).toEqual({ kind: "semi", amount: lauriers.semiFinalWin });
    expect(nextPrize("eu.1", { kind: "through", stage: 5 })).toEqual({ kind: "final", win: lauriers.finalWin, loss: lauriers.finalLoss });
    expect([
      nextPrize("eu.1", { kind: "out", stage: 3, rank: 2 }),
      nextPrize("eu.1", { kind: "won" }),
      nextPrize("eu.1", { kind: "none" }),
    ]).toEqual([null, null, null]);
  });

  it("says the prize in both languages", () => {
    expect(prizeSentence({ kind: "league", win: 600_000, topFour: 2_000_000 }, t.fr, "fr")).toBe(
      "Prime en jeu : 600 k€ par victoire, 2 M€ pour une place dans les 4 premiers",
    );
    expect(prizeSentence({ kind: "quarter", amount: 3_000_000 }, t.fr, "fr")).toBe("Prime en jeu : 3 M€ pour une victoire en quarts");
    expect(prizeSentence({ kind: "final", win: 8_000_000, loss: 4_000_000 }, t.en, "en")).toBe(
      "Prize at stake: €8m for the winners, €4m for the runners-up",
    );
  });
});
