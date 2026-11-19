import { makeRng, shuffle } from "../lib/rng";
import { NATION_CODES, nationByCode, type NationCode } from "./nations";
import {
  HEMISPHERES_CUP,
  OLD_CONTINENT_CUP,
  tournamentPlaces,
  zoneNations,
  type InternationalTableRow,
  type TournamentCode,
} from "./tournaments";

// The national coach (docs/design/selections.md § 5): a federation offers its post to the player at a season's
// transition, when his prestige reaches the threshold of its rank; he keeps his club; the federation sets him an objective
// for its cycle's tournament and ends his mission when he misses it. Pure: the save's seed draws the offers.

/** Offers from the federations, in the worldVersion 2 saves with nations, never in a challenge save. */
export const NATIONAL_COACH_ENABLED = true;

/** Prestige for each trophy of the last two seasons: a first division's title, a cup, a European competition. */
export const PRESTIGE_PER_TROPHY = 5;
/** Prestige for a second division's title or a promotion, once a season. */
export const PRESTIGE_PER_PROMOTION = 3;
/** The most the trophies of the last two seasons add. */
export const PRESTIGE_TROPHIES_MAX = 10;
/** Prestige for each tournament where he went past his federation's objective. */
export const PRESTIGE_PER_EXCEEDED_TOURNAMENT = 5;
/** The seasons whose trophies count. */
export const PRESTIGE_SEASONS = 2;

/** A completed season of the managed club, as its prestige reads it (SeasonResult). */
export type PrestigeSeason = {
  tier: number; // its league's: 1 or 2
  champion: boolean;
  cup: boolean; // a national cup won
  europe: boolean; // a European competition won
  promoted: boolean;
};

/**
 * The manager's prestige (§ 5.1): his club's reputation (1-99), + PRESTIGE_PER_TROPHY for each trophy of his last two
 * seasons (a first division's title, a cup, a European competition) and PRESTIGE_PER_PROMOTION for a second division's
 * title or a promotion, PRESTIGE_TROPHIES_MAX at most, + PRESTIGE_PER_EXCEEDED_TOURNAMENT for each tournament he went past
 * his objective in as a national coach.
 */
export function managerPrestige(input: { reputation: number; seasons: readonly PrestigeSeason[]; exceededTournaments: number }): number {
  const trophies = input.seasons.slice(0, PRESTIGE_SEASONS).reduce((sum, season) => {
    const won = [season.champion && season.tier === 1, season.cup, season.europe].filter(Boolean).length;
    const rise = (season.champion && season.tier !== 1) || season.promoted ? PRESTIGE_PER_PROMOTION : 0;
    return sum + won * PRESTIGE_PER_TROPHY + rise;
  }, 0);
  return input.reputation + Math.min(PRESTIGE_TROPHIES_MAX, trophies) + input.exceededTournaments * PRESTIGE_PER_EXCEEDED_TOURNAMENT;
}

/** The prestige a federation asks for, by its nation's rank of strength among the 14: 1st to 5th, 6th to 10th, 11th to 14th. */
export const OFFER_THRESHOLDS: readonly { lastRank: number; prestige: number }[] = [
  { lastRank: 5, prestige: 85 },
  { lastRank: 10, prestige: 75 },
  { lastRank: NATION_CODES.length, prestige: 65 },
];

export function offerThreshold(rank: number): number {
  const band = OFFER_THRESHOLDS.find((entry) => rank <= entry.lastRank);
  return band?.prestige ?? OFFER_THRESHOLDS[OFFER_THRESHOLDS.length - 1].prestige;
}

/** The ranks of the nations by strength (NationSave.strength): the strongest first, then by code. */
export function strengthRanks(strengths: ReadonlyMap<NationCode, number>, codes: readonly NationCode[] = NATION_CODES): Map<NationCode, number> {
  const ranked = [...codes].sort((a, b) => (strengths.get(b) ?? 0) - (strengths.get(a) ?? 0) || (a < b ? -1 : 1));
  return new Map(ranked.map((code, index) => [code, index + 1]));
}

/** Offers a transition makes at most. */
export const MAX_OFFERS = 2;

export function offersRngSeed(saveSeed: string, startYear: number): string {
  return `${saveSeed}:coach-offers:${startYear}`;
}

/**
 * The federations offering their post at the transition to the season starting in startYear (§ 5.1): those whose
 * threshold the manager's prestige reaches, the excluded left out (the one he has just left), MAX_OFFERS at most drawn by
 * the save's seed among them; strongest first. None while every strength is unknown (before the first cycle).
 */
export function nationalOffers(input: {
  prestige: number;
  strengths: ReadonlyMap<NationCode, number>;
  excluded: ReadonlySet<NationCode>;
  saveSeed: string;
  startYear: number;
}): NationCode[] {
  if (![...input.strengths.values()].some((strength) => strength > 0)) {
    return [];
  }
  const ranks = strengthRanks(input.strengths);
  const eligible = NATION_CODES.filter((code) => !input.excluded.has(code) && input.prestige >= offerThreshold(ranks.get(code) ?? NATION_CODES.length));
  const drawn = shuffle(makeRng(offersRngSeed(input.saveSeed, input.startYear)), eligible).slice(0, MAX_OFFERS);
  return drawn.sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0));
}

// ------------------------------------------------------------------ The federation's objective (§ 5.3)

/**
 * How far a nation went in a tournament: not qualified, out in the groups, beaten in the semi-finals, beaten in the final,
 * winner. An objective is a stage of this scale.
 */
export const COACH_STAGES = { NOT_QUALIFIED: 0, QUALIFIED: 1, SEMI_FINAL: 2, FINAL: 3, WINNER: 4 } as const;
export type CoachStage = (typeof COACH_STAGES)[keyof typeof COACH_STAGES];

/** The nations that aim at a cycle's tournament: Europe's for the Old Continent Cup, all 14 for the Hemispheres Cup. */
export function contenders(tournament: TournamentCode): NationCode[] {
  return tournament === OLD_CONTINENT_CUP ? zoneNations("EUROPE") : [...NATION_CODES];
}

/** Whether a nation aims at a cycle's tournament: a World nation has none in an Old Continent cycle. */
export function aimsAt(code: NationCode, tournament: TournamentCode): boolean {
  return tournament === HEMISPHERES_CUP || nationByCode(code).zone === "EUROPE";
}

/**
 * The federation's objective for a cycle's tournament, by the nation's rank of strength among the nations aiming at it,
 * in thirds (§ 5.3): the final for the first third, the semi-finals for the second, the qualification for the last; in an
 * Old Continent cycle, the nine of Europe (1st-3rd, 4th-6th, 7th-9th), in a Hemispheres cycle, the 14 (1st-4th, 5th-9th,
 * 10th-14th). null for a World nation in an Old Continent cycle: « Prépare le cycle suivant ».
 */
export function federationObjective(code: NationCode, tournament: TournamentCode, strengths: ReadonlyMap<NationCode, number>): CoachStage | null {
  if (!aimsAt(code, tournament)) {
    return null;
  }
  const field = contenders(tournament);
  const rank = strengthRanks(strengths, field).get(code) ?? field.length;
  const [first, second] = tournament === OLD_CONTINENT_CUP ? [3, 6] : [4, 9];
  return rank <= first ? COACH_STAGES.FINAL : rank <= second ? COACH_STAGES.SEMI_FINAL : COACH_STAGES.QUALIFIED;
}

/** What goes past an objective: one stage further. */
export const exceededStage = (objective: CoachStage): CoachStage => Math.min(COACH_STAGES.WINNER, objective + 1) as CoachStage;

export type ObjectiveVerdict = "EXCEEDED" | "ACHIEVED" | "MISSED";

/** A tournament's stage against the objective: past it, reached, or below it (the end of the mission). */
export function objectiveVerdict(objective: CoachStage, stage: CoachStage): ObjectiveVerdict {
  return stage >= exceededStage(objective) && objective < COACH_STAGES.WINNER ? "EXCEEDED" : stage >= objective ? "ACHIEVED" : "MISSED";
}

/** Whether a nation qualifies for its cycle's tournament from its zone's final table of the qualifiers. */
export function qualifiesFrom(code: NationCode, tournament: TournamentCode, table: readonly InternationalTableRow[]): boolean {
  const places = tournamentPlaces(tournament)[nationByCode(code).zone];
  const row = table.find((entry) => entry.code === code);
  return row !== undefined && row.rank <= places;
}

/** A tournament's played matches, as the stage reached reads them. */
export type StageMatch = { round: number; home: NationCode; away: NationCode; winner: NationCode | null };

/** The stage a nation reached in a tournament from its matches: none, the groups, the semi-finals, the final, the title. */
export function stageReached(code: NationCode, matches: readonly StageMatch[], semiFinalRound: number, finalRound: number): CoachStage {
  const ofNation = matches.filter((match) => match.home === code || match.away === code);
  if (ofNation.length === 0) {
    return COACH_STAGES.NOT_QUALIFIED;
  }
  const final = ofNation.find((match) => match.round === finalRound);
  if (final !== undefined) {
    return final.winner === code ? COACH_STAGES.WINNER : COACH_STAGES.FINAL;
  }
  return ofNation.some((match) => match.round === semiFinalRound) ? COACH_STAGES.SEMI_FINAL : COACH_STAGES.QUALIFIED;
}

/** The ways a mission ends: he left, his nation did not qualify, his tournament fell short of the objective. */
export const SPELL_ENDINGS = ["RESIGNED", "NOT_QUALIFIED", "MISSED"] as const;
export type SpellEnding = (typeof SPELL_ENDINGS)[number];
