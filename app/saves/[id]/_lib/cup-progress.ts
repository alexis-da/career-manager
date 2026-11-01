import type { CupBracket, CupTieView, ManagedCupRun } from "@/src/db/cup-view";

// Where the managed club stands in its cup, read from the bracket: its status, each round for it, and the one to come.

/** A cup's rounds, from the preliminary round to the final: each has its messages. */
export const CUP_ROUND_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

export type CupRoundNumber = (typeof CUP_ROUND_NUMBERS)[number];

export const isCupRoundNumber = (round: number): round is CupRoundNumber => (CUP_ROUND_NUMBERS as readonly number[]).includes(round);

export type CupStatus = ManagedCupRun["status"];

/**
 * A round for the managed club: won (passed), skipped (exempt), the next to play, drawn or not (current), lost, further
 * ahead (upcoming), or ahead of a club that went out before it (unreached).
 */
export type CupRoundState = "passed" | "exempt" | "current" | "lost" | "upcoming" | "unreached";

export type CupRoundProgress = { round: CupRoundNumber; state: CupRoundState };

/** The managed club's next round: its opponent and where it plays are known once the round is drawn. */
export type NextCupRound = {
  round: CupRoundNumber;
  date: Date;
  draw: { opponent: string; atHome: boolean } | null;
};

export type CupProgress = {
  status: CupStatus;
  rounds: CupRoundProgress[]; // all six, in order
  next: NextCupRound | null; // null once the club is out or the winner
};

/** Where a club exempt from the preliminary round comes in. */
const EXEMPT_ENTRY_ROUND = 2;

const isManagedTie = (tie: CupTieView): boolean => tie.home.isManaged || tie.away.isManaged;

/** Whether the managed club went through a played tie: by the club through, as a shoot-out leaves the score level. */
function managedWon(tie: CupTieView): boolean {
  const managed = tie.home.isManaged ? tie.home : tie.away;
  return tie.winnerClubSaveId === managed.clubSaveId;
}

/** The managed club's side of a drawn tie. */
function drawOf(tie: CupTieView): NonNullable<NextCupRound["draw"]> {
  return { opponent: tie.home.isManaged ? tie.away.name : tie.home.name, atHome: tie.home.isManaged };
}

function roundState(round: CupRoundNumber, tie: CupTieView | undefined, status: CupStatus, firstRound: number): CupRoundState {
  if (tie !== undefined) {
    return !tie.played ? "current" : managedWon(tie) ? "passed" : "lost";
  }
  if (round < firstRound) {
    return "exempt";
  }
  return status === "out" ? "unreached" : "upcoming";
}

/**
 * The managed club in its cup. Its next round is the current one, drawn or not: that is where it stands. Without a run
 * (managedRun null) the club is exempt from the preliminary round and waits for the round of 32's draw.
 */
export function cupProgress(bracket: CupBracket): CupProgress {
  const status = bracket.managedRun?.status ?? "in";
  const firstRound = bracket.managedRun?.firstRound ?? EXEMPT_ENTRY_ROUND;
  const steps = CUP_ROUND_NUMBERS.map((round, index) => {
    const { date, ties } = bracket.rounds[index];
    const tie = ties.find(isManagedTie);
    return { round, date, tie, state: roundState(round, tie, status, firstRound) };
  });
  const next = status === "in" ? steps.find(({ state }) => state === "current" || state === "upcoming") : undefined;
  return {
    status,
    rounds: steps.map(({ round, state }) => ({ round, state: round === next?.round ? "current" : state })),
    next: next === undefined ? null : { round: next.round, date: next.date, draw: next.tie === undefined ? null : drawOf(next.tie) },
  };
}
