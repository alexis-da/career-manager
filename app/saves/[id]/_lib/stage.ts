import type { DecidedBy } from "@/src/engine/match";
import type { Translator } from "@/src/i18n/translator";
import type { ResultKind } from "./results";

/** Where a match stands in its competition: a league matchday, or a cup round (1 preliminary … 6 final). */
export type Stage = { round: number; cup: boolean };

/** A cup's rounds, from the preliminary round to the final: each is named in the stage messages. */
const CUP_ROUNDS = [1, 2, 3, 4, 5, 6] as const;

type CupRound = (typeof CUP_ROUNDS)[number];

const isCupRound = (round: number): round is CupRound => (CUP_ROUNDS as readonly number[]).includes(round);

/** A cup round as a match is named: « Quarts », in « Coupe — Quarts ». */
export function cupRoundName(round: number, t: Translator<"stage">): string {
  return isCupRound(round) ? t(`rounds.${round}`) : t("otherRound", { round });
}

/** The round a club reached, as a sentence ends: « quarts de finale », in « Coupe : quarts de finale ». */
export function cupRoundReached(round: number, t: Translator<"stage">): string {
  return isCupRound(round) ? t(`reached.${round}`) : t("otherRoundReached", { round });
}

/** « Journée 12 », or « Coupe — 16es » for a cup tie: a cup round is never a matchday. */
export function stageLabel(stage: Stage, t: Translator<"stage">): string {
  return stage.cup ? t("cup", { round: cupRoundName(stage.round, t) }) : t("matchday", { round: stage.round });
}

/** A short form for a table column: « J12 », « Coupe — 16es ». */
export function stageShortLabel(stage: Stage, t: Translator<"stage">): string {
  return stage.cup ? stageLabel(stage, t) : t("matchdayShort", { round: stage.round });
}

/** How a played cup tie ended, beyond its score. */
export type Decision = {
  decidedBy?: DecidedBy | null; // null in the database, absent from the engine's result of a league match
  homePenalties?: number | null;
  awayPenalties?: number | null;
};

/** « a.p. » after extra time (a shoot-out included), null otherwise. */
export function extraTimeNote(decision: Decision, t: Translator<"score">): string | null {
  return decision.decidedBy === "EXTRA_TIME" || decision.decidedBy === "PENALTIES" ? t("extraTime") : null;
}

/** « 5-3 t.a.b. », home first, after a shoot-out; null otherwise. */
export function penaltiesNote(decision: Decision, t: Translator<"score">): string | null {
  return decision.decidedBy === "PENALTIES" && decision.homePenalties != null && decision.awayPenalties != null
    ? t("penalties", { home: decision.homePenalties, away: decision.awayPenalties })
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
  const penalties = match.decidedBy === "PENALTIES" && match.homePenalties != null && match.awayPenalties != null;
  const [home, away] = penalties ? [match.homePenalties ?? 0, match.awayPenalties ?? 0] : [match.homeGoals, match.awayGoals];
  const [scored, conceded] = atHome ? [home, away] : [away, home];
  return scored > conceded ? "W" : scored < conceded ? "L" : "D";
}
