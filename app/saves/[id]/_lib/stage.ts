import type { DecidedBy } from "@/src/engine/match";
import type { ResultKind } from "./results";

/** Where a match stands in its competition: a league matchday, or a cup round (1 preliminary … 6 final). */
export type Stage = { round: number; cup: boolean };

/** The rounds of a cup as a match is named: « Coupe — Quarts ». */
export const CUP_ROUND_NAMES: Readonly<Record<number, string>> = {
  1: "Tour préliminaire",
  2: "16es",
  3: "8es",
  4: "Quarts",
  5: "Demi-finale",
  6: "Finale",
};

/** The round a club reached, as a sentence ends: « Coupe : quarts de finale ». */
export const CUP_ROUND_REACHED: Readonly<Record<number, string>> = {
  1: "tour préliminaire",
  2: "16es de finale",
  3: "8es de finale",
  4: "quarts de finale",
  5: "demi-finale",
  6: "finale",
};

const cupRoundName = (round: number): string => CUP_ROUND_NAMES[round] ?? `Tour ${round}`;

/** « Journée 12 », or « Coupe — 16es » for a cup tie: a cup round is never a matchday. */
export function stageLabel(stage: Stage): string {
  return stage.cup ? `Coupe — ${cupRoundName(stage.round)}` : `Journée ${stage.round}`;
}

/** A short form for a table column: « J12 », « Coupe — 16es ». */
export function stageShortLabel(stage: Stage): string {
  return stage.cup ? stageLabel(stage) : `J${stage.round}`;
}

/** How a played cup tie ended, beyond its score. */
export type Decision = {
  decidedBy: DecidedBy | null;
  homePenalties: number | null;
  awayPenalties: number | null;
};

/** « a.p. » after extra time (a shoot-out included), null otherwise. */
export function extraTimeNote(decision: Decision): string | null {
  return decision.decidedBy === "EXTRA_TIME" || decision.decidedBy === "PENALTIES" ? "a.p." : null;
}

/** « 5-3 t.a.b. », home first, after a shoot-out; null otherwise. */
export function penaltiesNote(decision: Decision): string | null {
  return decision.decidedBy === "PENALTIES" && decision.homePenalties !== null && decision.awayPenalties !== null
    ? `${decision.homePenalties}-${decision.awayPenalties} t.a.b.`
    : null;
}

/**
 * Result of a played match for one of its clubs: by the score, or by the shoot-out when the score is level after
 * extra time. A league draw stays a draw.
 */
export function matchResultFor(
  match: Decision & { homeGoals: number; awayGoals: number },
  atHome: boolean,
): ResultKind {
  const penalties = match.decidedBy === "PENALTIES" && match.homePenalties !== null && match.awayPenalties !== null;
  const [home, away] = penalties ? [match.homePenalties ?? 0, match.awayPenalties ?? 0] : [match.homeGoals, match.awayGoals];
  const [scored, conceded] = atHome ? [home, away] : [away, home];
  return scored > conceded ? "W" : scored < conceded ? "L" : "D";
}
