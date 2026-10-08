import { displayClubName } from "../engine/club-name";
import { computeStandings, type StandingRow } from "../engine/standings";
import { prisma } from "./client";

export type ClubStandingRow = StandingRow & {
  clubName: string;
  isManaged: boolean;
};

export type CompetitionTable = {
  seasonId: string;
  startYear: number;
  code: string;
  name: string;
  hasManagedClub: boolean;
  rows: ClubStandingRow[];
};

export type StandingsOptions = {
  before?: Date; // only fixtures played strictly before this date: the table as it was then
};

/** League table of a season from its played fixtures, every club of the competition included. */
export async function getStandings(
  saveId: string,
  seasonId: string,
  options: StandingsOptions = {},
): Promise<ClubStandingRow[]> {
  const season = await prisma.season.findFirstOrThrow({
    where: { id: seasonId, saveId },
    select: { competitionId: true },
  });
  const [clubSaves, fixtures] = await Promise.all([
    prisma.clubSave.findMany({
      where: { saveId, club: { competitionId: season.competitionId } },
      select: { isManaged: true, club: { select: { slug: true, name: true } } },
    }),
    prisma.fixture.findMany({
      where: {
        saveId,
        seasonId,
        played: true,
        ...(options.before === undefined ? {} : { scheduledAt: { lt: options.before } }),
      },
      select: {
        id: true,
        homeGoals: true,
        awayGoals: true,
        homeClubSave: { select: { club: { select: { slug: true } } } },
        awayClubSave: { select: { club: { select: { slug: true } } } },
      },
    }),
  ]);

  const clubBySlug = new Map(clubSaves.map(({ isManaged, club }) => [club.slug, { name: displayClubName(club), isManaged }]));
  const scores = fixtures.map(({ id, homeGoals, awayGoals, homeClubSave, awayClubSave }) => {
    if (homeGoals === null || awayGoals === null) {
      throw new Error(`Fixture ${id} is played but has no score`);
    }
    return { home: homeClubSave.club.slug, away: awayClubSave.club.slug, homeGoals, awayGoals };
  });

  return computeStandings(scores, [...clubBySlug.keys()]).map((row) => {
    const club = clubBySlug.get(row.club);
    return { ...row, clubName: club?.name ?? row.club, isManaged: club?.isManaged ?? false };
  });
}

/** Tables of the save's latest season, one per competition, in alphabetical order of competition. */
export async function getLatestSeasonTables(saveId: string): Promise<CompetitionTable[]> {
  const latest = await prisma.season.findFirst({
    where: { saveId },
    orderBy: { startYear: "desc" },
    select: { startYear: true },
  });
  if (latest === null) {
    return [];
  }
  const seasons = await prisma.season.findMany({
    where: { saveId, startYear: latest.startYear },
    orderBy: { competition: { name: "asc" } },
    select: { id: true, startYear: true, competition: { select: { code: true, name: true } } },
  });

  return Promise.all(
    seasons.map(async (season) => {
      const rows = await getStandings(saveId, season.id);
      return {
        seasonId: season.id,
        startYear: season.startYear,
        code: season.competition.code,
        name: season.competition.name,
        hasManagedClub: rows.some((row) => row.isManaged),
        rows,
      };
    }),
  );
}
