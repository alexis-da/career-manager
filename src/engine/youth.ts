import { centeredSpread, randomInt, type Rng } from "../lib/rng";
import {
  CLUB_REPUTATION_BY_TIER,
  MIN_GOALKEEPERS,
  SQUAD_ROLES,
  YOUTH_AGE_MAX,
  YOUTH_AGE_MIN,
  YOUTH_CONTRACT_YEARS,
  YOUTH_HOME_NATIONALITY_SHARE,
  YOUTH_OVERALL_BY_TIER,
  YOUTH_OVERALL_SPREAD,
  YOUTH_PLAYERS_PER_CLUB,
  YOUTH_POTENTIAL_GAP_MAX,
  YOUTH_POTENTIAL_GAP_MIN,
} from "./balance";
import { lerp } from "./curves";
import { contractEndDate, marketValueFor, wageFor } from "./economy";
import { clampRating, generateAttributes, shiftToOverall, type PlayerAttributes } from "./generation";
import { drawBirthDate, drawNameList, drawUniqueName, type PlayerIdentity } from "./identity";
import type { NameBank } from "./names";
import {
  PROMISING_YOUTH_AGE,
  PROMISING_YOUTH_CONTRACT_YEARS,
  PROMISING_YOUTH_OVERALL_BONUS,
  PROMISING_YOUTH_POTENTIAL_GAP,
} from "./shop";
import { roleOf, type Position } from "./positions";
import type { CompetitionTier } from "./tiers";
import { seasonStartDate } from "./world";

export type YouthClub = {
  slug: string;
  country: string; // same label as the name lists' nationality
  reputation: number; // 1–99
  tier: CompetitionTier; // its division now: its reputation and its young players' level are measured within it
};

export type YouthPlayerInput = {
  club: YouthClub;
  position: Position;
  startYear: number; // season the player joins, on 1 July
  index: number; // 1-based rank among the club's arrivals of the season
  takenNames: Set<string>; // full names already in the squad, updated with the new one
};

export type YouthPlayer = PlayerIdentity &
  PlayerAttributes & {
    key: string;
    position: Position;
    wage: number;
    marketValue: number;
    contractUntil: Date;
  };

/**
 * Roles in the order they win a tie on shortfall: the roles needing the most players first, goalkeepers last,
 * otherwise in the order of SQUAD_ROLES.
 */
const TIE_ORDER: readonly number[] = SQUAD_ROLES.map((_, index) => index).sort(
  (a, b) =>
    Number(SQUAD_ROLES[a].positions.includes("GK")) - Number(SQUAD_ROLES[b].positions.includes("GK")) ||
    SQUAD_ROLES[b].count - SQUAD_ROLES[a].count ||
    a - b,
);

/** Prefix of the keys of every young player arriving in a season. */
export function youthKeyPrefix(startYear: number): string {
  return `youth:${startYear}:`;
}

/**
 * The season whose preseason brought a young player of the academy to his club, read from his key (youthPlayerKey); null
 * for any other player. He joined it on that season's first day.
 */
export function youthIntakeYear(playerKey: string): number | null {
  const match = /^youth:(\d{4}):/.exec(playerKey);
  return match === null ? null : Number(match[1]);
}

/** Stable key of a young player in the save, used for seeds and tie-breaks like `slug#squadSlot`. */
export function youthPlayerKey(startYear: number, clubSlug: string, index: number): string {
  return `${youthKeyPrefix(startYear)}${clubSlug}:${index}`;
}

export function youthRngSeed(saveSeed: string, startYear: number, clubSlug: string, index: number): string {
  return `${saveSeed}:youth:${startYear}:${clubSlug}:${index}`;
}

/**
 * Positions of the club's young players this season, one player at a time: a goalkeeper first when the squad has
 * fewer than MIN_GOALKEEPERS, otherwise the role furthest below its count in SQUAD_ROLES, at the position of that
 * role with the fewest players (the first one on a tie).
 */
export function youthPositions(squadPositions: readonly Position[]): Position[] {
  const counts = new Map<Position, number>();
  for (const position of squadPositions) {
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }
  const countOf = (position: Position): number => counts.get(position) ?? 0;
  const shortfall = (role: number): number =>
    SQUAD_ROLES[role].count - SQUAD_ROLES[role].positions.reduce((sum, position) => sum + countOf(position), 0);

  const positions: Position[] = [];
  for (let index = 0; index < YOUTH_PLAYERS_PER_CLUB; index++) {
    const role =
      index === 0 && countOf("GK") < MIN_GOALKEEPERS
        ? roleOf("GK")
        : SQUAD_ROLES[TIE_ORDER.reduce((best, candidate) => (shortfall(candidate) > shortfall(best) ? candidate : best))];
    const position = role.positions.reduce((best, candidate) => (countOf(candidate) < countOf(best) ? candidate : best));
    positions.push(position);
    counts.set(position, countOf(position) + 1);
  }
  return positions;
}

/**
 * A young player joining a club on 1 July: identity from the name lists (the club's country most of the
 * time), aged 16 to 18, rated according to the club's reputation within its division (45 to 60 in the first, 42
 * to 55 in the second: YOUTH_OVERALL_BY_TIER), with a high potential and a
 * first contract. Pass the stream of youthRngSeed.
 */
export function generateYouthPlayer(input: YouthPlayerInput, names: NameBank, rng: Rng): YouthPlayer {
  const { club, position, startYear, index, takenNames } = input;
  const arrival = seasonStartDate(startYear);

  const nameList = drawNameList(rng, names, club.country, YOUTH_HOME_NATIONALITY_SHARE);
  const { firstName, lastName } = drawUniqueName(rng, nameList, takenNames);
  const age = randomInt(rng, YOUTH_AGE_MIN, YOUTH_AGE_MAX);
  const birthDate = drawBirthDate(rng, arrival, age);

  // The club's reputation within its own division's range, then its young players' level within their division's:
  // the first division's is the same as before the second divisions.
  const { worst, best } = CLUB_REPUTATION_BY_TIER[club.tier];
  const reputationShare = Math.min(1, Math.max(0, (club.reputation - worst) / (best - worst)));
  const level = YOUTH_OVERALL_BY_TIER[club.tier];
  const clubOverall = lerp(level.worst, level.best, reputationShare);
  const overall = Math.min(
    level.best,
    Math.max(level.worst, Math.round(clubOverall + centeredSpread(rng) * YOUTH_OVERALL_SPREAD)),
  );
  // Draws the attribute profile of the position, then moves it to the chosen overall.
  const attributes = shiftToOverall(position, generateAttributes({ position, age }, overall, rng), overall);
  const potential = clampRating(attributes.overall + randomInt(rng, YOUTH_POTENTIAL_GAP_MIN, YOUTH_POTENTIAL_GAP_MAX));
  const contractProfile = { age, overall: attributes.overall, potential };

  return {
    key: youthPlayerKey(startYear, club.slug, index),
    firstName,
    lastName,
    birthDate,
    nationality: nameList.nationality,
    position,
    ...attributes,
    potential,
    wage: wageFor(contractProfile),
    marketValue: marketValueFor(contractProfile),
    contractUntil: contractEndDate(arrival, YOUTH_CONTRACT_YEARS),
  };
}

/** A promising youth of the shop: the club, his position in the line the player chose, the purchase's date and rank. */
export type PromisingYouthInput = {
  club: YouthClub;
  position: Position;
  date: Date; // the save's, the purchase's
  index: number; // 1-based rank of the purchase among the career's promising youths
  takenNames: Set<string>; // full names already in the squad, updated with the new one
};

/** Prefix of the promising youths' keys: only they can be held by their first contract (src/db/shop.ts, academyLocks). */
export const PROMISING_YOUTH_KEY_PREFIX = "shop-youth:";

/** Stable key of a promising youth in the save, apart from the preseason's young players. */
export function promisingYouthKey(index: number): string {
  return `${PROMISING_YOUTH_KEY_PREFIX}${index}`;
}

export function promisingYouthRngSeed(saveSeed: string, index: number): string {
  return `${saveSeed}:shop-youth:${index}`;
}

/**
 * A promising youth joining the club from the shop (src/engine/shop.ts): as a young player of the preseason, but aged
 * PROMISING_YOUTH_AGE, rated at the top of his division's range plus PROMISING_YOUTH_OVERALL_BONUS (63 in the first, 58
 * in the second), with a potential PROMISING_YOUTH_POTENTIAL_GAP above, on a first contract of
 * PROMISING_YOUTH_CONTRACT_YEARS seasons from the purchase. Pass the stream of promisingYouthRngSeed: the same purchases
 * give the same youths.
 */
export function generatePromisingYouth(input: PromisingYouthInput, names: NameBank, rng: Rng): YouthPlayer {
  const { club, position, date, index, takenNames } = input;
  const nameList = drawNameList(rng, names, club.country, YOUTH_HOME_NATIONALITY_SHARE);
  const { firstName, lastName } = drawUniqueName(rng, nameList, takenNames);
  const age = PROMISING_YOUTH_AGE;
  const birthDate = drawBirthDate(rng, date, age);
  const overall = YOUTH_OVERALL_BY_TIER[club.tier].best + PROMISING_YOUTH_OVERALL_BONUS;
  const attributes = shiftToOverall(position, generateAttributes({ position, age }, overall, rng), overall);
  const potential = clampRating(attributes.overall + randomInt(rng, PROMISING_YOUTH_POTENTIAL_GAP.min, PROMISING_YOUTH_POTENTIAL_GAP.max));
  const contractProfile = { age, overall: attributes.overall, potential };
  return {
    key: promisingYouthKey(index),
    firstName,
    lastName,
    birthDate,
    nationality: nameList.nationality,
    position,
    ...attributes,
    potential,
    wage: wageFor(contractProfile),
    marketValue: marketValueFor(contractProfile),
    contractUntil: contractEndDate(date, PROMISING_YOUTH_CONTRACT_YEARS),
  };
}
