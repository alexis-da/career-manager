import { cupRunOf, type CupRun } from "../engine/cup";
import { EUROPE_STAGES } from "../engine/europe";
import type { Position } from "../engine/positions";
import type { MoveReason } from "../engine/promotion";
import {
  buildSeasonResult,
  CHAMPION_TROPHY,
  clubAtDate,
  CUP_TROPHY,
  EUROPE_TROPHY,
  type SeasonPlayerLine,
  type SeasonResultData,
} from "../engine/season-result";
import { computeStandings } from "../engine/standings";
import { seasonEndDate } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { getOrThrow } from "../lib/maps";
import { prisma } from "./client";
import { clubEuropeRun, type ClubEuropeRun } from "./europe";
import type { SeasonMove } from "./promotion";
import { clubOf, clubsOfSave, readArchivedSeason } from "./season-archive";

type Db = Prisma.TransactionClient;

type SeasonRef = { id: string; startYear: number; competitionId: string };

type ManagedClub = {
  id: string;
  clubId: string;
  slug: string;
  formation: string;
  competitionId: string; // the club's current competition in the save
  primaryColor: string;
  secondaryColor: string;
};

async function managedClubOf(db: Db, saveId: string): Promise<ManagedClub> {
  const managed = await db.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: {
      id: true,
      clubId: true,
      formation: true,
      competitionId: true,
      club: { select: { slug: true, primaryColor: true, secondaryColor: true } },
    },
  });
  return {
    id: managed.id,
    clubId: managed.clubId,
    slug: managed.club.slug,
    formation: managed.formation,
    competitionId: managed.competitionId,
    primaryColor: managed.club.primaryColor,
    secondaryColor: managed.club.secondaryColor,
  };
}

const RESULT_CLUB_SELECT = { select: { clubId: true, club: { select: { slug: true } } } } as const;

const RESULT_PLAYER_SELECT = {
  id: true,
  playerKey: true,
  firstName: true,
  lastName: true,
  position: true,
  clubSave: { select: { clubId: true } },
} as const;

type ResultFixture = {
  id: string;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  homeClubSave: { clubId: string; club: { slug: string } };
  awayClubSave: { clubId: string; club: { slug: string } };
};

type ResultStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  playerSave: { id: string; playerKey: string; firstName: string; lastName: string; position: Position; clubSave: { clubId: string } | null };
};

/**
 * A season's fixtures and statistics: from its archive once it has one (src/db/season-archive.ts), from its rows
 * otherwise. One query after the other: in a transaction, its queries share its connection.
 */
async function seasonRows(db: Db, saveId: string, seasonId: string): Promise<{ fixtures: ResultFixture[]; stats: ResultStats[] }> {
  const archived = await readArchivedSeason(db, saveId, seasonId, { stats: true });
  if (archived !== null) {
    const clubs = await clubsOfSave(
      db,
      saveId,
      archived.fixtures.flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]),
    );
    const players = await db.playerSave.findMany({
      where: { saveId, id: { in: archived.stats.map((line) => line.playerSaveId) } },
      select: RESULT_PLAYER_SELECT,
    });
    const playerById = new Map(players.map((player) => [player.id, player]));
    return {
      fixtures: archived.fixtures.map((fixture, index) => ({
        id: `${seasonId}#${index}`,
        played: fixture.played,
        homeGoals: fixture.homeGoals,
        awayGoals: fixture.awayGoals,
        homeClubSave: clubOf(clubs, fixture.homeClubSaveId),
        awayClubSave: clubOf(clubs, fixture.awayClubSaveId),
      })),
      stats: archived.stats.map(({ playerSaveId, appearances, minutes, goals, assists, yellowCards, redCards }) => ({
        appearances,
        minutes,
        goals,
        assists,
        yellowCards,
        redCards,
        playerSave: getOrThrow(playerById, playerSaveId, "archived player"),
      })),
    };
  }
  const fixtures = await db.fixture.findMany({
    where: { saveId, seasonId },
    select: {
      id: true,
      played: true,
      homeGoals: true,
      awayGoals: true,
      homeClubSave: RESULT_CLUB_SELECT,
      awayClubSave: RESULT_CLUB_SELECT,
    },
  });
  const stats = await db.playerSeasonStats.findMany({
    where: { saveId, seasonId },
    select: {
      appearances: true,
      minutes: true,
      goals: true,
      assists: true,
      yellowCards: true,
      redCards: true,
      playerSave: { select: RESULT_PLAYER_SELECT },
    },
  });
  return { fixtures, stats };
}

/**
 * The managed club's season, from the database as it stands: the final table from the season's fixtures, the
 * statistics of the players who were at the club at the end of the season (their club then is rebuilt from the
 * transfers dated after it, so it holds for a season long over), and the club's formation now. The season's clubs are
 * the ones of its fixtures, whatever their competition now. null when the club played none of them.
 */
async function computeSeasonResult(db: Db, saveId: string, managed: ManagedClub, season: SeasonRef): Promise<SeasonResultData | null> {
  const { fixtures, stats } = await seasonRows(db, saveId, season.id);

  const clubs = fixtures.flatMap(({ homeClubSave, awayClubSave }) => [homeClubSave, awayClubSave]);
  const managedSlug = clubs.find(({ clubId }) => clubId === managed.clubId)?.club.slug;
  if (managedSlug === undefined) {
    return null;
  }
  const scores = fixtures
    .filter((fixture) => fixture.played)
    .map(({ id, homeGoals, awayGoals, homeClubSave, awayClubSave }) => {
      if (homeGoals === null || awayGoals === null) {
        throw new Error(`Fixture ${id} is played but has no score`);
      }
      return { home: homeClubSave.club.slug, away: awayClubSave.club.slug, homeGoals, awayGoals };
    });
  const table = computeStandings(scores, [...new Set(clubs.map(({ club }) => club.slug))]);
  const standing = table.find((row) => row.club === managedSlug);
  if (standing === undefined) {
    throw new Error(`Club ${managedSlug} is missing from its own table`);
  }

  const seasonEnd = seasonEndDate(season.startYear);
  const moves = await db.transfer.findMany({
    where: { saveId, date: { gt: seasonEnd }, playerSaveId: { in: stats.map((row) => row.playerSave.id) } },
    select: { playerSaveId: true, date: true, fromClubId: true, toClubId: true },
  });
  const movesByPlayer = Map.groupBy(moves, (move) => move.playerSaveId);

  const lines: SeasonPlayerLine[] = stats
    .filter(
      ({ playerSave }) =>
        clubAtDate(playerSave.clubSave?.clubId ?? null, movesByPlayer.get(playerSave.id) ?? []) === managed.clubId,
    )
    .map(({ playerSave, ...line }) => ({
      ...line,
      playerKey: playerSave.playerKey,
      name: `${playerSave.firstName} ${playerSave.lastName}`,
      position: playerSave.position,
    }));

  return buildSeasonResult(standing, lines, { formation: managed.formation });
}

function seasonResultRow(
  saveId: string,
  season: SeasonRef,
  result: SeasonResultData,
  move: MoveReason | null,
  cup: CupRun | null,
  europe: ClubEuropeRun | null,
): Prisma.SeasonResultCreateManyInput {
  const { bestPlayer, trophies, ...line } = result;
  return {
    ...line,
    trophies: [...trophies, ...(cup?.won === true ? [CUP_TROPHY] : []), ...(europe?.won === true ? [EUROPE_TROPHY] : [])],
    cupRound: cup?.round ?? null,
    // The stage reached, the final for its winner, who has the trophy.
    europeCode: europe?.code ?? null,
    europeStage: europe === null ? null : Math.min(europe.stage, EUROPE_STAGES.FINAL),
    saveId,
    seasonId: season.id,
    competitionId: season.competitionId,
    promoted: move === "PROMOTED",
    relegated: move === "RELEGATED",
    bestPlayerKey: bestPlayer?.playerKey ?? null,
    bestPlayerName: bestPlayer?.name ?? null,
    bestPlayerPosition: bestPlayer?.position ?? null,
    bestPlayerGoals: bestPlayer?.goals ?? null,
    bestPlayerAssists: bestPlayer?.assists ?? null,
    bestPlayerRating: bestPlayer?.rating ?? null,
  };
}

const CUP_TIE_CLUB_SELECT = { select: { club: { select: { slug: true } } } } as const;

/** The managed club's run in the cups of the seasons closing (none in a worldVersion 1 save, or before the cups). */
async function cupRunOfClub(tx: Db, saveId: string, clubSaveId: string, slug: string, cupSeasonIds: readonly string[]): Promise<CupRun | null> {
  if (cupSeasonIds.length === 0) {
    return null;
  }
  const ties = await tx.fixture.findMany({
    where: {
      saveId,
      seasonId: { in: [...cupSeasonIds] },
      played: true,
      OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }],
    },
    select: { round: true, homeClubSave: CUP_TIE_CLUB_SELECT, awayClubSave: CUP_TIE_CLUB_SELECT, winnerClubSave: CUP_TIE_CLUB_SELECT },
  });
  return cupRunOf(
    ties.map((tie) => {
      if (tie.winnerClubSave === null) {
        throw new Error(`A played cup tie of save ${saveId} has no winner`);
      }
      return {
        round: tie.round,
        home: tie.homeClubSave.club.slug,
        away: tie.awayClubSave.club.slug,
        winner: tie.winnerClubSave.club.slug,
      };
    }),
    slug,
  );
}

/**
 * Writes the managed club's result of a season about to close, inside advanceToNextSeason's transaction, before any
 * player changes, with the club's promotion or relegation among the season's moves, its cup run (cupRound, the « cup »
 * trophy) from the closing cup seasons, and its European run (europeCode, europeStage, the « europe » trophy) from the
 * closing European seasons. Returns the season it was written for, or null when the club plays in none of these seasons.
 */
export async function recordSeasonResult(
  tx: Db,
  saveId: string,
  seasons: readonly SeasonRef[],
  moves: readonly Pick<SeasonMove, "clubId" | "reason">[] = [],
  cupSeasonIds: readonly string[] = [],
  europeSeasonIds: readonly string[] = [],
): Promise<string | null> {
  const managed = await managedClubOf(tx, saveId);
  const season = seasons.find((candidate) => candidate.competitionId === managed.competitionId);
  if (season === undefined) {
    return null;
  }
  const result = await computeSeasonResult(tx, saveId, managed, season);
  if (result === null) {
    return null;
  }
  const move = moves.find((candidate) => candidate.clubId === managed.clubId)?.reason ?? null;
  const cup = await cupRunOfClub(tx, saveId, managed.id, managed.slug, cupSeasonIds);
  const europe = await clubEuropeRun(tx, saveId, managed.id, europeSeasonIds);
  await tx.seasonResult.createMany({ data: [seasonResultRow(saveId, season, result, move, cup, europe)], skipDuplicates: true });
  return season.id;
}

/**
 * Lazy rebuilding: a season completed before SeasonResult existed has no row; it is computed from its fixtures and
 * statistics (its archive once it has one) and its transfers, and inserted once. skipDuplicates: two requests at once
 * insert it once. The « archive » task calls it before archiving a save's seasons (src/db/season-archiving.ts), in its
 * transaction. Returns the managed club.
 */
export async function ensureSeasonResults(db: Db, saveId: string): Promise<ManagedClub> {
  const managed = await managedClubOf(db, saveId);
  const involving = { OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] };
  // The completed league seasons the club played, whichever division it was in then: a cup has no table.
  const missing = await db.season.findMany({
    where: {
      saveId,
      completed: true,
      competition: { kind: "LEAGUE" },
      results: { none: { saveId } },
      OR: [{ fixtures: { some: { saveId, ...involving } } }, { archive: { is: { clubSaveIds: { has: managed.id } } } }],
    },
    select: { id: true, startYear: true, competitionId: true },
  });
  const rows: Prisma.SeasonResultCreateManyInput[] = [];
  for (const season of missing) {
    const result = await computeSeasonResult(db, saveId, managed, season);
    if (result !== null) {
      // A rebuilt row has no move, cup or European run: promoted and relegated stay false, cupRound and europeStage null.
      rows.push(seasonResultRow(saveId, season, result, null, null, null));
    }
  }
  if (rows.length > 0) {
    await db.seasonResult.createMany({ data: rows, skipDuplicates: true });
  }
  return managed;
}

export type SeasonBestPlayer = {
  playerKey: string;
  name: string;
  position: Position;
  goals: number;
  assists: number;
  rating: number;
  age: number; // at the end of the season, for his face
};

export type SeasonResultView = {
  seasonId: string;
  startYear: number;
  competitionCode: string; // named by the screens
  rank: number;
  champion: boolean;
  promoted: boolean; // false for a row rebuilt lazily
  relegated: boolean;
  cupRound: number | null; // the last cup round played (1 preliminary … 6 final); null without a cup that season
  cupWinner: boolean;
  // The European competition played that season (« eu.1 », « eu.2 ») and the stage reached (1 league phase … 5 final);
  // null without one.
  europeCode: string | null;
  europeStage: number | null;
  europeWinner: boolean;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  formation: string;
  bestPlayer: SeasonBestPlayer | null;
};

export type SeasonResults = {
  clubColors: ClubColors;
  seasons: SeasonResultView[]; // most recent first
};

/**
 * The managed club's completed seasons, most recent first (one of them only with seasonId), each season without a row
 * rebuilt and inserted first.
 */
export async function getSeasonResults(saveId: string, seasonId?: string): Promise<SeasonResults> {
  const managed = await ensureSeasonResults(prisma, saveId);
  const rows = await prisma.seasonResult.findMany({
    where: { saveId, ...(seasonId === undefined ? {} : { seasonId }) },
    orderBy: { season: { startYear: "desc" } },
    include: { season: { select: { startYear: true } }, competition: { select: { code: true } } },
  });
  const keys = rows.flatMap((row) => (row.bestPlayerKey === null ? [] : [row.bestPlayerKey]));
  const players = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: keys } },
    select: { playerKey: true, birthDate: true },
  });
  const birthDates = new Map(players.map((player) => [player.playerKey, player.birthDate]));

  return {
    clubColors: clubColorsOf(managed),
    seasons: rows.map((row) => {
      const birthDate = row.bestPlayerKey === null ? undefined : birthDates.get(row.bestPlayerKey);
      const bestPlayer =
        row.bestPlayerKey === null ||
        row.bestPlayerName === null ||
        row.bestPlayerPosition === null ||
        birthDate === undefined
          ? null
          : {
              playerKey: row.bestPlayerKey,
              name: row.bestPlayerName,
              position: row.bestPlayerPosition,
              goals: row.bestPlayerGoals ?? 0,
              assists: row.bestPlayerAssists ?? 0,
              rating: row.bestPlayerRating ?? 0,
              age: ageInYears(birthDate, seasonEndDate(row.season.startYear)),
            };
      return {
        seasonId: row.seasonId,
        startYear: row.season.startYear,
        competitionCode: row.competition.code,
        rank: row.rank,
        champion: row.trophies.includes(CHAMPION_TROPHY),
        promoted: row.promoted,
        relegated: row.relegated,
        cupRound: row.cupRound,
        cupWinner: row.trophies.includes(CUP_TROPHY),
        europeCode: row.europeCode,
        europeStage: row.europeStage,
        europeWinner: row.trophies.includes(EUROPE_TROPHY),
        points: row.points,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        formation: row.formation,
        bestPlayer,
      };
    }),
  };
}

/** One completed season of the managed club, rebuilt first if needed; null when the season has no result. */
export async function getSeasonResult(
  saveId: string,
  seasonId: string,
): Promise<{ clubColors: ClubColors; season: SeasonResultView } | null> {
  const { clubColors, seasons } = await getSeasonResults(saveId, seasonId);
  const [season] = seasons;
  return season === undefined ? null : { clubColors, season };
}
