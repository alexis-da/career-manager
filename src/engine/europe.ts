import { shuffle, type Rng } from "../lib/rng";
import {
  EUROPE_OBJECTIVE_EXCEEDED_STAGES,
  EUROPE_OBJECTIVE_STAGES,
  EUROPE_PRIZES,
  EUROPE_REPUTATION_BONUS,
  type EuropePrizes,
} from "./balance";
import { SEASON_SATURDAYS } from "./schedule";
import type { CompetitionTier } from "./tiers";
import { firstMatchdayDate } from "./world";

// The European competitions of a worldVersion 2 save (docs/design/europe.md): the Coupe des Lauriers (eu.1) for each
// country's first four, the Coupe des Fanions (eu.2) for its 5th, 6th and cup winner. A league phase, each club against
// opponents of the other pots and never of its country, one table; then knockout ties, single-leg at the better ranked's,
// the final on neutral ground. Pure: the season reads and writes them (src/db/europe.ts).

/**
 * Whether the game gives its worldVersion 2 saves the European competitions: every new one from its first season
 * (createSave), every one from before at its next season (advanceToNextSeason). Never a challenge save. Set to false,
 * no save would get a new European season (createSave's `europe` still asks for one); a save that has them keeps them.
 */
export const EUROPE_ENABLED = true;

/** The two European competitions, by code: the best clubs of each country, then the next ones. */
export const EUROPE_CODES = ["eu.1", "eu.2"] as const;
export type EuropeCode = (typeof EUROPE_CODES)[number];

/** Whether a competition code is a European competition's: « eu.1 », « eu.2 ». */
export function isEuropeCode(code: string): code is EuropeCode {
  return (EUROPE_CODES as readonly string[]).includes(code);
}

/** The countries whose clubs play the European competitions, by the prefix of their league codes, in a fixed order. */
export const EUROPE_COUNTRIES = ["de", "en", "es", "fr", "it"] as const;

/** Places of each country: its first four in eu.1, its 5th and 6th, and its cup winner (or its 7th), in eu.2. */
export const EUROPE_RANKS: Readonly<Record<EuropeCode, readonly number[]>> = { "eu.1": [1, 2, 3, 4], "eu.2": [5, 6] };

/** Fixture.round of a European match: 1 to 6 the league phase, then the play-offs, the quarter- and semi-finals, the final. */
export const EUROPE_LEAGUE_ROUNDS = 6;
export const EUROPE_PLAYOFF_ROUND = 7;
export const EUROPE_QUARTER_FINAL_ROUND = 8;
export const EUROPE_SEMI_FINAL_ROUND = 9;
export const EUROPE_FINAL_ROUND = 10;
export const EUROPE_ROUNDS = EUROPE_FINAL_ROUND;

/** The league phase's places: the first four go to the quarter-finals, the next eight to the play-offs. */
export const EUROPE_DIRECT_PLACES = 4;
export const EUROPE_PLAYOFF_PLACES = 12;

/**
 * The stage a club reaches in its European competition (SeasonResult.europeStage, the European objective): 1 the
 * league phase, 2 the play-offs (the league phase's top 12), 3 the quarter-finals, 4 the semi-finals, 5 the final, 6 the
 * title.
 */
export const EUROPE_STAGES = { LEAGUE: 1, PLAYOFF: 2, QUARTER_FINAL: 3, SEMI_FINAL: 4, FINAL: 5, WON: 6 } as const;

/** Whether a match of a competition is a knockout match: a cup tie, or a European match past the league phase. */
export function isKnockoutRound(kind: "LEAGUE" | "CUP" | "EUROPE", round: number): boolean {
  return kind === "CUP" || (kind === "EUROPE" && round > EUROPE_LEAGUE_ROUNDS);
}

/** Whether a match of a competition is played on neutral ground: a European final. */
export function isNeutralRound(kind: "LEAGUE" | "CUP" | "EUROPE", round: number): boolean {
  return kind === "EUROPE" && round === EUROPE_FINAL_ROUND;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** A European match is played on the Wednesday after a Saturday, as a cup tie; the finals on a Saturday. */
const EUROPE_DAYS_AFTER_SATURDAY = 4;

/**
 * Weeks of rounds 1 to 9, as the index of their Saturday among the season's (0: the first matchday): free of the cup's
 * rounds (weeks 5, 12, 20, 26, 33) and of the Tuesday matchdays of the largest divisions (weeks 3, 9, 16, 22, 29 and
 * 35), so that no club plays three times in a week. The finals are on the Saturday after the cup's final.
 */
const EUROPE_ROUND_WEEKS: readonly number[] = [4, 6, 8, 10, 14, 17, 24, 28, 36];

/**
 * Dates of a season's European rounds, 1 to 10, the same for both competitions: Wednesdays (16 and 30 September, 14 and
 * 28 October, 25 November, 16 December, 3 February, 3 March, 28 April for 2026-27), then the finals on the Saturday a
 * week after the cups' (29 May 2027). No draw.
 */
export function europeDates(startYear: number): Date[] {
  const first = firstMatchdayDate(startYear).getTime();
  const rounds = EUROPE_ROUND_WEEKS.map((week) => new Date(first + week * WEEK_MS + EUROPE_DAYS_AFTER_SATURDAY * DAY_MS));
  return [...rounds, new Date(first + (SEASON_SATURDAYS + 1) * WEEK_MS)];
}

/** How a club qualified: by its league rank (the 7th taking the cup's place included), or as its country's cup winner. */
export type EuropePath = "RANK" | "CUP";

/** A club of a European season, as Season.entrants keeps it. */
export type EuropeEntrant = {
  club: string; // its key: the slug, the same in every database
  country: string; // the prefix of its league's code: « en »
  pot: number; // 1 to 4 in eu.1, 1 to 3 in eu.2: one club of each country in each
  path: EuropePath;
  tier: CompetitionTier; // its division in the season that qualified it
  rank: number; // its final rank there (Club.initialRank for a save's first season)
  reputation: number; // at the opening: the league phase table's last tie-break but the slug
};

/** What a country brings to a season's European competitions. */
export type CountryQualifiers = {
  country: string;
  table: readonly string[]; // its first division's clubs by final rank, the champion first
  // Its cup's winner in the season closed, with its division then and its rank there; null without one (a save's first
  // season, a save without cups).
  cupWinner: { club: string; tier: CompetitionTier; rank: number } | null;
};

/**
 * The clubs of a season's European competitions, from each country's final table and cup winner: its first four in
 * eu.1, one a pot, by rank; its 5th, 6th and cup winner in eu.2, one a pot, by their league ranking (a second division
 * cup winner last). A cup winner already qualified by its rank (1st to 6th) plays its rank's competition, and its 7th
 * takes the cup's place, as without a cup winner. No club plays both.
 */
export function qualifyForEurope(
  countries: readonly CountryQualifiers[],
  reputationOf: (club: string) => number,
): Record<EuropeCode, EuropeEntrant[]> {
  const entrants: Record<EuropeCode, EuropeEntrant[]> = { "eu.1": [], "eu.2": [] };
  for (const { country, table, cupWinner } of [...countries].sort((a, b) => (a.country < b.country ? -1 : 1))) {
    if (table.length < 7) {
      throw new RangeError(`A country needs 7 first division clubs for the European places, ${country} has ${table.length}`);
    }
    const byRank = (rank: number): EuropeEntrant => ({
      club: table[rank - 1],
      country,
      pot: 0,
      path: "RANK",
      tier: 1,
      rank,
      reputation: reputationOf(table[rank - 1]),
    });
    EUROPE_RANKS["eu.1"].forEach((rank, index) => entrants["eu.1"].push({ ...byRank(rank), pot: index + 1 }));

    const ranked = EUROPE_RANKS["eu.2"].map(byRank);
    const alreadyIn = cupWinner !== null && cupWinner.tier === 1 && cupWinner.rank <= 6;
    const third: EuropeEntrant =
      cupWinner === null || alreadyIn
        ? byRank(7)
        : { club: cupWinner.club, country, pot: 0, path: "CUP", tier: cupWinner.tier, rank: cupWinner.rank, reputation: reputationOf(cupWinner.club) };
    [...ranked, third]
      .sort((a, b) => a.tier - b.tier || a.rank - b.rank)
      .forEach((entrant, index) => entrants["eu.2"].push({ ...entrant, pot: index + 1 }));
  }
  return entrants;
}

/** Seed of a European season's draw: save, season and competition. */
export function europeDrawRngSeed(saveSeed: string, startYear: number, code: string): string {
  return `${saveSeed}:europe-draw:${startYear}:${code}`;
}

/** A match of a European competition, by club key. */
export type EuropeMatch = { round: number; home: string; away: string };

/** The ways to pair a competition's pots on a date: two pairs a date with four pots, one with three. */
const POT_PAIRINGS: Readonly<Record<number, readonly (readonly [number, number])[][]>> = {
  4: [
    [
      [1, 2],
      [3, 4],
    ],
    [
      [1, 3],
      [2, 4],
    ],
    [
      [1, 4],
      [2, 3],
    ],
  ],
  3: [[[1, 2]], [[1, 3]], [[2, 3]]],
};

/**
 * The league phase of a European season, rounds 1 to 6. For each pair of pots, the draw orders the five countries; the
 * club of the k-th country in the first pot hosts the (k+1)-th's of the second, and visits the (k+2)-th's (modulo 5):
 * two opponents in each other pot, one at home and one away, never of its country, and a draw always possible, without
 * a second try. With four pots (eu.1), each date pairs them two by two, every club plays at each of the six; with three
 * (eu.2), one pair of pots a date, each club plays four of the six and rests at two. The dates' order is drawn too.
 */
export function drawLeaguePhase(entrants: readonly EuropeEntrant[], rng: Rng): EuropeMatch[] {
  const potCount = Math.max(...entrants.map((entrant) => entrant.pot));
  const pairings = POT_PAIRINGS[potCount];
  if (pairings === undefined) {
    throw new RangeError(`A European league phase has 3 or 4 pots, not ${potCount}`);
  }
  const clubIn = (pot: number, country: string): string => {
    const club = entrants.find((entrant) => entrant.pot === pot && entrant.country === country)?.club;
    if (club === undefined) {
      throw new Error(`Pot ${pot} has no club of ${country}`);
    }
    return club;
  };
  for (let pot = 1; pot <= potCount; pot++) {
    const countries = entrants.filter((entrant) => entrant.pot === pot).map((entrant) => entrant.country).sort();
    if (countries.join() !== EUROPE_COUNTRIES.join()) {
      throw new Error(`Pot ${pot} needs one club of each country, got ${countries.join(", ")}`);
    }
  }

  // Each pair of pots, in a fixed order, its countries ordered by the draw: who hosts whom, and who visits whom.
  const halves = new Map<string, { hosting: EuropeMatch[]; visiting: EuropeMatch[] }>();
  for (const [first, second] of pairings.flat()) {
    const order = shuffle(rng, EUROPE_COUNTRIES);
    const country = (index: number): string => order[index % order.length];
    halves.set(`${first}-${second}`, {
      hosting: order.map((_, k) => ({ round: 0, home: clubIn(first, country(k)), away: clubIn(second, country(k + 1)) })),
      visiting: order.map((_, k) => ({ round: 0, home: clubIn(second, country(k + 2)), away: clubIn(first, country(k)) })),
    });
  }
  const dates = pairings.flatMap((pairs) =>
    (["hosting", "visiting"] as const).map((half) =>
      pairs.flatMap(([first, second]) => {
        const matches = halves.get(`${first}-${second}`);
        if (matches === undefined) {
          throw new Error(`No draw for pots ${first} and ${second}`);
        }
        return matches[half];
      }),
    ),
  );
  return shuffle(rng, dates).flatMap((matches, index) => matches.map((match) => ({ ...match, round: index + 1 })));
}

/** A match of the league phase as its table reads it: played, with its score. */
export type EuropeScore = { home: string; away: string; homeGoals: number; awayGoals: number };

export type EuropeTableRow = {
  club: string;
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
 * The league phase's table: points (3 a win, 1 a draw), goal difference, goals scored, then the reputation at the opening
 * and the slug, for an order always strict. Every entrant has its row, played or not.
 */
export function leaguePhaseTable(entrants: readonly Pick<EuropeEntrant, "club" | "reputation">[], scores: readonly EuropeScore[]): EuropeTableRow[] {
  const rows = new Map(
    entrants.map((entrant) => [
      entrant.club,
      { club: entrant.club, rank: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    ]),
  );
  const reputation = new Map(entrants.map((entrant) => [entrant.club, entrant.reputation]));
  const rowOf = (club: string): EuropeTableRow => {
    const row = rows.get(club);
    if (row === undefined) {
      throw new Error(`Club ${club} is not in this league phase`);
    }
    return row;
  };
  for (const { home, away, homeGoals, awayGoals } of scores) {
    for (const [club, scored, conceded] of [
      [home, homeGoals, awayGoals],
      [away, awayGoals, homeGoals],
    ] as const) {
      const row = rowOf(club);
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
  const ordered = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      (reputation.get(b.club) ?? 0) - (reputation.get(a.club) ?? 0) ||
      (a.club < b.club ? -1 : a.club > b.club ? 1 : 0),
  );
  return ordered.map((row, index) => ({ ...row, rank: index + 1 }));
}

/** A knockout tie of a European competition, the better ranked at home (on neutral ground in the final). */
export type EuropeTie = { home: string; away: string };

/** A knockout tie played, with the club through. */
export type PlayedEuropeTie = EuropeTie & { round: number; winner: string };

/** The play-offs, by index into the league phase ranking: 5th-12th, 6th-11th, 7th-10th, 8th-9th. */
const PLAYOFFS: readonly (readonly [number, number])[] = [
  [4, 11],
  [5, 10],
  [6, 9],
  [7, 8],
];

/**
 * The knockout ties of a round, from the league phase's ranking (the clubs by rank) and the knockout ties already played:
 * the play-offs (5th-12th, 6th-11th, 7th-10th, 8th-9th); the quarter-finals, the 1st against the winner of 8th-9th, the 2nd
 * of 7th-10th, the 3rd of 6th-11th, the 4th of 5th-12th; the semi-finals, the 1st's side against the 4th's, the 2nd's
 * against the 3rd's; the final. A fixed bracket, known from the end of the league phase: the better ranked is at home.
 */
export function knockoutTies(round: number, ranking: readonly string[], played: readonly PlayedEuropeTie[]): EuropeTie[] {
  if (ranking.length < EUROPE_PLAYOFF_PLACES) {
    throw new RangeError(`A knockout phase needs ${EUROPE_PLAYOFF_PLACES} clubs ranked, got ${ranking.length}`);
  }
  const rankOf = (club: string): number => {
    const index = ranking.indexOf(club);
    if (index < 0) {
      throw new Error(`Club ${club} is not ranked`);
    }
    return index;
  };
  const tie = (a: string, b: string): EuropeTie => (rankOf(a) <= rankOf(b) ? { home: a, away: b } : { home: b, away: a });
  const winnerOf = (inRound: number, a: string, b: string): string => {
    const found = played.find(
      (candidate) =>
        candidate.round === inRound &&
        ((candidate.home === a && candidate.away === b) || (candidate.home === b && candidate.away === a)),
    );
    if (found === undefined) {
      throw new Error(`Round ${inRound} has no tie played between ${a} and ${b}`);
    }
    return found.winner;
  };

  const playoffs = PLAYOFFS.map(([a, b]) => tie(ranking[a], ranking[b]));
  if (round === EUROPE_PLAYOFF_ROUND) {
    return playoffs;
  }
  // The 1st against the winner of the last play-off (8th-9th), … the 4th against the first's (5th-12th).
  const quarterFinals = [0, 1, 2, 3].map((index) => {
    const playoff = playoffs[PLAYOFFS.length - 1 - index];
    return tie(ranking[index], winnerOf(EUROPE_PLAYOFF_ROUND, playoff.home, playoff.away));
  });
  if (round === EUROPE_QUARTER_FINAL_ROUND) {
    return quarterFinals;
  }
  const through = (inRound: number, match: EuropeTie): string => winnerOf(inRound, match.home, match.away);
  const semiFinals = [
    tie(through(EUROPE_QUARTER_FINAL_ROUND, quarterFinals[0]), through(EUROPE_QUARTER_FINAL_ROUND, quarterFinals[3])),
    tie(through(EUROPE_QUARTER_FINAL_ROUND, quarterFinals[1]), through(EUROPE_QUARTER_FINAL_ROUND, quarterFinals[2])),
  ];
  if (round === EUROPE_SEMI_FINAL_ROUND) {
    return semiFinals;
  }
  if (round === EUROPE_FINAL_ROUND) {
    return [tie(through(EUROPE_SEMI_FINAL_ROUND, semiFinals[0]), through(EUROPE_SEMI_FINAL_ROUND, semiFinals[1]))];
  }
  throw new RangeError(`No knockout round ${round}`);
}

/** A competition's prizes (EUROPE_PRIZES). */
export function europePrizes(code: EuropeCode): EuropePrizes {
  return EUROPE_PRIZES[code];
}

/**
 * What a European match earns a club, in euros: a league phase win; a play-off won, the quarter-finals' place; a quarter-
 * or semi-final won; the final, won or lost. A draw or a defeat earns nothing, but in the final. The league phase's first
 * four get the quarter-finals' place once it is over (europePrizes(code).quarterFinalQualification), the participation
 * at the opening.
 */
export function europeMatchPrize(code: EuropeCode, round: number, won: boolean): number {
  const prizes = europePrizes(code);
  if (round >= 1 && round <= EUROPE_LEAGUE_ROUNDS) {
    return won ? prizes.leagueWin : 0;
  }
  switch (round) {
    case EUROPE_PLAYOFF_ROUND:
      return won ? prizes.quarterFinalQualification : 0;
    case EUROPE_QUARTER_FINAL_ROUND:
      return won ? prizes.quarterFinalWin : 0;
    case EUROPE_SEMI_FINAL_ROUND:
      return won ? prizes.semiFinalWin : 0;
    case EUROPE_FINAL_ROUND:
      return won ? prizes.finalWin : prizes.finalLoss;
    default:
      throw new RangeError(`No European round ${round}`);
  }
}

/** The stage a knockout round brings its clubs to (EUROPE_STAGES). */
export function stageOfRound(round: number): number {
  switch (round) {
    case EUROPE_PLAYOFF_ROUND:
      return EUROPE_STAGES.PLAYOFF;
    case EUROPE_QUARTER_FINAL_ROUND:
      return EUROPE_STAGES.QUARTER_FINAL;
    case EUROPE_SEMI_FINAL_ROUND:
      return EUROPE_STAGES.SEMI_FINAL;
    case EUROPE_FINAL_ROUND:
      return EUROPE_STAGES.FINAL;
    default:
      return EUROPE_STAGES.LEAGUE;
  }
}

/** A club's European season: the stage it reached, and whether it is out (it may still be in at the stage it reached). */
export type EuropeRun = { stage: number; out: boolean };

/**
 * A club's European run from its competition's state: the league phase's ranking once it is over (null before), and the
 * knockout matches drawn, played or not. The stage is the furthest it reached (the quarter-finals for the league phase's
 * first four, the title once the final is won); out after a knockout tie lost, or below the 12th place.
 */
export function europeRunOf(
  club: string,
  ranking: readonly string[] | null,
  knockout: readonly (EuropeTie & { round: number; winner: string | null })[],
): EuropeRun {
  const own = knockout.filter((match) => match.home === club || match.away === club);
  const furthest = Math.max(0, ...own.map((match) => match.round));
  const lost = own.some((match) => match.winner !== null && match.winner !== club);
  const won = own.some((match) => match.round === EUROPE_FINAL_ROUND && match.winner === club);
  let stage: number = furthest === 0 ? EUROPE_STAGES.LEAGUE : stageOfRound(furthest);
  let out = lost;
  if (ranking !== null) {
    const rank = ranking.indexOf(club) + 1;
    if (rank >= 1 && rank <= EUROPE_DIRECT_PLACES) {
      stage = Math.max(stage, EUROPE_STAGES.QUARTER_FINAL);
    } else if (rank >= 1 && rank <= EUROPE_PLAYOFF_PLACES) {
      stage = Math.max(stage, EUROPE_STAGES.PLAYOFF);
    } else {
      out = true;
    }
  }
  return won ? { stage: EUROPE_STAGES.WON, out: false } : { stage, out };
}

/** What a European run adds to a club's reputation target at the end of the season (EUROPE_REPUTATION_BONUS). */
export function europeReputationBonus(code: EuropeCode, stage: number): number {
  return EUROPE_REPUTATION_BONUS[code].find((step) => stage >= step.stage)?.bonus ?? 0;
}

/**
 * The managed club's European objective, by its reputation third among its competition's clubs at the opening: the
 * semi-finals, the quarter-finals or the play-offs (EUROPE_OBJECTIVE_STAGES), exceeded two stages further (the title,
 * the final, the semi-finals).
 */
export function europeObjective(third: 1 | 2 | 3): { target: number; exceed: number } {
  const target = EUROPE_OBJECTIVE_STAGES[third - 1];
  return { target, exceed: target + EUROPE_OBJECTIVE_EXCEEDED_STAGES };
}
