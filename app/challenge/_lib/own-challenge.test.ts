import { describe, expect, it } from "vitest";
import type { ChallengeRankingRow } from "@/src/db/challenge-view";
import { ownChallenge } from "./own-challenge";

const line = (rank: number | null, points: number, isViewer = false): ChallengeRankingRow => ({
  rank,
  name: rank === null ? null : "Camille",
  title: null,
  points,
  goalDiff: 4,
  goalsFor: 12,
  isViewer,
});

const SAVE = "save-1";
const PLAYING = { saveId: SAVE, matchdaysPlayed: 7, submitted: false };
const SUBMITTED = { saveId: SAVE, matchdaysPlayed: 10, submitted: true };

describe("the card of the player's challenge", () => {
  it("offers the challenge to a player without an entry while the week has room", () => {
    expect(ownChallenge({ own: null, full: false, ranking: [] })).toEqual({ kind: "open" });
  });

  it("says the week is full to a player without an entry", () => {
    expect(ownChallenge({ own: null, full: true, ranking: [] })).toEqual({ kind: "full" });
  });

  it("takes the player back to their save at any matchday, a full week or not, without a score", () => {
    const expected = { kind: "playing", saveId: SAVE, played: 7 };
    // Someone else's score is no provisional one.
    expect(ownChallenge({ own: PLAYING, full: false, ranking: [line(1, 19)] })).toEqual(expected);
    expect(ownChallenge({ own: PLAYING, full: true, ranking: [] })).toEqual(expected);
  });

  it("reads the score and the rank in the player's line of the ranking", () => {
    const ranking = [line(1, 19), line(2, 16), line(3, 14, true), line(4, 14)];
    expect(ownChallenge({ own: SUBMITTED, full: false, ranking })).toEqual({
      kind: "submitted",
      saveId: SAVE,
      played: 10,
      score: { points: 14, rank: 3 },
    });
  });

  it("gives an anonymous player's score no rank: their line is outside the ranking", () => {
    const ranking = [line(1, 19), line(null, 14, true), line(2, 12)];
    expect(ownChallenge({ own: SUBMITTED, full: false, ranking })).toMatchObject({ kind: "submitted", score: { points: 14, rank: null } });
  });

  it("has no score without a line of the player", () => {
    expect(ownChallenge({ own: SUBMITTED, full: false, ranking: [line(1, 19)] })).toMatchObject({ kind: "submitted", score: null });
  });

  it("never gives a second go to a player who deleted their save, submitted or not", () => {
    for (const own of [PLAYING, SUBMITTED]) {
      expect(ownChallenge({ own: { ...own, saveId: null }, full: false, ranking: [] })).toEqual({ kind: "played" });
    }
  });
});
