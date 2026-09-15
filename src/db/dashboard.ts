import { seasonEndDate } from "../engine/world";
import { FIXTURE_SELECT, toFixtureView, type FixtureView } from "./calendar";
import { prisma } from "./client";
import { getStandings } from "./standings";

export type Dashboard = {
  currentDate: Date;
  startYear: number | null;
  club: {
    name: string;
    budget: number; // euros
    wageBudget: number; // euros per season
    payroll: number; // euros per season
    players: number;
    goalkeepers: number;
  };
  expiringContracts: number; // contracts ending this season; counted only from 1 January of the season
  nextFixture: FixtureView | null;
  lastResult: FixtureView | null;
  position: { rank: number; clubs: number; played: number; points: number } | null;
  seasonFinished: boolean;
};

/** Everything the dashboard of a save shows, for its managed club. */
export async function getDashboard(saveId: string): Promise<Dashboard> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { id: true, budget: true, wageBudget: true, club: { select: { name: true, competitionId: true } } },
  });
  const season =
    club.club.competitionId === null
      ? null
      : await prisma.season.findFirst({
          where: { saveId, competitionId: club.club.competitionId, completed: false },
          orderBy: { startYear: "desc" },
          select: { id: true, startYear: true },
        });

  const involving = { OR: [{ homeClubSaveId: club.id }, { awayClubSaveId: club.id }] };
  const [payroll, players, goalkeepers, nextFixture, lastResult, unplayed, table] = await Promise.all([
    prisma.playerSave.aggregate({ where: { saveId, clubSaveId: club.id }, _sum: { wage: true } }),
    prisma.playerSave.count({ where: { saveId, clubSaveId: club.id } }),
    prisma.playerSave.count({ where: { saveId, clubSaveId: club.id, position: "GK" } }),
    season === null
      ? null
      : prisma.fixture.findFirst({
          where: { saveId, seasonId: season.id, played: false, ...involving },
          orderBy: { scheduledAt: "asc" },
          select: FIXTURE_SELECT,
        }),
    season === null
      ? null
      : prisma.fixture.findFirst({
          where: { saveId, seasonId: season.id, played: true, ...involving },
          orderBy: { scheduledAt: "desc" },
          select: FIXTURE_SELECT,
        }),
    prisma.fixture.count({ where: { saveId, played: false, season: { completed: false } } }),
    season === null ? [] : getStandings(saveId, season.id),
  ]);

  // Contract alerts start with the second half of the season, on 1 January.
  const secondHalf = season !== null && save.currentDate >= new Date(Date.UTC(season.startYear + 1, 0, 1));
  const expiringContracts =
    season === null || !secondHalf
      ? 0
      : await prisma.playerSave.count({
          where: { saveId, clubSaveId: club.id, contractUntil: { lte: seasonEndDate(season.startYear) } },
        });
  const row = table.find((candidate) => candidate.isManaged);

  return {
    currentDate: save.currentDate,
    startYear: season?.startYear ?? null,
    club: {
      name: club.club.name,
      budget: club.budget,
      wageBudget: club.wageBudget,
      payroll: payroll._sum.wage ?? 0,
      players,
      goalkeepers,
    },
    expiringContracts,
    nextFixture: nextFixture === null ? null : toFixtureView(nextFixture),
    lastResult: lastResult === null ? null : toFixtureView(lastResult),
    position: row === undefined ? null : { rank: row.rank, clubs: table.length, played: row.played, points: row.points },
    seasonFinished: season !== null && unplayed === 0,
  };
}
