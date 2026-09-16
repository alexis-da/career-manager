import { centeredSpread, randomInt, type Rng } from "../lib/rng";
import {
  CLUB_REPUTATION_BEST,
  CLUB_REPUTATION_WORST,
  MIN_GOALKEEPERS,
  SQUAD_POSITION_TARGETS,
  YOUTH_AGE_MAX,
  YOUTH_AGE_MIN,
  YOUTH_CONTRACT_YEARS,
  YOUTH_HOME_NATIONALITY_SHARE,
  YOUTH_OVERALL_MAX,
  YOUTH_OVERALL_MIN,
  YOUTH_OVERALL_SPREAD,
  YOUTH_PLAYERS_PER_CLUB,
  YOUTH_POTENTIAL_GAP_MAX,
  YOUTH_POTENTIAL_GAP_MIN,
} from "./balance";
import { lerp } from "./curves";
import { contractEndDate, marketValueFor, wageFor } from "./economy";
import { clampRating, generateAttributes, shiftToOverall, type PlayerAttributes, type Position } from "./generation";
import { drawBirthDate, drawNameList, drawUniqueName, type PlayerIdentity } from "./identity";
import type { NameBank } from "./names";
import { seasonStartDate } from "./world";

export type YouthClub = {
  slug: string;
  country: string; // same label as the name lists' nationality
  reputation: number; // 1–99
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

/** When no position is short, the next young player comes to the positions with the most players. */
const TIE_ORDER: readonly Position[] = ["DF", "MF", "FW", "GK"];

/** Prefix of the keys of every young player arriving in a season. */
export function youthKeyPrefix(startYear: number): string {
  return `youth:${startYear}:`;
}

/** Stable key of a young player in the save, used for seeds and tie-breaks like `slug#squadSlot`. */
export function youthPlayerKey(startYear: number, clubSlug: string, index: number): string {
  return `${youthKeyPrefix(startYear)}${clubSlug}:${index}`;
}

export function youthRngSeed(saveSeed: string, startYear: number, clubSlug: string, index: number): string {
  return `${saveSeed}:youth:${startYear}:${clubSlug}:${index}`;
}

/**
 * Positions of the club's young players this season: a goalkeeper first when the squad has fewer than
 * MIN_GOALKEEPERS, otherwise the position furthest below SQUAD_POSITION_TARGETS, one player at a time.
 */
export function youthPositions(squadPositions: readonly Position[]): Position[] {
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const position of squadPositions) {
    counts[position]++;
  }
  const positions: Position[] = [];
  for (let index = 0; index < YOUTH_PLAYERS_PER_CLUB; index++) {
    const position =
      index === 0 && counts.GK < MIN_GOALKEEPERS
        ? "GK"
        : TIE_ORDER.reduce((best, candidate) =>
            SQUAD_POSITION_TARGETS[candidate] - counts[candidate] > SQUAD_POSITION_TARGETS[best] - counts[best]
              ? candidate
              : best,
          );
    positions.push(position);
    counts[position]++;
  }
  return positions;
}

/**
 * A young player joining a club on 1 July: identity from the name lists (the club's country most of the
 * time), aged 16 to 18, rated 45 to 60 according to the club's reputation, with a high potential and a
 * first contract. Pass the stream of youthRngSeed.
 */
export function generateYouthPlayer(input: YouthPlayerInput, names: NameBank, rng: Rng): YouthPlayer {
  const { club, position, startYear, index, takenNames } = input;
  const arrival = seasonStartDate(startYear);

  const nameList = drawNameList(rng, names, club.country, YOUTH_HOME_NATIONALITY_SHARE);
  const { firstName, lastName } = drawUniqueName(rng, nameList, takenNames);
  const age = randomInt(rng, YOUTH_AGE_MIN, YOUTH_AGE_MAX);
  const birthDate = drawBirthDate(rng, arrival, age);

  const reputationShare = Math.min(
    1,
    Math.max(0, (club.reputation - CLUB_REPUTATION_WORST) / (CLUB_REPUTATION_BEST - CLUB_REPUTATION_WORST)),
  );
  const clubOverall = lerp(YOUTH_OVERALL_MIN, YOUTH_OVERALL_MAX, reputationShare);
  const overall = Math.min(
    YOUTH_OVERALL_MAX,
    Math.max(YOUTH_OVERALL_MIN, Math.round(clubOverall + centeredSpread(rng) * YOUTH_OVERALL_SPREAD)),
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
