import type { CoachHistory, CoachSpellView } from "@/src/db/national-view";
import { COACH_STAGES, type CoachStage } from "@/src/engine/national-coach";
import type { NationCode } from "@/src/engine/nations";
import { HEMISPHERES_CUP, OLD_CONTINENT_CUP, type TournamentCode } from "@/src/engine/tournaments";
import { seasonLabel } from "@/src/engine/world";
import type { Translator } from "@/src/i18n/translator";

// The manager's career as a national coach, in the History and on the cards (docs/design/selections.md § 5.5, 9.9,
// 9.10): his missions, the summer tournaments of his nations under him, his titles. Pure: the screens' words.

/** The summer tournaments a national coach can win, in the trophy room's order. */
export const COACH_TOURNAMENTS: readonly TournamentCode[] = [OLD_CONTINENT_CUP, HEMISPHERES_CUP];

/** A tile of the trophy room for a summer tournament won as national coach: its years, the most recent first. */
export type CoachTrophyTile = { tournament: TournamentCode; years: number[]; toConquer: boolean };

/**
 * The trophy room's tiles of the national coach: both summer tournaments, each with the years he won it, « À
 * conquérir » while he has not; none for a manager who never coached a nation (null), from his first mission on.
 */
export function coachTrophyTiles(coach: Pick<CoachHistory, "titles"> | null): CoachTrophyTile[] {
  if (coach === null) {
    return [];
  }
  return COACH_TOURNAMENTS.map((tournament) => {
    const years = coach.titles
      .filter((title) => title.tournament === tournament)
      .map((title) => title.year)
      .sort((a, b) => b - a);
    return { tournament, years, toConquer: years.length === 0 };
  });
}

/** A summer tournament's name: « Coupe du Vieux Continent », « Coupe des Hémisphères ». */
export function tournamentName(tournament: TournamentCode, t: Translator<"nations">): string {
  return t(tournament === OLD_CONTINENT_CUP ? "tournaments.eu" : "tournaments.world");
}

/** A nation as its coach's title names it: « du Portugal », « de la France », « des Pays-Bas » (« of the Netherlands »). */
export function ofNation(code: NationCode, t: Translator<"seasons">, tWorld: Translator<"world">): string {
  return t("history.coach.ofNation", { code, nation: tWorld(`nationalities.${code}`) });
}

/** The stage a nation reached at a summer tournament: « phase de groupes », « demi-finale », « finale », « vainqueur ». */
export function coachStageLabel(stage: CoachStage, t: Translator<"seasons">): string {
  return t("history.coach.stage", { stage: String(stage) });
}

/** A mission's line in the History: its nation and seasons, then each tournament under him and how it ended. */
export type CoachSpellLine = { head: string; parts: { text: string; won: boolean }[] };

/**
 * « Sélectionneur du Portugal, 2027-28 → 2029-30 » (« depuis 2027-28 » in post), then each of its tournaments with
 * the stage reached (« Coupe du Vieux Continent 2028 : demi-finale », « vainqueur de la Coupe des Hémisphères 2030 »)
 * and how the mission ended (« fin de mission : pas qualifié », « fin de mission : objectif manqué », « démission »).
 */
export function coachSpellLine(
  spell: CoachSpellView,
  t: Translator<"seasons">,
  tWorld: Translator<"world">,
  tNations: Translator<"nations">,
): CoachSpellLine {
  const from = seasonLabel(spell.fromYear);
  const years =
    spell.toYear === null
      ? t("history.coach.since", { from })
      : spell.toYear === spell.fromYear
        ? from
        : t("history.coach.span", { from, to: seasonLabel(spell.toYear) });
  const runs = spell.tournaments.map((run) => {
    const name = tournamentName(run.tournament, tNations);
    return run.stage === COACH_STAGES.WINNER
      ? { text: t("history.coach.won", { name, year: run.year }), won: true }
      : { text: t("history.coach.run", { name, year: run.year, stage: coachStageLabel(run.stage, t) }), won: false };
  });
  return {
    head: t("history.coach.spell", { nation: ofNation(spell.code, t, tWorld), years }),
    parts: spell.outcome === null ? runs : [...runs, { text: t("history.coach.ended", { outcome: spell.outcome }), won: false }],
  };
}
