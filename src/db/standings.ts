import { displayClubName } from "../engine/club-name";
import { competitionCountry, type Country } from "../i18n/countries";
import { computeStandings, type StandingRow } from "../engine/standings";
import { prisma } from "./client";

export type ClubStandingRow = StandingRow & {
  clubName: string;
  isManaged: boolean;
};

export type CompetitionTable = {
  seasonId: string;
  startYear: number;
  code: string; // « fr.2 », named by the screens
  country: Country;
  tier: number; // 1 or 2
  hasManagedClub: boolean;
  rows: ClubStandingRow[];
};

export type StandingsOptions = {
  before?: Date; // only fixtures played strictly before this date: the table as it was then
};

const STANDINGS_CLUB_SELECT = { select: { isManaged: true, club: { select: { slug: true, name: true } } } } as const;

/**
 * League table of a season from its played fixtures, every club of the season included. The clubs are the ones of its
 * fixtures, played or not, never the clubs' current competition (ClubSave.competitionId): a club promoted or relegated
 * since still shows in the table of the season it played.
 */
export async function getStandings(
  saveId: string,
  seasonId: string,
  options: StandingsOptions = {},
): Promise<ClubStandingRow[]> {
  const fixtures = await prisma.fixture.findMany({
    where: { saveId, seasonId },
    select: {
      id: true,
      played: true,
      scheduledAt: true,
      homeGoals: true,
      awayGoals: true,
      homeClubSave: STANDINGS_CLUB_SELECT,
      awayClubSave: STANDINGS_CLUB_SELECT,
    },
  });
  if (fixtures.length === 0) {
    throw new Error(`Season ${seasonId} of save ${saveId} has no fixture`);
  }

  const clubBySlug = new Map(
    fixtures.flatMap(({ homeClubSave, awayClubSave }) =>
      [homeClubSave, awayClubSave].map(({ isManaged, club }) => [club.slug, { name: displayClubName(club), isManaged }] as const),
    ),
  );
  const counted = fixtures.filter(
    (fixture) => fixture.played && (options.before === undefined || fixture.scheduledAt < options.before),
  );
  const scores = counted.map(({ id, homeGoals, awayGoals, homeClubSave, awayClubSave }) => {
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

/** Tables of the save's latest season, one per league (the cups have none), in alphabetical order of competition. */
export async function getLatestSeasonTables(saveId: string): Promise<CompetitionTable[]> {
  const latest = await prisma.season.findFirst({
    where: { saveId, competition: { kind: "LEAGUE" } },
    orderBy: { startYear: "desc" },
    select: { startYear: true },
  });
  if (latest === null) {
    return [];
  }
  const seasons = await prisma.season.findMany({
    where: { saveId, startYear: latest.startYear, competition: { kind: "LEAGUE" } },
    orderBy: { competition: { code: "asc" } },
    select: { id: true, startYear: true, competition: { select: { code: true, tier: true } } },
  });

  return Promise.all(
    seasons.map(async (season) => {
      const rows = await getStandings(saveId, season.id);
      return {
        seasonId: season.id,
        startYear: season.startYear,
        code: season.competition.code,
        country: competitionCountry(season.competition.code),
        tier: season.competition.tier,
        hasManagedClub: rows.some((row) => row.isManaged),
        rows,
      };
    }),
  );
}
