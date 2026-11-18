import { makeRng, shuffle } from "../lib/rng";
import { europeDates } from "./europe";
import type { InternationalSession, LightMatch } from "./international";
import type { SquadPlayer } from "./lineup";
import { INTERNATIONAL_DATES_PER_SEASON, NATION_CODES, NATIONS, type NationCode, type NationZone, type Pairing } from "./nations";
import { breakWindows } from "./schedule";

// The international competitions of a save (docs/design/selections.md § 3.3, 3.4, 4): its cycles of two seasons of
// qualifiers at the breaks, each ending in a summer tournament, the Old Continent Cup and the Hemispheres Cup in turn;
// the friendlies around the qualifiers, the tables, the draw and the tournament's matches. Pure: the save's seed draws.

/** National teams' cycles in the saves with nations (Save.cyclesFrom): qualifiers and summer tournaments (N3). */
export const CYCLES_ENABLED = true;

export const FRIENDLY = "int.friendly";
export const QUALIFIER_EUROPE = "int.qual.eu";
export const QUALIFIER_WORLD = "int.qual.world";
export const OLD_CONTINENT_CUP = "int.eu";
export const HEMISPHERES_CUP = "int.world";

export type QualifierCode = typeof QUALIFIER_EUROPE | typeof QUALIFIER_WORLD;
export type TournamentCode = typeof OLD_CONTINENT_CUP | typeof HEMISPHERES_CUP;
export type InternationalCompetition = typeof FRIENDLY | QualifierCode | TournamentCode;

export const INTERNATIONAL_COMPETITIONS: readonly InternationalCompetition[] = [
  FRIENDLY,
  QUALIFIER_EUROPE,
  QUALIFIER_WORLD,
  OLD_CONTINENT_CUP,
  HEMISPHERES_CUP,
];

export function isInternationalCompetition(code: string): code is InternationalCompetition {
  return (INTERNATIONAL_COMPETITIONS as readonly string[]).includes(code);
}

export const isTournament = (code: string): code is TournamentCode => code === OLD_CONTINENT_CUP || code === HEMISPHERES_CUP;

/** The tournament a qualifier leads to, in a cycle: the zone's competition says nothing of it. */
export const zoneOfQualifier = (code: QualifierCode): NationZone => (code === QUALIFIER_EUROPE ? "EUROPE" : "WORLD");

// ------------------------------------------------------------------ Cycles (§ 3.4)

/** Seasons of a cycle: its qualifiers, then its tournament in the June that ends the second. */
export const CYCLE_SEASONS = 2;

/**
 * A season's cycle: the cycle's index since the save's first (Save.cyclesFrom), its first season, the season's place in
 * it (0 or 1), the tournament it leads to (the Old Continent Cup first, then the Hemispheres Cup, in turn) and its year.
 */
export type Cycle = { index: number; startYear: number; season: 0 | 1; tournament: TournamentCode; tournamentYear: number };

export function cycleOf(cyclesFrom: number | null, startYear: number): Cycle | null {
  if (cyclesFrom === null || startYear < cyclesFrom) {
    return null;
  }
  const index = Math.floor((startYear - cyclesFrom) / CYCLE_SEASONS);
  const cycleStart = cyclesFrom + index * CYCLE_SEASONS;
  return {
    index,
    startYear: cycleStart,
    season: startYear - cycleStart === 0 ? 0 : 1,
    tournament: index % 2 === 0 ? OLD_CONTINENT_CUP : HEMISPHERES_CUP,
    tournamentYear: cycleStart + CYCLE_SEASONS,
  };
}

/** The tournament played in the June that ends the season starting in startYear, if that season ends a cycle. */
export function tournamentEnding(cyclesFrom: number | null, startYear: number): Cycle | null {
  const cycle = cycleOf(cyclesFrom, startYear);
  return cycle !== null && cycle.season === 1 ? cycle : null;
}

// ------------------------------------------------------------------ Qualifiers (§ 4.2)

/** International dates of a cycle: the two of each break of its two seasons, Friday then Tuesday (0 to 15). */
export const CYCLE_DATES = CYCLE_SEASONS * INTERNATIONAL_DATES_PER_SEASON;

/**
 * The cycle's dates each zone's qualifiers take: one matchday a break, on the Friday; the matchdays beyond eight (Europe's
 * 9th, the World zone's 9th and 10th) on the Tuesdays of the last breaks, so that the March break of the second season
 * decides.
 */
const QUALIFIER_DATES: Readonly<Record<QualifierCode, readonly number[]>> = {
  [QUALIFIER_EUROPE]: [0, 2, 4, 6, 8, 10, 12, 14, 15],
  [QUALIFIER_WORLD]: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15],
};

/** The date of a cycle's international date (0 to 15). */
export function cycleDate(cycleStartYear: number, index: number): Date {
  const season = Math.floor(index / INTERNATIONAL_DATES_PER_SEASON);
  const inSeason = index % INTERNATIONAL_DATES_PER_SEASON;
  return breakWindows(cycleStartYear + season)[Math.floor(inSeason / 2)].dates[inSeason % 2];
}

/** A qualifier of a cycle: its zone's competition, its matchday, its date in the cycle (0 to 15). */
export type QualifierMatch = { competition: QualifierCode; round: number; cycleDate: number; home: NationCode; away: NationCode };

export function qualifierRngSeed(saveSeed: string, competition: QualifierCode, cycleStartYear: number): string {
  return `${saveSeed}:int-qual:${competition}:${cycleStartYear}`;
}

/** A zone's nations, in the game's order. */
export const zoneNations = (zone: NationZone): NationCode[] => NATIONS.filter((nation) => nation.zone === zone).map((nation) => nation.code);

/**
 * A single round-robin of an odd number of nations: one round each rests (the round's index), the others meet in pairs
 * around it; each nation meets every other once, at home in half its matches.
 */
function singleRoundRobin(placed: readonly NationCode[]): Pairing[][] {
  const count = placed.length;
  return Array.from({ length: count }, (_, round) => {
    const pairs: Pairing[] = [];
    for (let k = 1; k <= (count - 1) / 2; k++) {
      const a = placed[(round + k) % count];
      const b = placed[(round - k + count) % count];
      pairs.push(k % 2 === 1 ? { home: a, away: b } : { home: b, away: a });
    }
    return pairs;
  });
}

/**
 * The qualifiers of a cycle: Europe's nine in one group of single matches (nine matchdays, one nation resting at each,
 * each at home four times); in a Hemispheres cycle, the World zone's five in home and away matches as well (ten
 * matchdays). The order of each zone's nations is drawn once a cycle by its own stream; the Old Continent cycle's World
 * zone plays friendlies.
 */
export function cycleQualifiers(saveSeed: string, cycle: Pick<Cycle, "startYear" | "tournament">): QualifierMatch[] {
  const zones: QualifierCode[] = cycle.tournament === OLD_CONTINENT_CUP ? [QUALIFIER_EUROPE] : [QUALIFIER_EUROPE, QUALIFIER_WORLD];
  return zones.flatMap((competition) => {
    const placed = shuffle(makeRng(qualifierRngSeed(saveSeed, competition, cycle.startYear)), zoneNations(zoneOfQualifier(competition)));
    const single = singleRoundRobin(placed);
    const rounds = competition === QUALIFIER_EUROPE ? single : [...single, ...single.map((pairs) => pairs.map(({ home, away }) => ({ home: away, away: home })))];
    return rounds.flatMap((pairs, index) =>
      pairs.map((pair) => ({ competition, round: index + 1, cycleDate: QUALIFIER_DATES[competition][index], ...pair })),
    );
  });
}

/** Matchdays of a zone's qualifiers in a cycle. */
export const qualifierRounds = (competition: QualifierCode): number => QUALIFIER_DATES[competition].length;

// ------------------------------------------------------------------ Friendlies around them (§ 4.3)

/** When each pair of nations last met, how often each was at home, and who hosted a pair's last meeting. */
export type FriendlyHistory = { lastMet: Map<string, number>; homes: Map<NationCode, number>; lastHost: Map<string, NationCode> };

const pairKey = (a: NationCode, b: NationCode): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** A meeting of two nations, on a date: neither is at home on neutral ground. */
export function recordMeeting(history: FriendlyHistory, pair: Pairing, date: Date, neutral: boolean): void {
  const key = pairKey(pair.home, pair.away);
  history.lastMet.set(key, Math.max(history.lastMet.get(key) ?? Number.NEGATIVE_INFINITY, date.getTime()));
  if (!neutral) {
    history.homes.set(pair.home, (history.homes.get(pair.home) ?? 0) + 1);
    history.lastHost.set(key, pair.home);
  }
}

/** The history of a save's international matches, of every competition, in date order. */
export function friendlyHistory(matches: readonly (Pairing & { date: Date; neutral: boolean })[]): FriendlyHistory {
  const history: FriendlyHistory = { lastMet: new Map(), homes: new Map(), lastHost: new Map() };
  for (const match of [...matches].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    recordMeeting(history, match, match.date, match.neutral);
  }
  return history;
}

/**
 * The friendlies of the nations available on a date (an even number of them): the pairs that have not met for the
 * longest first (never before all), then the closest strengths, then the codes; at home, the one that has been at home
 * the least, then the one that was away at their last meeting, then the first by code. Every nation available plays.
 */
export function pairFriendlies(
  available: readonly NationCode[],
  history: FriendlyHistory,
  strengths: ReadonlyMap<NationCode, number>,
): Pairing[] {
  const strength = (code: NationCode): number => strengths.get(code) ?? 0;
  const candidates: [NationCode, NationCode][] = [];
  const sorted = [...available].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      candidates.push([sorted[i], sorted[j]]);
    }
  }
  const lastMet = (a: NationCode, b: NationCode): number => history.lastMet.get(pairKey(a, b)) ?? Number.NEGATIVE_INFINITY;
  candidates.sort(
    ([a1, b1], [a2, b2]) =>
      lastMet(a1, b1) - lastMet(a2, b2) ||
      Math.abs(strength(a1) - strength(b1)) - Math.abs(strength(a2) - strength(b2)) ||
      (pairKey(a1, b1) < pairKey(a2, b2) ? -1 : 1),
  );
  const taken = new Set<NationCode>();
  const pairs: Pairing[] = [];
  for (const [a, b] of candidates) {
    if (taken.has(a) || taken.has(b)) {
      continue;
    }
    taken.add(a);
    taken.add(b);
    const homesA = history.homes.get(a) ?? 0;
    const homesB = history.homes.get(b) ?? 0;
    const lastHost = history.lastHost.get(pairKey(a, b));
    const aAtHome = homesA !== homesB ? homesA < homesB : lastHost !== undefined ? lastHost === b : true;
    pairs.push(aAtHome ? { home: a, away: b } : { home: b, away: a });
  }
  if (taken.size !== available.length) {
    throw new Error(`An odd number of nations to pair: ${available.join(", ")}`);
  }
  return pairs;
}

/** An international match a season's opening plans: its competition, its matchday (a friendly: the season's date, 1 to 8). */
export type PlannedMatch = { competition: InternationalCompetition; round: number; date: Date; home: NationCode; away: NationCode };

/**
 * The international matches of a season's breaks: at each of its eight dates, the qualifiers of its cycle that fall on
 * it, then friendlies between all the nations left (pairFriendlies, the history growing date by date). Seven matches a
 * date. `history` is the save's, and grows with the season's matches.
 */
export function seasonInternationalMatches(input: {
  saveSeed: string;
  startYear: number;
  cycle: Cycle | null;
  history: FriendlyHistory;
  strengths: ReadonlyMap<NationCode, number>;
}): PlannedMatch[] {
  const { saveSeed, startYear, cycle, history, strengths } = input;
  const qualifiers =
    cycle === null
      ? []
      : cycleQualifiers(saveSeed, cycle).filter((match) => Math.floor(match.cycleDate / INTERNATIONAL_DATES_PER_SEASON) === cycle.season);
  const windows = breakWindows(startYear);
  const planned: PlannedMatch[] = [];
  for (let index = 0; index < INTERNATIONAL_DATES_PER_SEASON; index++) {
    const date = windows[Math.floor(index / 2)].dates[index % 2];
    const ofDate = qualifiers.filter((match) => match.cycleDate % INTERNATIONAL_DATES_PER_SEASON === index);
    const busy = new Set(ofDate.flatMap((match) => [match.home, match.away]));
    for (const match of ofDate) {
      recordMeeting(history, match, date, false);
      planned.push({ competition: match.competition, round: match.round, date, home: match.home, away: match.away });
    }
    const friendlies = pairFriendlies(
      NATION_CODES.filter((code) => !busy.has(code)),
      history,
      strengths,
    );
    for (const pair of friendlies) {
      recordMeeting(history, pair, date, false);
      planned.push({ competition: FRIENDLY, round: index + 1, date, home: pair.home, away: pair.away });
    }
  }
  return planned;
}

// ------------------------------------------------------------------ Tables (§ 4.2, 4.4)

export type InternationalResult = { home: NationCode; away: NationCode; homeGoals: number; awayGoals: number };

export type InternationalTableRow = {
  code: NationCode;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

/**
 * A group's table: 3 points a win, 1 a draw; then the goal difference, the goals scored, the strength at the cycle's
 * opening (NationSave.strength), the code.
 */
export function internationalTable(
  codes: readonly NationCode[],
  results: readonly InternationalResult[],
  strengths: ReadonlyMap<NationCode, number>,
): InternationalTableRow[] {
  const rows = new Map(
    codes.map((code) => [code, { code, rank: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]),
  );
  for (const result of results) {
    const home = rows.get(result.home);
    const away = rows.get(result.away);
    if (home === undefined || away === undefined) {
      continue;
    }
    for (const [row, scored, conceded] of [
      [home, result.homeGoals, result.awayGoals],
      [away, result.awayGoals, result.homeGoals],
    ] as const) {
      row.played++;
      row.goalsFor += scored;
      row.goalsAgainst += conceded;
      if (scored > conceded) {
        row.won++;
        row.points += 3;
      } else if (scored === conceded) {
        row.drawn++;
        row.points += 1;
      } else {
        row.lost++;
      }
    }
  }
  return [...rows.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor ||
        (strengths.get(b.code) ?? 0) - (strengths.get(a.code) ?? 0) ||
        (a.code < b.code ? -1 : 1),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

// ------------------------------------------------------------------ The tournament (§ 3.3, 4.4, 4.5)

/** Nations of the Old Continent Cup: Europe's six first. */
export const OLD_CONTINENT_NATIONS = 6;
/** Nations of the Hemispheres Cup from each zone: Europe's five first, the World zone's three. */
export const HEMISPHERES_NATIONS: Readonly<Record<NationZone, number>> = { EUROPE: 5, WORLD: 3 };

/** A tournament's places of each zone. */
export function tournamentPlaces(tournament: TournamentCode): Readonly<Record<NationZone, number>> {
  return tournament === OLD_CONTINENT_CUP ? { EUROPE: OLD_CONTINENT_NATIONS, WORLD: 0 } : HEMISPHERES_NATIONS;
}

/** The two groups of a tournament, each in the order of its pots. */
export type TournamentGroups = readonly [readonly NationCode[], readonly NationCode[]];

export function drawRngSeed(saveSeed: string, tournament: TournamentCode, year: number): string {
  return `${saveSeed}:int-draw:${tournament}:${year}`;
}

const perMatch = (value: number, played: number): number => value / Math.max(1, played);

/**
 * The draw of a tournament, from the final tables of its qualifiers: pots of two, each split between the two groups by
 * the draw's stream. The Old Continent Cup: Europe's 1st and 2nd, 3rd and 4th, 5th and 6th. The Hemispheres Cup: the two
 * zones' winners, then the other qualified nations by points a match in their qualifiers (then goal difference a match,
 * strength, code), two by two.
 */
export function drawTournament(input: {
  tournament: TournamentCode;
  europe: readonly InternationalTableRow[];
  world: readonly InternationalTableRow[];
  strengths: ReadonlyMap<NationCode, number>;
  saveSeed: string;
  year: number;
}): TournamentGroups {
  const { tournament, europe, world, strengths } = input;
  const places = tournamentPlaces(tournament);
  const fromEurope = europe.slice(0, places.EUROPE);
  const fromWorld = world.slice(0, places.WORLD);
  let order: NationCode[];
  if (tournament === OLD_CONTINENT_CUP) {
    order = fromEurope.map((row) => row.code);
  } else {
    const [europeFirst, ...europeRest] = fromEurope;
    const [worldFirst, ...worldRest] = fromWorld;
    if (europeFirst === undefined || worldFirst === undefined) {
      throw new Error("A Hemispheres Cup without both zones' winners");
    }
    const rest = [...europeRest, ...worldRest].sort(
      (a, b) =>
        perMatch(b.points, b.played) - perMatch(a.points, a.played) ||
        perMatch(b.goalsFor - b.goalsAgainst, b.played) - perMatch(a.goalsFor - a.goalsAgainst, a.played) ||
        (strengths.get(b.code) ?? 0) - (strengths.get(a.code) ?? 0) ||
        (a.code < b.code ? -1 : 1),
    );
    order = [europeFirst.code, worldFirst.code, ...rest.map((row) => row.code)];
  }
  const rng = makeRng(drawRngSeed(input.saveSeed, tournament, input.year));
  const groups: [NationCode[], NationCode[]] = [[], []];
  for (let pot = 0; pot < order.length; pot += 2) {
    const [first, second] = [order[pot], order[pot + 1]];
    const firstToA = rng() < 0.5;
    groups[0].push(firstToA ? first : second);
    groups[1].push(firstToA ? second : first);
  }
  return groups;
}

/** A tournament's match: its round (1 to 3, the groups; 4, the semi-finals; 5, the final) and its group (0, 1; null after). */
export type TournamentFixture = { round: number; pool: 0 | 1 | null; home: NationCode; away: NationCode };

export const SEMI_FINAL_ROUND = 4;
export const FINAL_ROUND = 5;
export const GROUP_ROUNDS = 3;

/** The matchdays of a group, by place in the group: three nations rest one at a time, four meet two by two. */
const GROUP_SCHEDULES: Readonly<Record<number, readonly (readonly [number, number])[][]>> = {
  3: [[[0, 1]], [[2, 0]], [[1, 2]]],
  4: [
    [
      [0, 3],
      [1, 2],
    ],
    [
      [0, 2],
      [3, 1],
    ],
    [
      [0, 1],
      [2, 3],
    ],
  ],
};

/** The groups' matches of a tournament, three matchdays, each nation meeting the others of its group once. */
export function groupFixtures(groups: TournamentGroups): TournamentFixture[] {
  return groups.flatMap((group, pool) => {
    const schedule = GROUP_SCHEDULES[group.length];
    if (schedule === undefined) {
      throw new Error(`A group of ${group.length} nations`);
    }
    return schedule.flatMap((pairs, round) =>
      pairs.map(([home, away]) => ({ round: round + 1, pool: pool === 0 ? (0 as const) : (1 as const), home: group[home], away: group[away] })),
    );
  });
}

/** Days from the European finals to a tournament's first match, then between its five dates. */
const TOURNAMENT_FIRST_DAY_AFTER_FINALS = 6;
const TOURNAMENT_DAYS_BETWEEN = 4;
const DAY_MS = 86_400_000;

/**
 * A tournament's five dates, in the June of `year` (§ 3.3): from the Friday after the week of the European finals, four
 * days apart: three matchdays of the groups (Friday, Tuesday, Saturday), the semi-finals (Wednesday), the final (Sunday).
 */
export function tournamentDates(year: number): Date[] {
  const finals = europeDates(year - 1, true).at(-1);
  if (finals === undefined) {
    throw new Error(`No European finals in ${year}`);
  }
  return Array.from(
    { length: FINAL_ROUND },
    (_, index) => new Date(finals.getTime() + (TOURNAMENT_FIRST_DAY_AFTER_FINALS + index * TOURNAMENT_DAYS_BETWEEN) * DAY_MS),
  );
}

export type PlayedTournamentMatch = TournamentFixture & { date: Date; match: LightMatch };

export type PlayedTournament = {
  matches: PlayedTournamentMatch[];
  tables: readonly [InternationalTableRow[], InternationalTableRow[]];
  winner: NationCode;
  runnerUp: NationCode;
};

const sideOf = (fixture: TournamentFixture, match: LightMatch): NationCode => (match.winner === "away" ? fixture.away : fixture.home);
const loserOf = (fixture: TournamentFixture, match: LightMatch): NationCode => (match.winner === "away" ? fixture.home : fixture.away);

/**
 * A tournament played light, from its squads (the session) and its groups: three matchdays of the groups on neutral
 * ground, then the semi-finals (1st of a group against 2nd of the other) and the final, knockout matches decided by extra
 * time and a shoot-out; `seedOf` gives each match's stream.
 */
export function playTournament<P extends SquadPlayer>(input: {
  session: InternationalSession<P>;
  groups: TournamentGroups;
  dates: readonly Date[];
  strengths: ReadonlyMap<NationCode, number>;
  seedOf: (date: Date, home: NationCode, away: NationCode) => string;
}): PlayedTournament {
  const { session, groups, dates, strengths, seedOf } = input;
  const matches: PlayedTournamentMatch[] = [];
  const play = (fixture: TournamentFixture, knockout: boolean): PlayedTournamentMatch => {
    const date = dates[fixture.round - 1];
    const match = session.play(fixture.home, fixture.away, date, seedOf(date, fixture.home, fixture.away), { neutral: true, knockout });
    const played = { ...fixture, date, match };
    matches.push(played);
    return played;
  };
  for (const fixture of groupFixtures(groups).sort((a, b) => a.round - b.round || (a.pool ?? 0) - (b.pool ?? 0))) {
    play(fixture, false);
  }
  const tables = [0, 1].map((pool) =>
    internationalTable(
      groups[pool],
      matches.filter((entry) => entry.pool === pool).map(({ home, away, match }) => ({ home, away, homeGoals: match.homeGoals, awayGoals: match.awayGoals })),
      strengths,
    ),
  ) as [InternationalTableRow[], InternationalTableRow[]];
  const semis = [
    play({ round: SEMI_FINAL_ROUND, pool: null, home: tables[0][0].code, away: tables[1][1].code }, true),
    play({ round: SEMI_FINAL_ROUND, pool: null, home: tables[1][0].code, away: tables[0][1].code }, true),
  ];
  const final = play({ round: FINAL_ROUND, pool: null, home: sideOf(semis[0], semis[0].match), away: sideOf(semis[1], semis[1].match) }, true);
  return { matches, tables, winner: sideOf(final, final.match), runnerUp: loserOf(final, final.match) };
}

/** A player's international title, as PlayerSave.internationalTitles keeps it: « int.eu:2028 ». */
export const titleKey = (tournament: TournamentCode, year: number): string => `${tournament}:${year}`;

export function parseTitleKey(key: string): { tournament: TournamentCode; year: number } | null {
  const [code, year] = key.split(":");
  return code !== undefined && isTournament(code) && /^\d{4}$/.test(year ?? "") ? { tournament: code, year: Number(year) } : null;
}
