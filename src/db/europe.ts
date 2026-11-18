import * as z from "zod";
import { CUP_ROUNDS } from "../engine/balance";
import {
  drawLeaguePhase,
  europeDates,
  europeDrawRngSeed,
  europeMatchPrize,
  europePrizes,
  europePrizesOf,
  europeReputationBonus,
  europeRunOf,
  EUROPE_DIRECT_PLACES,
  EUROPE_FINAL_ROUND,
  EUROPE_LEAGUE_ROUNDS,
  EUROPE_STAGES,
  isEuropeCode,
  knockoutTies,
  leaguePhaseTable,
  qualifyForEurope,
  type CountryQualifiers,
  type EuropeCode,
  type EuropeEntrant,
  type EuropeRun,
  type EuropeTableRow,
  type EuropeTie,
  wonEuropeMatch,
} from "../engine/europe";
import { countryOf } from "../engine/promotion";
import { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { seasonHasBreaks } from "./nations";
import type { FinalTables } from "./promotion";

// The European competitions of a worldVersion 2 save (docs/design/europe.md): a Season for each and each year, its
// clubs kept on it (Season.entrants), its league phase drawn at the opening, then each knockout round as soon as the
// one before is over, inside the transaction that plays its last match. Clubs are keyed by slug in every draw and
// table: ids differ from one database to another, and no draw may depend on them.

type Db = Prisma.TransactionClient;

const entrantSchema = z.object({
  club: z.string().min(1),
  country: z.string().min(1),
  pot: z.number().int().min(1).max(4),
  path: z.enum(["RANK", "CUP"]),
  tier: z.union([z.literal(1), z.literal(2)]),
  rank: z.number().int().min(1),
  reputation: z.number().int(),
});

/** Season.entrants: a European season's clubs, as qualifyForEurope gave them. */
export const europeEntrantsSchema = z.array(entrantSchema);

export class InvalidEuropeEntrantsError extends Error {
  constructor(seasonId: string, cause: unknown) {
    super(`European season ${seasonId} has invalid entrants`, { cause });
    this.name = "InvalidEuropeEntrantsError";
  }
}

/** A European season's entrants read back, validated: malformed ones are an error, never a competition silently changed. */
export function parseEuropeEntrants(seasonId: string, value: unknown): EuropeEntrant[] {
  const parsed = europeEntrantsSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidEuropeEntrantsError(seasonId, parsed.error);
  }
  return parsed.data;
}

/** A country's cup winner of the season closed, with its division then and its rank there. */
export type CupWinner = NonNullable<CountryQualifiers["cupWinner"]>;

/**
 * The cups' winners of the season being closed, by country, inside advanceToNextSeason's transaction: the winner of each
 * cup final played, with its division and rank in the final tables. None without a cup that season.
 */
export async function cupWinnersOf(tx: Db, saveId: string, cupSeasonIds: readonly string[], tables: FinalTables): Promise<Map<string, CupWinner>> {
  if (cupSeasonIds.length === 0) {
    return new Map();
  }
  const finals = await tx.fixture.findMany({
    where: { saveId, seasonId: { in: [...cupSeasonIds] }, round: CUP_ROUNDS, played: true },
    select: { season: { select: { competition: { select: { code: true } } } }, winnerClubSave: { select: { club: { select: { slug: true } } } } },
  });
  const placeOf = new Map(
    tables.standings.flatMap((standing) => standing.table.map((row) => [row.club, { tier: standing.tier, rank: row.rank }] as const)),
  );
  return new Map(
    finals.flatMap((final) => {
      const club = final.winnerClubSave?.club.slug;
      const place = club === undefined ? undefined : placeOf.get(club);
      return club === undefined || place === undefined ? [] : [[countryOf(final.season.competition.code), { club, ...place }] as const];
    }),
  );
}

/** Each country's qualifiers from the final tables of the season being closed and its cup winner. */
export function europeQualifiersOf(tables: FinalTables, cupWinners: ReadonlyMap<string, CupWinner>): CountryQualifiers[] {
  return tables.standings
    .filter((standing) => standing.tier === 1)
    .map((standing) => {
      const country = countryOf(standing.code);
      return {
        country,
        table: [...standing.table].sort((a, b) => a.rank - b.rank).map((row) => row.club),
        cupWinner: cupWinners.get(country) ?? null,
      };
    });
}

export type OpenEuropeInput = {
  saveId: string;
  saveSeed: string;
  startYear: number;
  withBreaks: boolean; // a season with international breaks: its rounds on europeDates' weeks of such a season
  qualifiers: readonly CountryQualifiers[];
};

/**
 * Opens the season's European competitions, inside createSave's or advanceToNextSeason's transaction, once the clubs'
 * reputations of the season are set: a Season for each competition, with its clubs (Season.entrants, qualifyForEurope:
 * their reputation now breaks the league phase's last ties), its whole league phase drawn (drawLeaguePhase, the season's
 * own stream for each competition), and each club's participation prize credited. Returns the number of matches drawn.
 */
export async function openEurope(tx: Db, { saveId, saveSeed, startYear, withBreaks, qualifiers }: OpenEuropeInput): Promise<number> {
  const competitions = await tx.competition.findMany({ where: { kind: "EUROPE" }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  const slugs = qualifiers.flatMap((country) => country.table.slice(0, 7).concat(country.cupWinner === null ? [] : [country.cupWinner.club]));
  const clubs = await tx.clubSave.findMany({
    where: { saveId, club: { slug: { in: slugs } } },
    select: { id: true, reputation: true, club: { select: { slug: true } } },
  });
  const clubBySlug = new Map(clubs.map((club) => [club.club.slug, club]));
  const entrants = qualifyForEurope(qualifiers, (slug) => getOrThrow(clubBySlug, slug, "European club").reputation);

  const fixtures: Prisma.FixtureCreateManyInput[] = [];
  const prizes: { clubSaveId: string; prize: number }[] = [];
  const dates = europeDates(startYear, withBreaks);
  for (const competition of competitions) {
    if (!isEuropeCode(competition.code)) {
      throw new Error(`Unknown European competition ${competition.code}`);
    }
    const code = competition.code;
    const ofCompetition = entrants[code];
    const season = await tx.season.create({
      data: { saveId, competitionId: competition.id, startYear, entrants: ofCompetition },
      select: { id: true },
    });
    const matches = drawLeaguePhase(ofCompetition, makeRng(europeDrawRngSeed(saveSeed, startYear, code)));
    for (const match of matches) {
      fixtures.push({
        saveId,
        seasonId: season.id,
        round: match.round,
        scheduledAt: dates[match.round - 1],
        homeClubSaveId: getOrThrow(clubBySlug, match.home, "European club").id,
        awayClubSaveId: getOrThrow(clubBySlug, match.away, "European club").id,
      });
    }
    for (const entrant of ofCompetition) {
      prizes.push({ clubSaveId: getOrThrow(clubBySlug, entrant.club, "European club").id, prize: europePrizes(code).participation });
    }
  }
  await tx.fixture.createMany({ data: fixtures });
  await creditPrizes(tx, saveId, prizes);
  return fixtures.length;
}

/** Adds prizes to the clubs' budgets, in one statement: a club may appear several times. */
async function creditPrizes(tx: Db, saveId: string, prizes: readonly { clubSaveId: string; prize: number }[]): Promise<void> {
  const byClub = new Map<string, number>();
  for (const { clubSaveId, prize } of prizes) {
    if (prize > 0) {
      byClub.set(clubSaveId, (byClub.get(clubSaveId) ?? 0) + prize);
    }
  }
  if (byClub.size === 0) {
    return;
  }
  await tx.$executeRaw`
    UPDATE "ClubSave" AS c
    SET "budget" = c."budget" + v."prize"
    FROM (VALUES ${Prisma.join([...byClub].map(([id, prize]) => Prisma.sql`(${id}::text, ${prize}::int)`))}) AS v("id", "prize")
    WHERE c."id" = v."id" AND c."saveId" = ${saveId}`;
}

const MATCH_CLUB_SELECT = { select: { id: true, club: { select: { slug: true } } } } as const;

/** A match of a European season, by slug, as its table and its bracket read it. */
export type EuropeFixtureRow = {
  round: number;
  played: boolean;
  home: string;
  away: string;
  homeClubSaveId: string;
  awayClubSaveId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  winner: string | null; // a knockout tie's club through, once played
};

/** A European season's matches, by slug. */
export async function europeFixtures(db: Db, saveId: string, seasonId: string): Promise<EuropeFixtureRow[]> {
  const rows = await db.fixture.findMany({
    where: { saveId, seasonId },
    orderBy: [{ round: "asc" }, { scheduledAt: "asc" }, { id: "asc" }],
    select: {
      round: true,
      played: true,
      homeGoals: true,
      awayGoals: true,
      homeClubSave: MATCH_CLUB_SELECT,
      awayClubSave: MATCH_CLUB_SELECT,
      winnerClubSave: MATCH_CLUB_SELECT,
    },
  });
  return rows.map((row) => ({
    round: row.round,
    played: row.played,
    home: row.homeClubSave.club.slug,
    away: row.awayClubSave.club.slug,
    homeClubSaveId: row.homeClubSave.id,
    awayClubSaveId: row.awayClubSave.id,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    winner: row.winnerClubSave?.club.slug ?? null,
  }));
}

/** The league phase's table of a European season's matches (leaguePhaseTable), its played league phase matches only. */
export function leaguePhaseTableOf(entrants: readonly EuropeEntrant[], fixtures: readonly EuropeFixtureRow[]): EuropeTableRow[] {
  return leaguePhaseTable(
    entrants,
    fixtures.flatMap((fixture) =>
      fixture.round <= EUROPE_LEAGUE_ROUNDS && fixture.played && fixture.homeGoals !== null && fixture.awayGoals !== null
        ? [{ home: fixture.home, away: fixture.away, homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals }]
        : [],
    ),
  );
}

/** A club's line in a European season's league phase, by its row: its country (its league's prefix), rank and points. */
export type EuropeStanding = { clubSaveId: string; club: string; country: string; rank: number; points: number; played: number };

/** A European season's league phase table, its clubs by row, as the dashboard and the next match's stake read it. */
export async function europeLeagueStandings(db: Db, saveId: string, seasonId: string): Promise<EuropeStanding[]> {
  const season = await db.season.findFirstOrThrow({ where: { id: seasonId, saveId }, select: { entrants: true } });
  const entrants = parseEuropeEntrants(seasonId, season.entrants);
  const fixtures = await europeFixtures(db, saveId, seasonId);
  const clubSaveIdOf = clubSaveIds(fixtures);
  const countryOfClub = new Map(entrants.map((entrant) => [entrant.club, entrant.country]));
  return leaguePhaseTableOf(entrants, fixtures).map((row) => ({
    clubSaveId: getOrThrow(clubSaveIdOf, row.club, "European club"),
    club: row.club,
    country: countryOfClub.get(row.club) ?? "",
    rank: row.rank,
    points: row.points,
    played: row.played,
  }));
}

/** Whether a European season's league phase is over: every match of its six rounds played. */
export function leaguePhaseOver(fixtures: readonly EuropeFixtureRow[]): boolean {
  const league = fixtures.filter((fixture) => fixture.round <= EUROPE_LEAGUE_ROUNDS);
  return league.length > 0 && league.every((fixture) => fixture.played);
}

/** The knockout ties played so far, with their winners, as knockoutTies reads them. */
function playedTies(fixtures: readonly EuropeFixtureRow[]) {
  return fixtures.flatMap((fixture) =>
    fixture.round > EUROPE_LEAGUE_ROUNDS && fixture.played && fixture.winner !== null
      ? [{ round: fixture.round, home: fixture.home, away: fixture.away, winner: fixture.winner }]
      : [],
  );
}

/**
 * After European matches are played, inside the transaction that played them (playNextMatchday, advanceLiveMatch): each
 * club is credited what its match earned (europeMatchPrize), and each competition whose round is now over gets its next
 * one: at the end of the league phase, the first four's quarter-final prize and the play-offs, then each knockout round
 * of the fixed bracket (knockoutTies), on its date. Matches of other competitions among fixtureIds are ignored.
 */
export async function progressEurope(tx: Db, saveId: string, fixtureIds: readonly string[]): Promise<void> {
  if (fixtureIds.length === 0) {
    return;
  }
  const matches = await tx.fixture.findMany({
    where: { saveId, id: { in: [...fixtureIds] }, played: true, season: { competition: { kind: "EUROPE" } } },
    select: {
      round: true,
      homeClubSaveId: true,
      awayClubSaveId: true,
      homeGoals: true,
      awayGoals: true,
      winnerClubSaveId: true,
      season: { select: { id: true, startYear: true, entrants: true, competition: { select: { code: true } } } },
    },
  });
  if (matches.length === 0) {
    return;
  }

  const prizes: { clubSaveId: string; prize: number }[] = [];
  for (const match of matches) {
    const code = europeCodeOf(match.season.competition.code);
    for (const [clubSaveId, scored, conceded] of [
      [match.homeClubSaveId, match.homeGoals, match.awayGoals],
      [match.awayClubSaveId, match.awayGoals, match.homeGoals],
    ] as const) {
      const won = wonEuropeMatch(match.round, scored, conceded, match.winnerClubSaveId === clubSaveId);
      prizes.push({ clubSaveId, prize: europeMatchPrize(code, match.round, won) });
    }
  }

  const rounds = new Map(
    matches
      .filter((match) => match.round < EUROPE_FINAL_ROUND)
      .map((match) => [`${match.season.id}#${match.round}`, { round: match.round, season: match.season }]),
  );
  for (const { round, season } of rounds.values()) {
    // One after the other: the transaction's queries share its connection.
    const fixtures = await europeFixtures(tx, saveId, season.id);
    const next = round <= EUROPE_LEAGUE_ROUNDS ? EUROPE_LEAGUE_ROUNDS + 1 : round + 1;
    if (fixtures.some((fixture) => fixture.round === next)) {
      continue;
    }
    const over =
      round <= EUROPE_LEAGUE_ROUNDS ? leaguePhaseOver(fixtures) : fixtures.filter((fixture) => fixture.round === round).every((fixture) => fixture.played);
    if (!over) {
      continue;
    }
    const code = europeCodeOf(season.competition.code);
    const entrants = parseEuropeEntrants(season.id, season.entrants);
    const ranking = leaguePhaseTableOf(entrants, fixtures).map((row) => row.club);
    const clubSaveIdOf = clubSaveIds(fixtures);
    if (round <= EUROPE_LEAGUE_ROUNDS) {
      // The league phase's first four are in the quarter-finals.
      for (const club of ranking.slice(0, EUROPE_DIRECT_PLACES)) {
        prizes.push({ clubSaveId: getOrThrow(clubSaveIdOf, club, "European club"), prize: europePrizes(code).quarterFinalQualification });
      }
    }
    const ties = knockoutTies(next, ranking, playedTies(fixtures));
    // The round's date: that of a season with or without international breaks (Save.breaksFrom).
    const { breaksFrom } = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { breaksFrom: true } });
    const date = europeDates(season.startYear, seasonHasBreaks(breaksFrom, season.startYear))[next - 1];
    await tx.fixture.createMany({ data: tieRows(saveId, season.id, next, date, ties, clubSaveIdOf) });
  }
  await creditPrizes(tx, saveId, prizes);
}

/** A European competition's code, checked. */
export function europeCodeOf(code: string): EuropeCode {
  if (!isEuropeCode(code)) {
    throw new Error(`Not a European competition: ${code}`);
  }
  return code;
}

/** Each club of a European season's matches by slug. */
function clubSaveIds(fixtures: readonly EuropeFixtureRow[]): Map<string, string> {
  return new Map(fixtures.flatMap((fixture) => [[fixture.home, fixture.homeClubSaveId] as const, [fixture.away, fixture.awayClubSaveId] as const]));
}

function tieRows(
  saveId: string,
  seasonId: string,
  round: number,
  scheduledAt: Date,
  ties: readonly EuropeTie[],
  clubSaveIdBySlug: ReadonlyMap<string, string>,
): Prisma.FixtureCreateManyInput[] {
  return ties.map((tie) => ({
    saveId,
    seasonId,
    round,
    scheduledAt,
    homeClubSaveId: getOrThrow(clubSaveIdBySlug, tie.home, "European club"),
    awayClubSaveId: getOrThrow(clubSaveIdBySlug, tie.away, "European club"),
  }));
}

/**
 * Each club's run in a European season (europeRunOf), by slug: the stage it reached and whether it is out, from the
 * league phase's ranking once it is over and the knockout matches drawn.
 */
export function europeRunsOf(entrants: readonly EuropeEntrant[], fixtures: readonly EuropeFixtureRow[]): Map<string, EuropeRun> {
  const ranking = leaguePhaseOver(fixtures) ? leaguePhaseTableOf(entrants, fixtures).map((row) => row.club) : null;
  const knockout = fixtures.filter((fixture) => fixture.round > EUROPE_LEAGUE_ROUNDS);
  return new Map(entrants.map((entrant) => [entrant.club, europeRunOf(entrant.club, ranking, knockout)]));
}

/** A European season of a save, as its readers need it: its code, year and clubs. */
export type EuropeSeasonRef = { id: string; startYear: number; code: EuropeCode; entrants: EuropeEntrant[] };

/** The European seasons among some seasons of a save, with their clubs. */
export async function europeSeasonsOf(db: Db, saveId: string, seasonIds: readonly string[]): Promise<EuropeSeasonRef[]> {
  if (seasonIds.length === 0) {
    return [];
  }
  const seasons = await db.season.findMany({
    where: { saveId, id: { in: [...seasonIds] }, competition: { kind: "EUROPE" } },
    orderBy: { competition: { code: "asc" } },
    select: { id: true, startYear: true, entrants: true, competition: { select: { code: true } } },
  });
  return seasons.map((season) => ({
    id: season.id,
    startYear: season.startYear,
    code: europeCodeOf(season.competition.code),
    entrants: parseEuropeEntrants(season.id, season.entrants),
  }));
}

/**
 * What the European seasons being closed add to each club's reputation target (europeReputationBonus on its run), by
 * club row, inside advanceToNextSeason's transaction. Empty without a European season.
 */
export async function europeReputationBonuses(tx: Db, saveId: string, seasonIds: readonly string[]): Promise<Map<string, number>> {
  const bonuses = new Map<string, number>();
  for (const season of await europeSeasonsOf(tx, saveId, seasonIds)) {
    const fixtures = await europeFixtures(tx, saveId, season.id);
    const clubSaveIdOf = clubSaveIds(fixtures);
    for (const [club, run] of europeRunsOf(season.entrants, fixtures)) {
      const bonus = europeReputationBonus(season.code, run.stage);
      if (bonus > 0) {
        bonuses.set(getOrThrow(clubSaveIdOf, club, "European club"), bonus);
      }
    }
  }
  return bonuses;
}

/** A club's European season: its competition, the stage it reached, whether it is out, and whether it won it. */
export type ClubEuropeRun = { code: EuropeCode; seasonId: string; stage: number; out: boolean; won: boolean };

/**
 * A club's run among some European seasons of a save (it plays one at most a season), by its row; null when it plays
 * none of them.
 */
export async function clubEuropeRun(db: Db, saveId: string, clubSaveId: string, seasonIds: readonly string[]): Promise<ClubEuropeRun | null> {
  for (const season of await europeSeasonsOf(db, saveId, seasonIds)) {
    const fixtures = await europeFixtures(db, saveId, season.id);
    const slug = fixtures.find((fixture) => fixture.homeClubSaveId === clubSaveId)?.home ?? fixtures.find((fixture) => fixture.awayClubSaveId === clubSaveId)?.away;
    if (slug === undefined) {
      continue;
    }
    const run = europeRunsOf(season.entrants, fixtures).get(slug);
    if (run !== undefined) {
      return { code: season.code, seasonId: season.id, stage: run.stage, out: run.out, won: run.stage === EUROPE_STAGES.WON };
    }
  }
  return null;
}

/**
 * What a club has received from its European season among some seasons of a save (europePrizesOf: what openEurope and
 * progressEurope credited it so far), by its row, with the competition; null when it plays none of them.
 */
export async function clubEuropePrizes(
  db: Db,
  saveId: string,
  clubSaveId: string,
  seasonIds: readonly string[],
): Promise<{ code: EuropeCode; amount: number } | null> {
  for (const season of await europeSeasonsOf(db, saveId, seasonIds)) {
    const fixtures = await europeFixtures(db, saveId, season.id);
    const slug = fixtures.find((fixture) => fixture.homeClubSaveId === clubSaveId)?.home ?? fixtures.find((fixture) => fixture.awayClubSaveId === clubSaveId)?.away;
    if (slug === undefined) {
      continue;
    }
    // The league phase's first four were paid the quarter-finals' place when it ended (progressEurope).
    const directPlace =
      leaguePhaseOver(fixtures) &&
      leaguePhaseTableOf(season.entrants, fixtures)
        .slice(0, EUROPE_DIRECT_PLACES)
        .some((row) => row.club === slug);
    return { code: season.code, amount: europePrizesOf(season.code, slug, fixtures, directPlace) };
  }
  return null;
}
