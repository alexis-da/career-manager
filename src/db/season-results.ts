import type { Position } from "../engine/positions";
import {
  buildSeasonResult,
  CHAMPION_TROPHY,
  clubAtDate,
  type SeasonPlayerLine,
  type SeasonResultData,
} from "../engine/season-result";
import { computeStandings } from "../engine/standings";
import { seasonEndDate } from "../engine/world";
import type { Prisma } from "../generated/prisma/client";
import { ageInYears } from "../lib/dates";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { prisma } from "./client";

type Db = Prisma.TransactionClient;

type SeasonRef = { id: string; startYear: number; competitionId: string };

type ManagedClub = {
  id: string;
  clubId: string;
  formation: string;
  competitionId: string | null;
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
      club: { select: { competitionId: true, primaryColor: true, secondaryColor: true } },
    },
  });
  return {
    id: managed.id,
    clubId: managed.clubId,
    formation: managed.formation,
    competitionId: managed.club.competitionId,
    primaryColor: managed.club.primaryColor,
    secondaryColor: managed.club.secondaryColor,
  };
}

/**
 * The managed club's season, from the database as it stands: the final table from the season's fixtures, the
 * statistics of the players who were at the club at the end of the season (their club then is rebuilt from the
 * transfers dated after it, so it holds for a season long over), and the club's formation now. null when the club does
 * not play in the competition of the season.
 */
async function computeSeasonResult(db: Db, saveId: string, managed: ManagedClub, season: SeasonRef): Promise<SeasonResultData | null> {
  const [clubSaves, fixtures, stats] = await Promise.all([
    db.clubSave.findMany({
      where: { saveId, club: { competitionId: season.competitionId } },
      select: { club: { select: { slug: true, id: true } } },
    }),
    db.fixture.findMany({
      where: { saveId, seasonId: season.id, played: true },
      select: {
        id: true,
        homeGoals: true,
        awayGoals: true,
        homeClubSave: { select: { club: { select: { slug: true } } } },
        awayClubSave: { select: { club: { select: { slug: true } } } },
      },
    }),
    db.playerSeasonStats.findMany({
      where: { saveId, seasonId: season.id },
      select: {
        appearances: true,
        minutes: true,
        goals: true,
        assists: true,
        yellowCards: true,
        redCards: true,
        playerSave: {
          select: {
            id: true,
            playerKey: true,
            firstName: true,
            lastName: true,
            position: true,
            clubSave: { select: { clubId: true } },
          },
        },
      },
    }),
  ]);

  const managedSlug = clubSaves.find(({ club }) => club.id === managed.clubId)?.club.slug;
  if (managedSlug === undefined) {
    return null;
  }
  const scores = fixtures.map(({ id, homeGoals, awayGoals, homeClubSave, awayClubSave }) => {
    if (homeGoals === null || awayGoals === null) {
      throw new Error(`Fixture ${id} is played but has no score`);
    }
    return { home: homeClubSave.club.slug, away: awayClubSave.club.slug, homeGoals, awayGoals };
  });
  const table = computeStandings(
    scores,
    clubSaves.map(({ club }) => club.slug),
  );
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

function seasonResultRow(saveId: string, season: SeasonRef, result: SeasonResultData): Prisma.SeasonResultCreateManyInput {
  const { bestPlayer, ...line } = result;
  return {
    ...line,
    saveId,
    seasonId: season.id,
    competitionId: season.competitionId,
    bestPlayerKey: bestPlayer?.playerKey ?? null,
    bestPlayerName: bestPlayer?.name ?? null,
    bestPlayerPosition: bestPlayer?.position ?? null,
    bestPlayerGoals: bestPlayer?.goals ?? null,
    bestPlayerAssists: bestPlayer?.assists ?? null,
    bestPlayerRating: bestPlayer?.rating ?? null,
  };
}

/**
 * Writes the managed club's result of a season about to close, inside advanceToNextSeason's transaction, before any
 * player changes. Returns the season it was written for, or null when the club plays in none of these seasons.
 */
export async function recordSeasonResult(tx: Db, saveId: string, seasons: readonly SeasonRef[]): Promise<string | null> {
  const managed = await managedClubOf(tx, saveId);
  const season = seasons.find((candidate) => candidate.competitionId === managed.competitionId);
  if (season === undefined) {
    return null;
  }
  const result = await computeSeasonResult(tx, saveId, managed, season);
  if (result === null) {
    return null;
  }
  await tx.seasonResult.createMany({ data: [seasonResultRow(saveId, season, result)], skipDuplicates: true });
  return season.id;
}

/**
 * Lazy rebuilding: a season completed before SeasonResult existed has no row; it is computed from Fixture,
 * PlayerSeasonStats and Transfer, and inserted once. skipDuplicates: two requests at once insert it once. Returns the
 * managed club.
 */
async function ensureSeasonResults(saveId: string): Promise<ManagedClub> {
  const managed = await managedClubOf(prisma, saveId);
  if (managed.competitionId === null) {
    return managed;
  }
  const missing = await prisma.season.findMany({
    where: { saveId, completed: true, competitionId: managed.competitionId, results: { none: { saveId } } },
    select: { id: true, startYear: true, competitionId: true },
  });
  const rows: Prisma.SeasonResultCreateManyInput[] = [];
  for (const season of missing) {
    const result = await computeSeasonResult(prisma, saveId, managed, season);
    if (result !== null) {
      rows.push(seasonResultRow(saveId, season, result));
    }
  }
  if (rows.length > 0) {
    await prisma.seasonResult.createMany({ data: rows, skipDuplicates: true });
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
  competitionName: string;
  rank: number;
  champion: boolean;
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
  const managed = await ensureSeasonResults(saveId);
  const rows = await prisma.seasonResult.findMany({
    where: { saveId, ...(seasonId === undefined ? {} : { seasonId }) },
    orderBy: { season: { startYear: "desc" } },
    include: { season: { select: { startYear: true } }, competition: { select: { name: true } } },
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
        competitionName: row.competition.name,
        rank: row.rank,
        champion: row.trophies.includes(CHAMPION_TROPHY),
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
