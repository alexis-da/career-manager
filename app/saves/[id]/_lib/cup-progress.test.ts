import { describe, expect, it } from "vitest";
import type { TeamView } from "@/src/db/calendar";
import type { CupBracket, CupTieView, ManagedCupRun } from "@/src/db/cup-view";
import { CUP_ROUNDS } from "@/src/engine/balance";
import { cupDates } from "@/src/engine/cup";
import { CUP_ROUND_NUMBERS, cupProgress, isCupRoundNumber, type CupRoundState } from "./cup-progress";

const DATES = cupDates(2026);

const team = (name: string, isManaged = false): TeamView => ({
  clubSaveId: `id-${name}`,
  name,
  isManaged,
  colors: { primary: "#000000", secondary: "#ffffff" },
});

const MANAGED = team("Lyon", true);
const RIVAL = team("Toulouse");

type Played = { winner: TeamView; goals?: readonly [number, number] };

/** A tie of a round, not played without a result; a home win 1-0 or an away win 0-1 unless its goals are given. */
function tie(round: number, home: TeamView, away: TeamView, result?: Played): CupTieView {
  const goals = result?.goals ?? (result?.winner === home ? [1, 0] : [0, 1]);
  return {
    id: `tie-${round}-${home.name}-${away.name}`,
    round,
    cup: true,
    scheduledAt: DATES[round - 1],
    competitionCode: "fr.cup",
    home,
    away,
    played: result !== undefined,
    homeGoals: result === undefined ? null : goals[0],
    awayGoals: result === undefined ? null : goals[1],
    homeHalfTimeGoals: null,
    awayHalfTimeGoals: null,
    decidedBy: null,
    homePenalties: null,
    awayPenalties: null,
    winnerClubSaveId: result?.winner.clubSaveId ?? null,
  };
}

/** The bracket of a tie list: every round with its date, drawn or not. */
const bracket = (managedRun: ManagedCupRun | null, ties: readonly CupTieView[]): CupBracket => ({
  seasonId: "season",
  startYear: 2026,
  competitionCode: "fr.cup",
  rounds: DATES.map((date, index) => ({ round: index + 1, date, ties: ties.filter((one) => one.round === index + 1) })),
  winner: null,
  managedRun,
});

const states = (cup: CupBracket): CupRoundState[] => cupProgress(cup).rounds.map(({ state }) => state);

describe("cupProgress", () => {
  it("names the six rounds of the game's cups", () => {
    expect(CUP_ROUND_NUMBERS).toHaveLength(CUP_ROUNDS);
    expect([isCupRoundNumber(1), isCupRoundNumber(6), isCupRoundNumber(0), isCupRoundNumber(7)]).toEqual([true, true, false, false]);
  });

  it("waits for the draw of the round of 32 with a club exempt from the preliminary round", () => {
    const cup = bracket(null, [tie(1, RIVAL, team("Rodez"))]);
    expect(cupProgress(cup).status).toBe("in");
    expect(states(cup)).toEqual(["exempt", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(cupProgress(cup).next).toEqual({ round: 2, date: DATES[1], draw: null });
  });

  it("gives the opponent and the venue of a round drawn and not played, at home", () => {
    const cup = bracket({ firstRound: 2, lastRound: 2, status: "in" }, [tie(2, MANAGED, RIVAL)]);
    expect(states(cup)).toEqual(["exempt", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(cupProgress(cup).next).toEqual({ round: 2, date: DATES[1], draw: { opponent: "Toulouse", atHome: true } });
  });

  it("gives them away too, from the preliminary round", () => {
    const cup = bracket({ firstRound: 1, lastRound: 1, status: "in" }, [tie(1, RIVAL, MANAGED)]);
    expect(states(cup)).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(cupProgress(cup).next).toEqual({ round: 1, date: DATES[0], draw: { opponent: "Toulouse", atHome: false } });
  });

  it("finds the managed club's tie among the others of its round", () => {
    const cup = bracket({ firstRound: 2, lastRound: 2, status: "in" }, [tie(2, team("Nice"), team("Metz")), tie(2, RIVAL, MANAGED)]);
    expect(cupProgress(cup).next?.draw).toEqual({ opponent: "Toulouse", atHome: false });
  });

  it("moves on to the next round, still to draw, once a tie is won", () => {
    const cup = bracket({ firstRound: 1, lastRound: 1, status: "in" }, [tie(1, MANAGED, RIVAL, { winner: MANAGED })]);
    expect(states(cup)).toEqual(["passed", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(cupProgress(cup).next).toEqual({ round: 2, date: DATES[1], draw: null });
  });

  it("follows a run from an exemption to the current round", () => {
    const cup = bracket({ firstRound: 2, lastRound: 4, status: "in" }, [
      tie(2, MANAGED, RIVAL, { winner: MANAGED }),
      tie(3, RIVAL, MANAGED, { winner: MANAGED }),
      tie(4, RIVAL, MANAGED),
    ]);
    expect(states(cup)).toEqual(["exempt", "passed", "passed", "current", "upcoming", "upcoming"]);
    expect(cupProgress(cup).next).toEqual({ round: 4, date: DATES[3], draw: { opponent: "Toulouse", atHome: false } });
  });

  it("stops at the round lost, the rounds after it out of reach, with no next round", () => {
    const cup = bracket({ firstRound: 2, lastRound: 3, status: "out" }, [
      tie(2, MANAGED, RIVAL, { winner: MANAGED }),
      tie(3, MANAGED, RIVAL, { winner: RIVAL }),
    ]);
    expect(cupProgress(cup).status).toBe("out");
    expect(states(cup)).toEqual(["exempt", "passed", "lost", "unreached", "unreached", "unreached"]);
    expect(cupProgress(cup).next).toBeNull();
  });

  it("reads a tie by the club through, never by its score: a shoot-out leaves it level", () => {
    const lost = bracket({ firstRound: 2, lastRound: 2, status: "out" }, [tie(2, MANAGED, RIVAL, { winner: RIVAL, goals: [2, 2] })]);
    expect(states(lost)[1]).toBe("lost");
    const won = bracket({ firstRound: 2, lastRound: 2, status: "in" }, [tie(2, MANAGED, RIVAL, { winner: MANAGED, goals: [2, 2] })]);
    expect(states(won)[1]).toBe("passed");
  });

  it("marks every round passed for the winner, with no next round", () => {
    const cup = bracket(
      { firstRound: 1, lastRound: 6, status: "won" },
      CUP_ROUND_NUMBERS.map((round) => tie(round, RIVAL, MANAGED, { winner: MANAGED })),
    );
    expect(cupProgress(cup).status).toBe("won");
    expect(states(cup)).toEqual(["passed", "passed", "passed", "passed", "passed", "passed"]);
    expect(cupProgress(cup).next).toBeNull();
  });

  it("marks the final lost for a beaten finalist, with no next round", () => {
    const cup = bracket(
      { firstRound: 2, lastRound: 6, status: "out" },
      CUP_ROUND_NUMBERS.slice(1).map((round) => tie(round, MANAGED, RIVAL, { winner: round === CUP_ROUNDS ? RIVAL : MANAGED })),
    );
    expect(cupProgress(cup).status).toBe("out");
    expect(states(cup)).toEqual(["exempt", "passed", "passed", "passed", "passed", "lost"]);
    expect(cupProgress(cup).next).toBeNull();
  });
});
