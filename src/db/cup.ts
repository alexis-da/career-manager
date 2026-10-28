import { CUP_ROUNDS } from "../engine/balance";
import { cupDates, cupDrawRngSeed, cupPrize, nextRoundTies, preliminaryTies, type CupEntrant, type CupTie } from "../engine/cup";
import { countryOf } from "../engine/promotion";
import { Prisma } from "../generated/prisma/client";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import type { FinalTables } from "./promotion";

// The national cups of a worldVersion 2 save: a Season per cup and per year, opened with its preliminary round, then a
// round drawn as soon as the previous one is over, inside the transaction that plays its last tie. Clubs are keyed by
// slug in every draw: ids differ from one database to another, and no draw may depend on them.

type Db = Prisma.TransactionClient;

/** A club entering the cups of a season, ranked by its last season (preliminaryTies). */
export type CupEntrantRow = CupEntrant & { clubSaveId: string; country: string };

/** The next cups' entrants from the final tables of the season just closed: each club's division then and rank. */
export function cupEntrantsOf({ standings, clubBySlug }: FinalTables): CupEntrantRow[] {
  return standings.flatMap((standing) =>
    standing.table.map((row) => ({
      club: row.club,
      tier: standing.tier,
      rank: row.rank,
      clubSaveId: getOrThrow(clubBySlug, row.club, "club of the table").clubSaveId,
      country: countryOf(standing.code),
    })),
  );
}

export type OpenCupsInput = {
  saveId: string;
  saveSeed: string;
  startYear: number;
  entrants: readonly CupEntrantRow[];
};

function tieRows(
  saveId: string,
  seasonId: string,
  round: number,
  scheduledAt: Date,
  ties: readonly CupTie[],
  clubSaveIdBySlug: ReadonlyMap<string, string>,
): Prisma.FixtureCreateManyInput[] {
  return ties.map((tie) => ({
    saveId,
    seasonId,
    round,
    scheduledAt,
    homeClubSaveId: getOrThrow(clubSaveIdBySlug, tie.home, "cup club"),
    awayClubSaveId: getOrThrow(clubSaveIdBySlug, tie.away, "cup club"),
  }));
}

/**
 * Opens the season's cups, inside createSave's or advanceToNextSeason's transaction: a Season for each cup competition,
 * and its preliminary round between the country's lowest clubs. Returns the number of ties created.
 */
export async function openCups(tx: Db, { saveId, saveSeed, startYear, entrants }: OpenCupsInput): Promise<number> {
  const cups = await tx.competition.findMany({ where: { kind: "CUP" }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  const seasons = await tx.season.createManyAndReturn({
    data: cups.map((cup) => ({ saveId, competitionId: cup.id, startYear })),
    select: { id: true, competitionId: true },
  });
  const codeById = new Map(cups.map((cup) => [cup.id, cup.code]));
  const entrantsByCountry = Map.groupBy(entrants, (entrant) => entrant.country);
  const clubSaveIdBySlug = new Map(entrants.map((entrant) => [entrant.club, entrant.clubSaveId]));
  const [preliminaryDate] = cupDates(startYear);

  const fixtures = seasons.flatMap((season) => {
    const code = getOrThrow(codeById, season.competitionId, "cup");
    const clubs = getOrThrow(entrantsByCountry, countryOf(code), "clubs of the cup");
    const ties = preliminaryTies(clubs, makeRng(cupDrawRngSeed(saveSeed, startYear, code, 1)));
    return tieRows(saveId, season.id, 1, preliminaryDate, ties, clubSaveIdBySlug);
  });
  await tx.fixture.createMany({ data: fixtures });
  return fixtures.length;
}

const TIE_CLUB_SELECT = { select: { club: { select: { slug: true } } } } as const;

/** Draws a cup's round once the previous one is over: the clubs that have lost no tie, on the round's date. */
async function drawRound(
  tx: Db,
  saveId: string,
  saveSeed: string,
  season: { id: string; startYear: number; code: string },
  round: number,
): Promise<void> {
  // One after the other: the transaction's queries share its connection. The country's clubs: a club changes division
  // only at the end of the season, after the final.
  const clubs = await tx.clubSave.findMany({
    where: { saveId, competition: { kind: "LEAGUE", code: { startsWith: `${countryOf(season.code)}.` } } },
    select: { id: true, club: { select: { slug: true } } },
  });
  const played = await tx.fixture.findMany({
    where: { saveId, seasonId: season.id, played: true },
    select: { round: true, homeClubSave: TIE_CLUB_SELECT, awayClubSave: TIE_CLUB_SELECT, winnerClubSave: TIE_CLUB_SELECT },
  });
  const ties = nextRoundTies(
    clubs.map((club) => club.club.slug),
    played.map((tie) => {
      if (tie.winnerClubSave === null) {
        throw new Error(`A played tie of cup season ${season.id} has no winner`);
      }
      return {
        round: tie.round,
        home: tie.homeClubSave.club.slug,
        away: tie.awayClubSave.club.slug,
        winner: tie.winnerClubSave.club.slug,
      };
    }),
    round - 1,
    makeRng(cupDrawRngSeed(saveSeed, season.startYear, season.code, round)),
  );
  const clubSaveIdBySlug = new Map(clubs.map((club) => [club.club.slug, club.id]));
  await tx.fixture.createMany({
    data: tieRows(saveId, season.id, round, cupDates(season.startYear)[round - 1], ties, clubSaveIdBySlug),
  });
}

/**
 * After cup ties are played, inside the transaction that played them (playNextMatchday, resumeLiveMatch): each club is
 * credited its prize (cupPrize), and each cup whose round is now over gets its next round drawn. Matches of the
 * leagues among fixtureIds are ignored.
 */
export async function progressCups(tx: Db, saveId: string, saveSeed: string, fixtureIds: readonly string[]): Promise<void> {
  if (fixtureIds.length === 0) {
    return;
  }
  const ties = await tx.fixture.findMany({
    where: { saveId, id: { in: [...fixtureIds] }, played: true, season: { competition: { kind: "CUP" } } },
    select: {
      round: true,
      homeClubSaveId: true,
      awayClubSaveId: true,
      winnerClubSaveId: true,
      season: { select: { id: true, startYear: true, competition: { select: { code: true } } } },
    },
  });
  if (ties.length === 0) {
    return;
  }

  const prizes = new Map<string, number>();
  for (const tie of ties) {
    for (const clubSaveId of [tie.homeClubSaveId, tie.awayClubSaveId]) {
      const prize = cupPrize(tie.round, clubSaveId === tie.winnerClubSaveId);
      if (prize > 0) {
        prizes.set(clubSaveId, (prizes.get(clubSaveId) ?? 0) + prize);
      }
    }
  }
  if (prizes.size > 0) {
    await tx.$executeRaw`
      UPDATE "ClubSave" AS c
      SET "budget" = c."budget" + v."prize"
      FROM (VALUES ${Prisma.join([...prizes].map(([id, prize]) => Prisma.sql`(${id}::text, ${prize}::int)`))}) AS v("id", "prize")
      WHERE c."id" = v."id" AND c."saveId" = ${saveId}`;
  }

  const rounds = new Map(
    ties
      .filter((tie) => tie.round < CUP_ROUNDS)
      .map((tie) => [`${tie.season.id}#${tie.round}`, { round: tie.round, season: tie.season }]),
  );
  for (const { round, season } of rounds.values()) {
    // One after the other: the transaction's queries share its connection.
    const unplayed = await tx.fixture.count({ where: { saveId, seasonId: season.id, round, played: false } });
    const drawn = await tx.fixture.count({ where: { saveId, seasonId: season.id, round: round + 1 } });
    if (unplayed === 0 && drawn === 0) {
      await drawRound(tx, saveId, saveSeed, { id: season.id, startYear: season.startYear, code: season.competition.code }, round + 1);
    }
  }
}
