import { seasonEndDate, transferWindowAt } from "../engine/world";
import { ageInYears } from "../lib/dates";
import { FIXTURE_SELECT, toFixtureView, type FixtureView } from "./calendar";
import { prisma } from "./client";
import { getStandings, type ClubStandingRow } from "./standings";

/** Matches shown in a club's recent form. */
const FORM_LENGTH = 4;

/** Rows of the league table shown on the dashboard. */
const TABLE_PREVIEW_ROWS = 6;

export type FormResult = "W" | "D" | "L";

export type ClubPreview = {
  clubSaveId: string;
  name: string;
  rank: number | null;
  points: number;
  form: FormResult[]; // last matches of the season, oldest first
  averageOverall: number | null; // players under contract
};

export type Scorer = {
  name: string; // « K. Morel »
  minute: number;
};

export type Dashboard = {
  currentDate: Date;
  startYear: number | null;
  competitionName: string | null;
  windowOpen: boolean;
  club: {
    name: string;
    budget: number; // euros
    wageBudget: number; // euros per season
    payroll: number; // euros per season
    players: number;
    goalkeepers: number;
    averageAge: number | null;
  };
  nextMatch: { fixture: FixtureView; home: ClubPreview; away: ClubPreview; stadium: string | null } | null;
  lastResult: { fixture: FixtureView; homeScorers: Scorer[]; awayScorers: Scorer[] } | null;
  injured: { name: string; until: Date }[];
  expiringContracts: string[]; // players whose contract ends this season, listed from 1 January
  position: {
    rank: number;
    clubs: number;
    points: number;
    goalDifference: number;
    previousRank: number | null; // rank before the managed club's last matchday
    previousRound: number | null;
  } | null;
  table: ClubStandingRow[]; // top of the managed club's league, the managed club always included
  seasonFinished: boolean;
};

const shortName = (player: { firstName: string; lastName: string }): string =>
  `${player.firstName.charAt(0)}. ${player.lastName}`;

const involving = (clubSaveId: string) => ({ OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] });

async function clubPreview(
  saveId: string,
  seasonId: string,
  team: FixtureView["home"],
  table: readonly ClubStandingRow[],
): Promise<ClubPreview> {
  const [recent, average] = await Promise.all([
    prisma.fixture.findMany({
      where: { saveId, seasonId, played: true, ...involving(team.clubSaveId) },
      orderBy: { scheduledAt: "desc" },
      take: FORM_LENGTH,
      select: { homeClubSaveId: true, homeGoals: true, awayGoals: true },
    }),
    prisma.playerSave.aggregate({ where: { saveId, clubSaveId: team.clubSaveId }, _avg: { overall: true } }),
  ]);
  const row = table.find((candidate) => candidate.clubName === team.name);
  return {
    clubSaveId: team.clubSaveId,
    name: team.name,
    rank: row?.rank ?? null,
    points: row?.points ?? 0,
    form: recent.reverse().map(({ homeClubSaveId, homeGoals, awayGoals }) => {
      const atHome = homeClubSaveId === team.clubSaveId;
      const scored = (atHome ? homeGoals : awayGoals) ?? 0;
      const conceded = (atHome ? awayGoals : homeGoals) ?? 0;
      return scored > conceded ? "W" : scored < conceded ? "L" : "D";
    }),
    averageOverall: average._avg.overall,
  };
}

/** Everything the dashboard of a save shows, for its managed club. */
export async function getDashboard(saveId: string): Promise<Dashboard> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: {
      id: true,
      budget: true,
      wageBudget: true,
      club: { select: { name: true, competitionId: true, competition: { select: { name: true } } } },
    },
  });
  const season =
    club.club.competitionId === null
      ? null
      : await prisma.season.findFirst({
          where: { saveId, competitionId: club.club.competitionId, completed: false },
          orderBy: { startYear: "desc" },
          select: { id: true, startYear: true },
        });

  const [payroll, squad, nextRow, lastRow, unplayed, table] = await Promise.all([
    prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } }),
    prisma.playerSave.findMany({
      where: { saveId, clubSaveId: club.id },
      select: { firstName: true, lastName: true, birthDate: true, position: true, contractUntil: true, injuredUntil: true },
    }),
    season === null
      ? null
      : prisma.fixture.findFirst({
          where: { saveId, seasonId: season.id, played: false, ...involving(club.id) },
          orderBy: { scheduledAt: "asc" },
          select: { ...FIXTURE_SELECT, homeClubSave: { select: { ...FIXTURE_SELECT.homeClubSave.select, club: { select: { name: true, primaryColor: true, secondaryColor: true, stadium: true } } } } },
        }),
    season === null
      ? null
      : prisma.fixture.findFirst({
          where: { saveId, seasonId: season.id, played: true, ...involving(club.id) },
          orderBy: { scheduledAt: "desc" },
          select: {
            ...FIXTURE_SELECT,
            events: {
              where: { type: "GOAL" },
              orderBy: [{ minute: "asc" }, { id: "asc" }],
              select: { minute: true, side: true, playerSave: { select: { firstName: true, lastName: true } } },
            },
          },
        }),
    prisma.fixture.count({ where: { saveId, played: false, season: { completed: false } } }),
    season === null ? [] : getStandings(saveId, season.id),
  ]);

  const nextFixture = nextRow === null ? null : toFixtureView(nextRow);
  const [homePreview, awayPreview] =
    season === null || nextFixture === null
      ? [null, null]
      : await Promise.all([
          clubPreview(saveId, season.id, nextFixture.home, table),
          clubPreview(saveId, season.id, nextFixture.away, table),
        ]);

  const managedRow = table.find((row) => row.isManaged);
  const previousRound = lastRow === null ? null : lastRow.round - 1;
  const previousTable =
    season === null || lastRow === null || previousRound === null || previousRound < 1
      ? null
      : await getStandings(saveId, season.id, { before: lastRow.scheduledAt });

  const secondHalf = season !== null && save.currentDate >= new Date(Date.UTC(season.startYear + 1, 0, 1));
  const lastContractDay = season === null ? null : seasonEndDate(season.startYear);
  const ages = squad.map((player) => ageInYears(player.birthDate, save.currentDate));

  const preview = table.slice(0, TABLE_PREVIEW_ROWS);
  if (managedRow !== undefined && !preview.includes(managedRow)) {
    preview[preview.length - 1] = managedRow;
  }

  return {
    currentDate: save.currentDate,
    startYear: season?.startYear ?? null,
    competitionName: club.club.competition?.name ?? null,
    windowOpen: transferWindowAt(save.currentDate) !== null,
    club: {
      name: club.club.name,
      budget: club.budget,
      wageBudget: club.wageBudget,
      payroll: payroll._sum.wage ?? 0,
      players: squad.length,
      goalkeepers: squad.filter((player) => player.position === "GK").length,
      averageAge: ages.length === 0 ? null : ages.reduce((sum, age) => sum + age, 0) / ages.length,
    },
    nextMatch:
      nextFixture === null || homePreview === null || awayPreview === null || nextRow === null
        ? null
        : { fixture: nextFixture, home: homePreview, away: awayPreview, stadium: nextRow.homeClubSave.club.stadium },
    lastResult:
      lastRow === null
        ? null
        : {
            fixture: toFixtureView(lastRow),
            homeScorers: lastRow.events
              .filter((event) => event.side === "HOME")
              .map((event) => ({ name: event.playerSave === null ? "?" : shortName(event.playerSave), minute: event.minute })),
            awayScorers: lastRow.events
              .filter((event) => event.side === "AWAY")
              .map((event) => ({ name: event.playerSave === null ? "?" : shortName(event.playerSave), minute: event.minute })),
          },
    injured: squad
      .filter((player) => player.injuredUntil !== null && player.injuredUntil > save.currentDate)
      .map((player) => ({ name: shortName(player), until: player.injuredUntil ?? save.currentDate }))
      .sort((a, b) => a.until.getTime() - b.until.getTime()),
    expiringContracts:
      !secondHalf || lastContractDay === null
        ? []
        : squad
            .filter((player) => player.contractUntil !== null && player.contractUntil <= lastContractDay)
            .map(shortName),
    position:
      managedRow === undefined
        ? null
        : {
            rank: managedRow.rank,
            clubs: table.length,
            points: managedRow.points,
            goalDifference: managedRow.goalDifference,
            previousRank: previousTable?.find((row) => row.isManaged)?.rank ?? null,
            previousRound: previousTable === null ? null : previousRound,
          },
    table: preview,
    seasonFinished: season !== null && unplayed === 0,
  };
}
