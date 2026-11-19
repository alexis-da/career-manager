import { COACH_STAGES, exceededStage, type CoachStage } from "@/src/engine/national-coach";
import type { NationCode } from "@/src/engine/nations";
import {
  FINAL_ROUND,
  FRIENDLY,
  OLD_CONTINENT_CUP,
  QUALIFIER_EUROPE,
  QUALIFIER_WORLD,
  SEMI_FINAL_ROUND,
  type TournamentCode,
} from "@/src/engine/tournaments";
import { INTL_LOCALES, type Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDayMonth } from "@/src/lib/format";

// How the national coach's screens name things (docs/design/selections.md § 5, 9.3, 9.6): a nation in a sentence, a
// tournament, a national match's stage, a federation's objective and what goes past it, the days of a break. Server code:
// the screens that use them give their client parts the words, never the engine.

/** How a sentence takes a nation: « du Portugal » after « la fédération » (of), « le Portugal » as a subject (the). */
export type NationForm = "of" | "the";

/** A nation in a sentence, its article as French wants it: « du Portugal », « des Pays-Bas », « l'Italie »; « the Netherlands ». */
export function nationIn(code: NationCode, form: NationForm, tCoach: Translator<"coachOffer">, tWorld: Translator<"world">): string {
  return tCoach(`forms.${form}`, { code, nation: tWorld(`nationalities.${code}`) });
}

/** Nations in a sentence, joined as the language joins them: « le Portugal et la Croatie », « Portugal and Croatia ». */
export function nationsIn(
  codes: readonly NationCode[],
  form: NationForm,
  tCoach: Translator<"coachOffer">,
  tWorld: Translator<"world">,
  locale: Locale,
): string {
  return new Intl.ListFormat(INTL_LOCALES[locale], { type: "conjunction" }).format(codes.map((code) => nationIn(code, form, tCoach, tWorld)));
}

/** A tournament's name, with its year when given: « Coupe des Hémisphères 2030 », « Old Continent Cup ». */
export function tournamentName(tournament: TournamentCode, year: number | null, tNations: Translator<"nations">): string {
  const name = tNations(tournament === OLD_CONTINENT_CUP ? "tournaments.eu" : "tournaments.world");
  return year === null ? name : tNations("tournamentYear", { name, year });
}

const GROUP_LETTERS = ["A", "B"] as const;

/**
 * What a national match is, as the Sélections tab names it: « Match amical », « Éliminatoires, 3e journée », « Groupe A,
 * 2e journée », « Demi-finale », « Finale ».
 */
export function nationalStage(match: { competition: string; round: number; pool: 0 | 1 | null }, tNations: Translator<"nations">): string {
  if (match.competition === FRIENDLY) {
    return tNations("stages.friendly");
  }
  if (match.competition === QUALIFIER_EUROPE || match.competition === QUALIFIER_WORLD) {
    return tNations("stages.qualifier", { round: match.round });
  }
  if (match.round === SEMI_FINAL_ROUND) {
    return tNations("stages.semiFinal");
  }
  if (match.round === FINAL_ROUND) {
    return tNations("stages.final");
  }
  return tNations("stages.group", { group: GROUP_LETTERS[match.pool ?? 0], round: match.round });
}

/** A stage of a federation's objective by its name in the messages; none is ever « not qualified ». */
type StageKey = "QUALIFIED" | "SEMI_FINAL" | "FINAL" | "WINNER";

const STAGE_KEYS: Readonly<Record<CoachStage, StageKey>> = {
  [COACH_STAGES.NOT_QUALIFIED]: "QUALIFIED",
  [COACH_STAGES.QUALIFIED]: "QUALIFIED",
  [COACH_STAGES.SEMI_FINAL]: "SEMI_FINAL",
  [COACH_STAGES.FINAL]: "FINAL",
  [COACH_STAGES.WINNER]: "WINNER",
};

/**
 * A federation's objective in a line: « Objectif : se qualifier pour la Coupe des Hémisphères 2030, puis atteindre les
 * demi-finales »; for a nation without a tournament this cycle (a World nation in an Old Continent cycle), « Pas de tournoi
 * pour le Maroc ce cycle : prépare le suivant ».
 */
export function objectiveLine(
  input: { code: NationCode; objective: CoachStage | null; tournament: TournamentCode | null; year: number | null },
  names: { tCoach: Translator<"coachOffer">; tNations: Translator<"nations">; tWorld: Translator<"world"> },
): string {
  const { tCoach, tNations, tWorld } = names;
  if (input.objective === null || input.tournament === null) {
    return tCoach("noObjective", { nation: nationIn(input.code, "the", tCoach, tWorld) });
  }
  return tCoach(`objective.${STAGE_KEYS[input.objective]}`, { tournament: tournamentName(input.tournament, input.year, tNations) });
}

/** What goes past a federation's objective, one stage further: « Dépassé : la finale ». null without an objective. */
export function exceededLine(objective: CoachStage | null, tCoach: Translator<"coachOffer">): string | null {
  return objective === null ? null : tCoach("exceeded", { stage: tCoach(`stages.${STAGE_KEYS[exceededStage(objective)]}`) });
}

/**
 * A break's or a tournament's first and last days, as « du {from} au {to} » takes them: « 4 » and « 8 sept. » within a
 * month, « 30 sept. » and « 4 oct. » across two; the French ordinal for the first, as formatDayMonth writes it.
 */
export function dayRange(first: Date, last: Date, locale: Locale): { from: string; to: string } {
  const sameMonth = first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth();
  const day = first.getUTCDate();
  return {
    from: sameMonth ? (locale === "fr" && day === 1 ? "1er" : String(day)) : formatDayMonth(first, locale),
    to: formatDayMonth(last, locale),
  };
}
