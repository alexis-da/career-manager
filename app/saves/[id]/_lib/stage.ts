import { EUROPE_FINAL_ROUND, EUROPE_LEAGUE_ROUNDS } from "@/src/engine/europe";
import type { DecidedBy } from "@/src/engine/match";
import type { FINAL_ROUND, InternationalCompetition, SEMI_FINAL_ROUND } from "@/src/engine/tournaments";
import { europeKey } from "@/src/i18n/countries";
import type { Translator } from "@/src/i18n/translator";
import type { ResultKind } from "./results";

/**
 * Where a match stands in its competition: a league matchday, a cup round (1 preliminary … 6 final), or a European
 * round (1 to 6 the league phase, 7 play-offs … 10 final), told by its competition's code.
 */
export type Stage = { round: number; cup: boolean; competitionCode?: string };

/** The European rounds past the league phase, each named in the stage messages. */
const EUROPE_KNOCKOUT_ROUNDS = [7, 8, 9, 10] as const;

type EuropeKnockoutRound = (typeof EUROPE_KNOCKOUT_ROUNDS)[number];

const isEuropeKnockoutRound = (round: number): round is EuropeKnockoutRound =>
  (EUROPE_KNOCKOUT_ROUNDS as readonly number[]).includes(round);

/** A European round as a match is named: « 3e journée », « Barrages », « Finale ». */
export function europeRoundName(round: number, t: Translator<"stage">): string {
  if (round <= EUROPE_LEAGUE_ROUNDS) {
    return t("europeLeagueRound", { round });
  }
  return isEuropeKnockoutRound(round) ? t(`europeRounds.${round}`) : t("otherRound", { round });
}

/** A European competition's name in the stage messages: « Coupe des Lauriers ». */
export function europeCompetitionName(code: string, t: Translator<"stage">): string {
  const key = europeKey(code);
  return key === null ? code : t(`europeNames.${key}`);
}

/** The stage a club reached in a European competition (1 league phase … 5 final), as a sentence ends: « quarts de finale ». */
export function europeStageReached(stage: number, t: Translator<"stage">): string {
  const reached = [1, 2, 3, 4, 5] as const;
  const known = reached.find((candidate) => candidate === stage);
  return known === undefined ? t("otherRoundReached", { round: stage }) : t(`europeReached.${known}`);
}

/** Whether a stage is a European competition's. */
export function isEuropeStage(stage: Stage): boolean {
  return stage.competitionCode !== undefined && europeKey(stage.competitionCode) !== null;
}

/** Whether a match is played on neutral ground: a European final. */
export function isNeutralStage(stage: Stage): boolean {
  return isEuropeStage(stage) && stage.round === EUROPE_FINAL_ROUND;
}

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

/**
 * « Journée 12 », « Coupe — 16es » for a cup tie (a cup round is never a matchday), « Coupe des Lauriers — 3e journée »
 * or « Coupe des Fanions — Finale » for a European match.
 */
export function stageLabel(stage: Stage, t: Translator<"stage">): string {
  if (stage.competitionCode !== undefined && europeKey(stage.competitionCode) !== null) {
    return t("europe", { competition: europeCompetitionName(stage.competitionCode, t), round: europeRoundName(stage.round, t) });
  }
  return stage.cup ? t("cup", { round: cupRoundName(stage.round, t) }) : t("matchday", { round: stage.round });
}

/**
 * Whether a match's stage label names its competition, which the screens then leave out beside it: a cup tie's (« Coupe —
 * … ») and a European match's.
 */
export function stageNamesCompetition(stage: Stage): boolean {
  return stage.cup || isEuropeStage(stage);
}

/**
 * What each national teams' competition is, by its code: a friendly, a zone's qualifiers, or a summer tournament, by its
 * key in the messages. The engine's codes (src/engine/tournaments.ts), every one of them, which the type checks, without
 * its modules in the bundles of the client components that name stages.
 */
const INTERNATIONAL_KINDS: Readonly<Record<InternationalCompetition, "friendly" | "qualifier" | "eu" | "world">> = {
  "int.friendly": "friendly",
  "int.qual.eu": "qualifier",
  "int.qual.world": "qualifier",
  "int.eu": "eu",
  "int.world": "world",
};

const INTERNATIONAL = new Map(Object.entries(INTERNATIONAL_KINDS));

/** A summer tournament's knockout rounds, after its three group matchdays: the engine's, which the type checks. */
const INTERNATIONAL_SEMI_FINAL_ROUND: typeof SEMI_FINAL_ROUND = 4;
const INTERNATIONAL_FINAL_ROUND: typeof FINAL_ROUND = 5;

/** A summer tournament's two groups, by their pool. */
const GROUP_LETTERS = ["A", "B"] as const;

/** A national teams' match as its round is named: its competition, its round and, in a tournament's groups, its group if known. */
export type InternationalStage = { competitionCode: string; round: number; pool?: 0 | 1 | null };

/** Whether a stage is a national teams' competition's: a friendly, qualifiers, a summer tournament. */
export function isInternationalStage(stage: Pick<Stage, "competitionCode">): boolean {
  return stage.competitionCode !== undefined && INTERNATIONAL.has(stage.competitionCode);
}

/** A summer tournament's name, « Coupe des Hémisphères »; null for a friendly, qualifiers or any other competition. */
export function internationalTournamentName(code: string, t: Translator<"nations">): string | null {
  const kind = INTERNATIONAL.get(code);
  return kind === "eu" || kind === "world" ? t(`tournaments.${kind}`) : null;
}

/**
 * A national teams' match's round, as the Sélections tab names it: « Match amical », « Éliminatoires, 3e journée »,
 * « Groupe A, 2e journée », « Demi-finale », « Finale ». null when it cannot be named: a tournament's group matchday whose
 * group is not known, or a competition that is not a national teams' one.
 */
export function internationalRoundName(stage: InternationalStage, t: Translator<"nations">): string | null {
  const kind = INTERNATIONAL.get(stage.competitionCode);
  if (kind === undefined) {
    return null;
  }
  if (kind === "friendly") {
    return t("stages.friendly");
  }
  if (kind === "qualifier") {
    return t("stages.qualifier", { round: stage.round });
  }
  if (stage.round === INTERNATIONAL_SEMI_FINAL_ROUND) {
    return t("stages.semiFinal");
  }
  if (stage.round === INTERNATIONAL_FINAL_ROUND) {
    return t("stages.final");
  }
  return stage.pool === 0 || stage.pool === 1 ? t("stages.group", { group: GROUP_LETTERS[stage.pool], round: stage.round }) : null;
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
