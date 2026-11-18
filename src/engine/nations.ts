import { ageInYears } from "../lib/dates";
import { makeRng, randomInt, type Rng } from "../lib/rng";
import {
  CALL_UP_BY_GROUP,
  CALL_UP_SIZE,
  NATION_RESERVE_AGE,
  NATION_RESERVE_LEVELS,
  NATION_RESERVE_RETIREMENT_AGE,
  NATION_RESERVE_SEASON_MINUTES,
} from "./balance";
import { clampRating, generateAttributes, shiftToOverall, type PlayerAttributes } from "./generation";
import { drawBirthDate, drawUniqueName } from "./identity";
import type { NameBank, NameList } from "./names";
import { POSITION_GROUPS, positionGroup, squadTemplate, type Position } from "./positions";
import { progressionRngSeed, progressPlayer } from "./progression";
import { seasonStartDate } from "./world";

// The national teams (docs/design/selections.md): the 14 nations of the game's nationalities, each with its reserve of
// players outside our five countries' leagues, and the 23 it calls at each international break. Pure: no draw outside
// the save's seed.

/** National teams in the worldVersion 2 saves, from their next season on (Save.breaksFrom), never in a challenge save. */
export const NATIONS_ENABLED = true;

export const NATION_CODES = ["GER", "ENG", "ESP", "FRA", "ITA", "POR", "NED", "BEL", "CRO", "BRA", "ARG", "MAR", "SEN", "CIV"] as const;

export type NationCode = (typeof NATION_CODES)[number];

/** Europe's nations play the Old Continent Cup and the Hemispheres Cup, the others the Hemispheres Cup only (N3). */
export type NationZone = "EUROPE" | "WORLD";

export type Nation = {
  code: NationCode;
  nationality: string; // as PlayerSave.nationality and the name lists hold it: « Sénégal »
  zone: NationZone;
};

export const NATIONS: readonly Nation[] = [
  { code: "GER", nationality: "Allemagne", zone: "EUROPE" },
  { code: "ENG", nationality: "Angleterre", zone: "EUROPE" },
  { code: "ESP", nationality: "Espagne", zone: "EUROPE" },
  { code: "FRA", nationality: "France", zone: "EUROPE" },
  { code: "ITA", nationality: "Italie", zone: "EUROPE" },
  { code: "POR", nationality: "Portugal", zone: "EUROPE" },
  { code: "NED", nationality: "Pays-Bas", zone: "EUROPE" },
  { code: "BEL", nationality: "Belgique", zone: "EUROPE" },
  { code: "CRO", nationality: "Croatie", zone: "EUROPE" },
  { code: "BRA", nationality: "Brésil", zone: "WORLD" },
  { code: "ARG", nationality: "Argentine", zone: "WORLD" },
  { code: "MAR", nationality: "Maroc", zone: "WORLD" },
  { code: "SEN", nationality: "Sénégal", zone: "WORLD" },
  { code: "CIV", nationality: "Côte d'Ivoire", zone: "WORLD" },
];

const BY_CODE = new Map<string, Nation>(NATIONS.map((nation) => [nation.code, nation]));
const BY_NATIONALITY = new Map<string, Nation>(NATIONS.map((nation) => [nation.nationality, nation]));

export function isNationCode(code: string): code is NationCode {
  return BY_CODE.has(code);
}

export function nationByCode(code: NationCode): Nation {
  const nation = BY_CODE.get(code);
  if (nation === undefined) {
    throw new Error(`Unknown nation ${code}`);
  }
  return nation;
}

/** The nation of a nationality, as a player's row holds it; undefined for one the game does not know. */
export function nationOfNationality(nationality: string): Nation | undefined {
  return BY_NATIONALITY.get(nationality);
}

// ------------------------------------------------------------------ The reserve, outside our leagues (§ 2.3)

/** A player of a nation's reserve: he plays in a league the game does not simulate, for his national team only. */
export type ReservePlayer = PlayerAttributes & {
  key: string; // « reserve:BRA:7 », « reserve:BRA:7:2029 » for the one who took his place in 2029
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD, UTC
  position: Position;
};

/** Whether a player key is a reserve player's. */
export const isReserveKey = (key: string): boolean => key.startsWith("reserve:");

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** Seed of the stream drawing a nation's reserve when its save first has nations. */
export function reserveRngSeed(saveSeed: string, code: NationCode, startYear: number): string {
  return `${saveSeed}:nation-reserve:${code}:${startYear}`;
}

function nameListOf(names: NameBank, nation: Nation): NameList {
  const list = names.get(nation.nationality);
  if (list === undefined) {
    throw new Error(`No name list for ${nation.nationality}`);
  }
  return list;
}

/**
 * One reserve player: a name of his nation's list never already in `taken`, a birth date making him `age` on the first
 * day of the season, attributes around his position's profile shifted to a rating drawn in his nation's range, and a
 * potential as far above it as the drawn attributes had, never above the range's best: a reserve keeps its nation's level
 * season after season (measure:seasons, 18/11: without the cap, Brazil's eleven rose from 79 to 83 in five seasons).
 */
function drawReservePlayer(
  rng: Rng,
  nation: Nation,
  key: string,
  position: Position,
  age: number,
  list: NameList,
  taken: Set<string>,
  startYear: number,
): ReservePlayer {
  const { firstName, lastName } = drawUniqueName(rng, list, taken);
  const birthDate = drawBirthDate(rng, seasonStartDate(startYear), age);
  const level = NATION_RESERVE_LEVELS[nation.code];
  const target = randomInt(rng, level.worst, level.best);
  const drawn = generateAttributes({ position, age }, target, rng);
  const shifted = shiftToOverall(position, drawn, target);
  const potential = clampRating(Math.min(level.best, Math.max(shifted.overall, drawn.potential + shifted.overall - drawn.overall)));
  return { key, firstName, lastName, birthDate: isoDay(birthDate), position, ...shifted, potential };
}

/**
 * A nation's reserve when its save first has nations: 23 players in the squad template's positions, aged
 * NATION_RESERVE_AGE, rated in the nation's range (NATION_RESERVE_LEVELS), named from its list. Its own stream: the same
 * save and season always draw the same reserve.
 */
export function generateReserve(nation: Nation, names: NameBank, saveSeed: string, startYear: number): ReservePlayer[] {
  const rng = makeRng(reserveRngSeed(saveSeed, nation.code, startYear));
  const list = nameListOf(names, nation);
  const taken = new Set<string>();
  return squadTemplate(CALL_UP_SIZE).map((position, index) =>
    drawReservePlayer(
      rng,
      nation,
      `reserve:${nation.code}:${index + 1}`,
      position,
      randomInt(rng, NATION_RESERVE_AGE.worst, NATION_RESERVE_AGE.best),
      list,
      taken,
      startYear,
    ),
  );
}

/**
 * A nation's reserve a season later, at the start of the season starting in startYear: each player one year older,
 * progressed as a regular of his league (progressPlayer, his own stream), his potential never above his nation's range;
 * from NATION_RESERVE_RETIREMENT_AGE, retired, and a player of the youngest age of the range takes his place at his
 * position, drawn in the nation's range.
 */
export function reserveAfterSeason(
  nation: Nation,
  reserve: readonly ReservePlayer[],
  names: NameBank,
  saveSeed: string,
  startYear: number,
): ReservePlayer[] {
  const list = nameListOf(names, nation);
  const taken = new Set(reserve.map((player) => `${player.firstName} ${player.lastName}`));
  const seasonStart = seasonStartDate(startYear);
  return reserve.map((player, index) => {
    const age = ageInYears(new Date(`${player.birthDate}T00:00:00.000Z`), seasonStart);
    if (age >= NATION_RESERVE_RETIREMENT_AGE) {
      const rng = makeRng(`${reserveRngSeed(saveSeed, nation.code, startYear)}:${index + 1}`);
      const key = `reserve:${nation.code}:${index + 1}:${startYear}`;
      return drawReservePlayer(rng, nation, key, player.position, NATION_RESERVE_AGE.worst, list, taken, startYear);
    }
    const capped = { ...player, potential: Math.min(player.potential, NATION_RESERVE_LEVELS[nation.code].best) };
    const progressed = progressPlayer(capped, age, NATION_RESERVE_SEASON_MINUTES, makeRng(progressionRngSeed(saveSeed, startYear - 1, player.key)));
    return { ...player, ...progressed, potential: Math.min(progressed.potential, NATION_RESERVE_LEVELS[nation.code].best) };
  });
}

// ------------------------------------------------------------------ The call-up of a break (§ 2.2)

/** What a call-up needs to know of a player: his position and rating, and whether he is of the nation's reserve. */
export type CallUpCandidate = { id: string; position: Position; overall: number; reserve: boolean };

/** Best first: the rating, then a player of our clubs before a reserve player, then the key. */
const byCallUp = (a: CallUpCandidate, b: CallUpCandidate): number =>
  b.overall - a.overall || Number(a.reserve) - Number(b.reserve) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The 23 a nation calls for a break, among its available players (in our clubs, neither injured nor retired nor free, and
 * of its reserve): the best of each line (CALL_UP_BY_GROUP: 3 goalkeepers, 7 defenders, 7 midfielders, 4 forwards), then
 * the best outfield players left up to CALL_UP_SIZE. A reserve player only where he is better than a player of our clubs
 * or where one is missing. Lines first, in the order of POSITION_GROUPS.
 */
export function callUp<P extends CallUpCandidate>(candidates: readonly P[]): P[] {
  const ranked = [...candidates].sort(byCallUp);
  const called: P[] = [];
  const taken = new Set<string>();
  for (const group of POSITION_GROUPS) {
    let count = 0;
    for (const player of ranked) {
      if (count >= CALL_UP_BY_GROUP[group]) {
        break;
      }
      if (positionGroup(player.position) === group) {
        called.push(player);
        taken.add(player.id);
        count++;
      }
    }
  }
  for (const player of ranked) {
    if (called.length >= CALL_UP_SIZE) {
      break;
    }
    if (!taken.has(player.id) && positionGroup(player.position) !== "GK") {
      called.push(player);
      taken.add(player.id);
    }
  }
  return called;
}

// ------------------------------------------------------------------ The international dates (§ 3.1)

/** International dates a season: two at each of its four breaks. */
export const INTERNATIONAL_DATES_PER_SEASON = 8;

/** Two nations meeting: the first at home, unless on neutral ground. */
export type Pairing = { home: NationCode; away: NationCode };
