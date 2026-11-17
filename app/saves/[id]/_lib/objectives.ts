import type { ObjectiveView } from "@/src/db/objectives";
import { YOUTH_OBJECTIVE_MAX_AGE } from "@/src/engine/balance";
import type { ObjectiveOutcome, ObjectiveProgress, ObjectiveStatus } from "@/src/engine/objectives";
import type { Translator } from "@/src/i18n/translator";
import { formatMoney } from "@/src/lib/format";
import type { Locale } from "@/src/i18n/locale";

// How the screens name an objective of the season (gameplay v2, V3): what it asks, what exceeds it, the figure it is
// judged on, the tone of where it stands. Pure, shared by the season's start, the dashboard, the Club screen, the
// season's review and the creation form's cards (app/_components/suggestion-card.tsx), which announce the ranking
// objective a save's first season sets in the same words.

/** An objective as these helpers read it. */
type Named = Pick<ObjectiveView, "kind" | "variant" | "target" | "exceed">;

/** The cup rounds the objectives name: 2 (the round of 32) to 7 (the trophy). */
const roundKey = (round: number) => String(Math.min(7, Math.max(2, round))) as "2" | "3" | "4" | "5" | "6" | "7";

/** The European stages the objectives name: 2 (the play-offs) to 6 (the title). */
const europeStageKey = (stage: number) => String(Math.min(6, Math.max(2, stage))) as "2" | "3" | "4" | "5" | "6";

/** What an objective asks: « Finir 8e ou mieux », « Atteindre les quarts de finale »… */
export function objectiveGoal(objective: Named, t: Translator<"objectives">): string {
  switch (objective.kind) {
    case "RANKING":
      return objective.variant === "FINISH" || objective.variant === null
        ? t("goal.FINISH", { rank: objective.target })
        : t(`goal.${objective.variant}`);
    case "CUP":
      return t("goal.CUP", { round: t(`round.${roundKey(objective.target)}`) });
    case "EUROPE":
      return t("goal.EUROPE", { round: t(`europeRound.${europeStageKey(objective.target)}`) });
    case "YOUTH":
      return t("goal.YOUTH", { starts: objective.target, age: YOUTH_OBJECTIVE_MAX_AGE });
    case "ENTERTAINMENT":
      return t("goal.ENTERTAINMENT", { goals: objective.target });
    case "SOLIDITY":
      return t("goal.SOLIDITY", { goals: objective.target });
    case "FINANCES":
      return t("goal.FINANCES");
  }
}

/** What exceeds an objective (the ranking, the cup and the European competition), or null. */
export function objectiveExceed(objective: Named, t: Translator<"objectives">): string | null {
  if (objective.exceed === null) {
    return null;
  }
  if (objective.kind === "CUP") {
    return t("exceed.CUP", { round: t(`round.${roundKey(objective.exceed)}`) });
  }
  if (objective.kind === "EUROPE") {
    return t("exceed.EUROPE", { round: t(`europeRound.${europeStageKey(objective.exceed)}`) });
  }
  if (objective.kind !== "RANKING") {
    return null;
  }
  switch (objective.variant) {
    case "TOP":
      return t("exceed.TOP");
    case "PROMOTION":
      return t("exceed.PROMOTION");
    case "SURVIVAL":
      return t("exceed.SURVIVAL", { rank: objective.exceed });
    default:
      return t("exceed.FINISH", { rank: objective.exceed });
  }
}

/** Whether an objective's status is its outcome, decided: neither on track, nor at risk, nor too early to tell. */
export function isDecided(status: ObjectiveStatus): status is ObjectiveOutcome {
  return status === "ACHIEVED" || status === "EXCEEDED" || status === "MISSED";
}

/**
 * The figure an objective is judged on, in words: the place now (or at the end), the cup round or the European stage
 * reached (out or not), the most starts of a young player, the goals, the transfer balance. Null before anything is known. Shown while it is
 * too early to tell where the objective stands, too: the figure is no verdict.
 */
export function objectiveCurrent(
  objective: Pick<ObjectiveView, "kind" | "current" | "status">,
  t: Translator<"objectives">,
  locale: Locale,
): string | null {
  const { current } = objective;
  if (current === null) {
    return null;
  }
  const decided = isDecided(objective.status);
  switch (objective.kind) {
    case "RANKING":
      return t(decided ? "current.RANKING_FINAL" : "current.RANKING", { rank: current });
    case "CUP": {
      if (current < 1) {
        return null;
      }
      const round = t(`reached.${String(Math.min(7, current)) as "1" | "2" | "3" | "4" | "5" | "6" | "7"}`);
      return objective.status === "MISSED" ? t("current.CUP_OUT", { round }) : t("current.CUP", { round });
    }
    case "EUROPE": {
      if (current < 1) {
        return null;
      }
      const round = t(`europeReached.${String(Math.min(6, current)) as "1" | "2" | "3" | "4" | "5" | "6"}`);
      return objective.status === "MISSED" ? t("current.CUP_OUT", { round }) : t("current.CUP", { round });
    }
    case "YOUTH":
      return t("current.YOUTH", { starts: current });
    case "ENTERTAINMENT":
      return t("current.ENTERTAINMENT", { goals: current });
    case "SOLIDITY":
      return t("current.SOLIDITY", { goals: current });
    case "FINANCES":
      return t("current.FINANCES", { amount: formatMoney(current, locale) });
  }
}

/**
 * The colour of where an objective stands: the result colours of the screens, and the alerts' amber when at risk. Too
 * early to tell has none: no verdict, a neutral pill (ObjectiveStatusPill).
 */
export const STATUS_TONE: Readonly<Record<ObjectiveProgress, "win" | "warning" | "loss" | "info">> = {
  ON_TRACK: "info",
  AT_RISK: "warning",
  ACHIEVED: "win",
  EXCEEDED: "win",
  MISSED: "loss",
};

/** The president's confidence in three words' worth: 60 and more, 40 to 59, below 40. */
export function confidenceLevel(confidence: number): "high" | "middle" | "low" {
  return confidence >= 60 ? "high" : confidence >= 40 ? "middle" : "low";
}

/**
 * The president's confidence in words: while it is too early to judge the objectives (SeasonObjectivesView.early), why it
 * holds still (« Il te laisse le temps de démarrer »); its level's words otherwise (« Il attend des résultats »).
 */
export function confidenceWords(confidence: number, early: boolean, t: Translator<"objectives">): string {
  return early ? t("confidenceEarly") : t(`confidenceLevel.${confidenceLevel(confidence)}`);
}
