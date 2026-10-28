import { describe, expect, it } from "vitest";
import {
  challengeSaveName,
  challengeSavesPurgedAt,
  challengeScore,
  drawChallengeClub,
  isChallengeClub,
  rankChallengeEntries,
  type ChallengeClubCandidate,
} from "./challenge";

const CLUBS: ChallengeClubCandidate[] = [
  { slug: "d1-champion", tier: 1, rank: 1 },
  { slug: "d1-eleventh", tier: 1, rank: 11 },
  { slug: "d1-twelfth", tier: 1, rank: 12 },
  { slug: "d1-eighteenth", tier: 1, rank: 18 },
  { slug: "d1-nineteenth", tier: 1, rank: 19 },
  { slug: "d2-champion", tier: 2, rank: 1 },
  { slug: "d2-last", tier: 2, rank: 24 },
];
const ELIGIBLE = ["d1-eighteenth", "d1-twelfth", "d2-champion", "d2-last"];
const seeds = Array.from({ length: 400 }, (_, index) => `seed-${index}`);

describe("the club of a challenge", () => {
  it("is any second division club, or a first division club ranked 12th to 18th", () => {
    expect(CLUBS.filter(isChallengeClub).map((club) => club.slug).sort()).toEqual(ELIGIBLE);
  });

  it("is drawn from the seed alone, whatever the order of the clubs", () => {
    const drawn = drawChallengeClub(CLUBS, null, "seed-a");

    expect(drawChallengeClub(CLUBS, null, "seed-a")).toBe(drawn);
    expect(drawChallengeClub([...CLUBS].reverse(), null, "seed-a")).toBe(drawn);
  });

  it("is never an ineligible club nor the previous week's, and every other one comes up", () => {
    const drawn = new Set(seeds.map((seed) => drawChallengeClub(CLUBS, "d2-champion", seed)));

    expect([...drawn].sort()).toEqual(ELIGIBLE.filter((slug) => slug !== "d2-champion"));
  });

  it("cannot be drawn without an eligible club", () => {
    expect(() => drawChallengeClub([{ slug: "d2-only", tier: 2, rank: 3 }], "d2-only", "seed-a")).toThrow(RangeError);
  });
});

describe("a challenge's saves", () => {
  it("all bear the week's name", () => {
    expect(challengeSaveName("2026-W45")).toBe("Défi — semaine 45");
    expect(challengeSaveName("2027-W05")).toBe("Défi — semaine 5");
  });

  it("are purged 24 hours after the challenge ends: on the Tuesday", () => {
    expect(challengeSavesPurgedAt(new Date("2026-11-09T00:00:00.000Z"))).toEqual(new Date("2026-11-10T00:00:00.000Z"));
  });
});

describe("the score of a challenge save", () => {
  it("adds up its club's league matches: three points a win, one a draw", () => {
    const score = challengeScore(
      [
        { round: 1, goalsFor: 2, goalsAgainst: 0 },
        { round: 2, goalsFor: 1, goalsAgainst: 1 },
        { round: 3, goalsFor: 0, goalsAgainst: 3 },
      ],
      10,
    );

    expect(score).toEqual({ matchdaysPlayed: 3, points: 4, goalDiff: -1, goalsFor: 3 });
  });

  it("only counts the first matchdays, up to the horizon", () => {
    const matches = Array.from({ length: 12 }, (_, index) => ({ round: index + 1, goalsFor: 1, goalsAgainst: 0 }));

    expect(challengeScore(matches, 10)).toEqual({ matchdaysPlayed: 10, points: 30, goalDiff: 10, goalsFor: 10 });
    expect(challengeScore([], 10)).toEqual({ matchdaysPlayed: 0, points: 0, goalDiff: 0, goalsFor: 0 });
  });

  it("refuses two matches of one matchday", () => {
    const match = { round: 4, goalsFor: 1, goalsAgainst: 0 };

    expect(() => challengeScore([match, match], 10)).toThrow(RangeError);
  });
});

describe("a challenge's ranking", () => {
  const entry = (id: string, points: number, goalDiff: number, goalsFor: number, submittedAt: string) => ({
    id,
    points,
    goalDiff,
    goalsFor,
    submittedAt: new Date(submittedAt),
  });

  it("orders by points, goal difference, goals scored, then the earlier submission, then the id", () => {
    const entries = [
      entry("late-twin", 17, 4, 12, "2026-11-03T10:00:00.000Z"),
      entry("more-goals", 17, 4, 13, "2026-11-05T10:00:00.000Z"),
      entry("better-diff", 17, 5, 9, "2026-11-06T10:00:00.000Z"),
      entry("more-points", 18, -2, 8, "2026-11-07T10:00:00.000Z"),
      entry("b-same-time", 17, 4, 12, "2026-11-02T10:00:00.000Z"),
      entry("a-same-time", 17, 4, 12, "2026-11-02T10:00:00.000Z"),
    ];

    const ranking = rankChallengeEntries(entries);

    expect(ranking.map(({ id, rank }) => `${rank} ${id}`)).toEqual([
      "1 more-points",
      "2 better-diff",
      "3 more-goals",
      "4 a-same-time",
      "5 b-same-time",
      "6 late-twin",
    ]);
    expect(entries[0]?.id).toBe("late-twin");
  });
});
