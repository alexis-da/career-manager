import type { ClubDotation } from "@/src/db/club";
import type { ClosedObjectivesView, ObjectiveView, SeasonObjectivesView } from "@/src/db/objectives";
import { CHOSEN_COEFFICIENT, CUP_COEFFICIENT, EUROPE_COEFFICIENT, NEUTRAL_BUDGET_COEFFICIENT, RANKING_COEFFICIENT } from "@/src/engine/balance";
import {
  assistantObjective,
  OPTIONAL_OBJECTIVES,
  type ObjectiveKind,
  type ObjectiveOutcome,
  type OptionalObjective,
} from "@/src/engine/objectives";
import type { Locale } from "@/src/i18n/locale";
import { formatHundredths, formatMoney } from "@/src/lib/format";

// The season's start screen (gameplay v2, V2 and V3): how the board's dotation came out of last season's objectives, and
// where the choice of this season's optional objective stands. Pure.

/** Whether an objective is one of the four optional ones, three of which the board proposes each season. */
export function isOptionalObjective(kind: ObjectiveKind): kind is OptionalObjective {
  return OPTIONAL_OBJECTIVES.some((optional) => optional === kind);
}

/** An optional objective the board proposes for the season. */
export type ProposedObjective = ObjectiveView & { kind: OptionalObjective };

/**
 * Where the choice of the season's optional objective stands: open (none chosen, the club's first match of the season
 * still to come: the three proposals, the assistant's default among them, assistantObjective), chosen (by the player or
 * by the assistant at the first kick-off, never changed again), or closed (none chosen though the season has begun, which
 * the game never leaves a season in: the proposals shown as they are).
 */
export type ObjectiveChoiceState =
  | { state: "open"; proposals: ProposedObjective[]; assistant: OptionalObjective }
  | { state: "chosen"; chosen: ObjectiveView }
  | { state: "closed"; proposals: ProposedObjective[] };

export function objectiveChoiceState(view: Pick<SeasonObjectivesView, "objectives" | "choiceOpen">): ObjectiveChoiceState {
  const chosen = view.objectives.find((objective) => objective.chosen);
  if (chosen !== undefined) {
    return { state: "chosen", chosen };
  }
  const proposals = view.objectives.filter(
    (objective): objective is ProposedObjective => !objective.imposed && isOptionalObjective(objective.kind),
  );
  if (!view.choiceOpen || proposals.length === 0) {
    return { state: "closed", proposals };
  }
  return { state: "open", proposals, assistant: assistantObjective(proposals.map((proposal) => proposal.kind)) };
}

/**
 * What an objective's outcome added to the coefficient of the next dotation, in hundredths: the ranking's, the cup's, the
 * European one's or the chosen objective's (RANKING_COEFFICIENT, CUP_COEFFICIENT, EUROPE_COEFFICIENT, CHOSEN_COEFFICIENT).
 * Their sum and 100 make the coefficient, within BUDGET_COEFFICIENT_RANGE (75 to 150 before it, 70 to 140 after).
 */
export function objectiveContribution(kind: ObjectiveKind, outcome: ObjectiveOutcome): number {
  switch (kind) {
    case "RANKING":
      return RANKING_COEFFICIENT[outcome];
    case "CUP":
      return CUP_COEFFICIENT[outcome];
    case "EUROPE":
      return EUROPE_COEFFICIENT[outcome];
    default:
      return CHOSEN_COEFFICIENT[outcome];
  }
}

/** What a coefficient did to a dotation: a bonus above 100 hundredths, a malus below, nothing at 100. */
export function coefficientTone(coefficient: number): "bonus" | "malus" | "neutral" {
  if (coefficient === NEUTRAL_BUDGET_COEFFICIENT) {
    return "neutral";
  }
  return coefficient > NEUTRAL_BUDGET_COEFFICIENT ? "bonus" : "malus";
}

/** A coefficient from its hundredths: « 1,10 » (« 1.10 »). */
export const formatCoefficient = (hundredths: number, locale: Locale): string => formatHundredths(hundredths / 100, locale);

/** What an outcome added to a coefficient, signed: « +0,10 », « -0,15 », « 0,00 ». */
export const signedContribution = (hundredths: number, locale: Locale): string =>
  `${hundredths > 0 ? "+" : ""}${formatCoefficient(hundredths, locale)}`;

/** An amount added or taken away, with its sign: « +4,2 M€ », « -6,3 M€ » (« +€4.2m », « -€6.3m »). */
export const signedMoney = (euros: number, locale: Locale): string =>
  euros > 0 ? `+${formatMoney(euros, locale)}` : formatMoney(euros, locale);

/**
 * The objectives whose outcomes made a dotation's coefficient: those of the season just before it. None for the first
 * season of a save, nor for the first dotation of a save from before the objectives.
 */
export function objectivesBehind(
  dotation: Pick<ClubDotation, "startYear"> | null,
  closed: (ClosedObjectivesView & { startYear: number }) | null,
): ClosedObjectivesView["objectives"] {
  return dotation !== null && closed !== null && closed.startYear + 1 === dotation.startYear ? closed.objectives : [];
}
