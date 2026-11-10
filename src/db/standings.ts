import { displayClubName } from "../engine/club-name";
import { competitionCountry, type Country } from "../i18n/countries";
import { computeForm, computeStandings, type FormResult, type MatchScore, type StandingRow } from "../engine/standings";
import { prisma } from "./client";
import { clubOf, clubsOfSave, readArchivedSeason } from "./season-archive";

export type ClubStandingRow = StandingRow & {
  clubName: string;
  isManaged: boolean;
};

/** A row of a table on screen. */
export type ClubTableRow = ClubStandingRow & {
  form: FormResult[]; // the club's last results of the season, oldest first
};

export type CompetitionTable = {
  seasonId: string;
  startYear: number;
  code: string; // « fr.2 », named by the screens
  country: Country;
  tier: number; // 1 or 2
  hasManagedClub: boolean;
  rows: ClubTableRow[];
};

export type StandingsOptions = {
  before?: Date; // only fixtures played strictly before this date: the table as it was then
};

const STANDINGS_CLUB_SELECT = { select: { isManaged: true, club: { select: { slug: true, name: true } } } } as const;

type SeasonScores = {
  clubBySlug: Map<string, { name: string; isManaged: boolean }>; // every club of the season
  scores: MatchScore[]; // its counted fixtures, in chronological order
};

type ScoreRow = {
  id: string;
  played: boolean;
  scheduledAt: Date;
  homeGoals: number | null;
  awayGoals: number | null;
  homeClubSave: { isManaged: boolean; club: { slug: string; name: string } };
  awayClubSave: { isManaged: boolean; club: { slug: string; name: string } };
};

/** A season's fixtures, by date: from its archive once it has one (a completed season), from its rows otherwise. */
async function seasonFixtures(saveId: string, seasonId: string): Promise<ScoreRow[]> {
  const archived = await readArchivedSeason(prisma, saveId, seasonId);
  if (archived !== null) {
    const clubs = await clubsOfSave(
      prisma,
      saveId,
      archived.fixtures.flatMap((fixture) => [fixture.homeClubSaveId, fixture.awayClubSaveId]),
    );
    return archived.fixtures.map((fixture, index) => ({
      id: `${seasonId}#${index}`,
      played: fixture.played,
      scheduledAt: fixture.scheduledAt,
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
      homeClubSave: clubOf(clubs, fixture.homeClubSaveId),
      awayClubSave: clubOf(clubs, fixture.awayClubSaveId),
    }));
  }
  return prisma.fixture.findMany({
    where: { saveId, seasonId },
    orderBy: { scheduledAt: "asc" },
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
}

async function readSeasonScores(saveId: string, seasonId: string, options: StandingsOptions = {}): Promise<SeasonScores> {
  const fixtures = await seasonFixtures(saveId, seasonId);
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

  return { clubBySlug, scores };
}

function standingRows({ clubBySlug, scores }: SeasonScores): ClubStandingRow[] {
  return computeStandings(scores, [...clubBySlug.keys()]).map((row) => {
    const club = clubBySlug.get(row.club);
    return { ...row, clubName: club?.name ?? row.club, isManaged: club?.isManaged ?? false };
  });
}

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
  return standingRows(await readSeasonScores(saveId, seasonId, options));
}

/**
 * Tables of the save's latest season, one per league (the cups have none), in alphabetical order of competition, with
 * each club's form.
 */
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
      const seasonScores = await readSeasonScores(saveId, season.id);
      const form = computeForm(seasonScores.scores);
      const rows = standingRows(seasonScores).map((row) => ({ ...row, form: form.get(row.club) ?? [] }));
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
