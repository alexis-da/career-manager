import { displayClubName } from "../engine/club-name";
import type { CompetitionKind } from "../engine/discipline";
import { EUROPE_LEAGUE_ROUNDS } from "../engine/europe";
import { formationPositions } from "../engine/formations";
import type { FormResult } from "../engine/standings";
import { seasonEndDate, transferWindowAt } from "../engine/world";
import { worldVersionOf, type WorldVersion } from "../engine/world-version";
import { ageInYears } from "../lib/dates";
import { FIXTURE_SELECT, toFixtureView, type FixtureView } from "./calendar";
import { prisma } from "./client";
import { CONTRACT_RULE_SELECT, importantDepartures } from "./contracts";
import { DISCIPLINE_SELECT, disciplineStatus } from "./discipline-view";
import { europeLeagueStandings } from "./europe";
import { parseFormation } from "./lineup";
import { managedMatchesAhead } from "./players";
import { coachSessionPending } from "./national-view";
import { getStandings, type ClubStandingRow } from "./standings";

/** Matches shown in a club's recent form. */
const FORM_LENGTH = 4;

/** Rows of the league table shown on the dashboard. */
const TABLE_PREVIEW_ROWS = 6;

export type { FormResult };

export type ClubPreview = {
  clubSaveId: string;
  name: string;
  rank: number | null;
  points: number;
  form: FormResult[]; // last matches of the season, oldest first
  averageOverall: number | null; // players under contract
  // A European match's clubs: their league's country, by its code's prefix (« en »), and their rank, points and form
  // in the league phase; null in a league or cup match.
  country: string | null;
};

export type Scorer = {
  name: string; // « K. Morel »
  minute: number;
};

export type Dashboard = {
  currentDate: Date;
  worldVersion: WorldVersion;
  startYear: number | null;
  competitionCode: string | null; // named by the screens
  windowOpen: boolean;
  club: {
    name: string;
    budget: number; // euros
    players: number; // under contract: the club signs nobody more at SQUAD_LIMIT
    goalkeepers: number;
    averageAge: number | null;
  };
  nextMatch: { fixture: FixtureView; home: ClubPreview; away: ClubPreview; stadium: string | null } | null;
  lastResult: { fixture: FixtureView; homeScorers: Scorer[]; awayScorers: Scorer[] } | null;
  injured: { name: string; until: Date }[];
  // Players one booking from a suspension in a competition the club still plays this season (disciplineStatus), by name,
  // with those competitions, the league first.
  bookingRisks: { name: string; competitions: CompetitionKind[] }[];
  // Who decides the contracts ending on 30 June (Save.contractsByAssistant, docs/design/simplification.md § 2): its
  // assistant, who tells only of the important players he means to let go, or its player, told of every one of them.
  contractsByAssistant: boolean;
  expiringContracts: string[]; // players whose contract ends this season, listed from 1 January
  // From 1 January, when the assistant decides them: the important players (importantPlayers) whose contract ends this
  // season, whom his rule lets go and their player chose nothing for (§ 2.2), by name.
  importantContracts: string[];
  position: {
    rank: number;
    clubs: number;
    points: number;
    goalDifference: number;
    previousRank: number | null; // rank before the managed club's last matchday
    previousRound: number | null;
  } | null;
  table: ClubStandingRow[]; // the managed club's league around it: its neighbours, in table order (tableAround)
  managedForm: FormResult[]; // last matches of the managed club in the season, oldest first, with or without a next match
  liveMatch: boolean; // a match of the managed club waits at a break
  seasonFinished: boolean;
};

const shortName = (player: { firstName: string; lastName: string }): string =>
  `${player.firstName.charAt(0)}. ${player.lastName}`;

/** By last name, then first name, as French sorts them. */
const byName = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }): number =>
  a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr");

const involving = (clubSaveId: string) => ({ OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] });

/**
 * A window of a league table around the managed club, in table order: centred on it, with the extra row above it when the
 * window is even, and held inside the table at its edges. The whole table when it is shorter; its top without a managed club.
 */
export function tableAround<Row extends { isManaged: boolean }>(rows: readonly Row[], size: number): Row[] {
  const managed = rows.findIndex((row) => row.isManaged);
  const start = Math.max(0, Math.min(managed - Math.floor(size / 2), rows.length - size));
  return rows.slice(start, start + size);
}

/** A club's last matches of a season, oldest first. */
async function recentForm(saveId: string, seasonId: string, clubSaveId: string): Promise<FormResult[]> {
  const recent = await prisma.fixture.findMany({
    where: { saveId, seasonId, played: true, ...involving(clubSaveId) },
    orderBy: { scheduledAt: "desc" },
    take: FORM_LENGTH,
    select: { homeClubSaveId: true, homeGoals: true, awayGoals: true },
  });
  return recent.reverse().map(({ homeClubSaveId, homeGoals, awayGoals }): FormResult => {
    const atHome = homeClubSaveId === clubSaveId;
    const scored = (atHome ? homeGoals : awayGoals) ?? 0;
    const conceded = (atHome ? awayGoals : homeGoals) ?? 0;
    return scored > conceded ? "W" : scored < conceded ? "L" : "D";
  });
}

async function clubPreview(
  saveId: string,
  seasonId: string,
  team: FixtureView["home"],
  table: readonly ClubStandingRow[],
): Promise<ClubPreview> {
  const [form, average] = await Promise.all([
    recentForm(saveId, seasonId, team.clubSaveId),
    prisma.playerSave.aggregate({ where: { saveId, clubSaveId: team.clubSaveId }, _avg: { overall: true } }),
  ]);
  const row = table.find((candidate) => candidate.clubName === team.name);
  return {
    clubSaveId: team.clubSaveId,
    name: team.name,
    // Before a club's first match, its place in the table is only the alphabet's: no rank yet.
    rank: row === undefined || row.played === 0 ? null : row.rank,
    points: row?.points ?? 0,
    form,
    averageOverall: average._avg.overall,
    country: null,
  };
}

/**
 * Both clubs of a European match as the hero shows them: their rank and points in the league phase (none before their
 * first match there, nor once it is over, in the knockout rounds), their form in the competition, their country.
 */
async function europePreviews(saveId: string, seasonId: string, fixture: FixtureView): Promise<[ClubPreview, ClubPreview]> {
  const standings = await europeLeagueStandings(prisma, saveId, seasonId);
  const preview = async (team: FixtureView["home"]): Promise<ClubPreview> => {
    const row = standings.find((candidate) => candidate.clubSaveId === team.clubSaveId);
    const [form, average] = await Promise.all([
      recentForm(saveId, seasonId, team.clubSaveId),
      prisma.playerSave.aggregate({ where: { saveId, clubSaveId: team.clubSaveId }, _avg: { overall: true } }),
    ]);
    const inLeaguePhase = fixture.round <= EUROPE_LEAGUE_ROUNDS;
    return {
      clubSaveId: team.clubSaveId,
      name: team.name,
      rank: !inLeaguePhase || row === undefined || row.played === 0 ? null : row.rank,
      points: row?.points ?? 0,
      form,
      averageOverall: average._avg.overall,
      country: row?.country ?? null,
    };
  };
  return Promise.all([preview(fixture.home), preview(fixture.away)]);
}

/** Everything the dashboard of a save shows, for its managed club. */
export async function getDashboard(saveId: string): Promise<Dashboard> {
  const save = await prisma.save.findUniqueOrThrow({
    where: { id: saveId },
    select: {
      currentDate: true,
      worldVersion: true,
      liveFixtureId: true,
      liveInternationalId: true,
      contractsByAssistant: true,
      assistantPolicy: true,
    },
  });
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: {
      id: true,
      budget: true,
      formation: true,
      competitionId: true,
      competition: { select: { code: true } },
      club: { select: { slug: true, name: true } },
    },
  });
  // The season in progress of the club's current competition.
  const season = await prisma.season.findFirst({
    where: { saveId, competitionId: club.competitionId, completed: false },
    orderBy: { startYear: "desc" },
    select: { id: true, startYear: true },
  });

  // The next and last matches in any competition of the seasons in progress, cup ties included; the table and the
  // rank's movement come from the league season.
  const inProgress = { season: { completed: false } } as const;
  const [squad, ahead, nextRow, lastRow, lastLeagueRow, unplayed, table] = await Promise.all([
    prisma.playerSave.findMany({
      where: { saveId, clubSaveId: club.id },
      select: {
        firstName: true,
        lastName: true,
        injuredUntil: true,
        ...CONTRACT_RULE_SELECT,
        ...DISCIPLINE_SELECT,
      },
    }),
    managedMatchesAhead(saveId),
    season === null
      ? null
      : prisma.fixture.findFirst({
          where: { saveId, played: false, ...inProgress, ...involving(club.id) },
          orderBy: { scheduledAt: "asc" },
          select: {
            ...FIXTURE_SELECT,
            seasonId: true,
            homeClubSave: { select: { ...FIXTURE_SELECT.homeClubSave.select, club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true, stadium: true } } } },
          },
        }),
    season === null
      ? null
      : prisma.fixture.findFirst({
          where: { saveId, played: true, ...inProgress, ...involving(club.id) },
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
    season === null
      ? null
      : prisma.fixture.findFirst({
          where: { saveId, seasonId: season.id, played: true, ...involving(club.id) },
          orderBy: { scheduledAt: "desc" },
          select: { round: true, scheduledAt: true },
        }),
    prisma.fixture.count({ where: { saveId, played: false, season: { completed: false } } }),
    season === null ? [] : getStandings(saveId, season.id),
  ]);

  const nextFixture = nextRow === null ? null : toFixtureView(nextRow);
  // A European match's clubs are read in its league phase, not in the managed club's league.
  const [homePreview, awayPreview] =
    season === null || nextFixture === null || nextRow === null
      ? [null, null]
      : nextRow.season.competition.kind === "EUROPE"
        ? await europePreviews(saveId, nextRow.seasonId, nextFixture)
        : await Promise.all([
            clubPreview(saveId, season.id, nextFixture.home, table),
            clubPreview(saveId, season.id, nextFixture.away, table),
          ]);
  // The next match's preview has the managed club's form; without a next match, it is read on its own.
  const managedPreview = nextFixture?.home.isManaged ? homePreview : awayPreview;
  // Its league form: a European match's preview has its form in the competition.
  const managedForm =
    managedPreview !== null && managedPreview.country === null
      ? managedPreview.form
      : season === null
        ? []
        : await recentForm(saveId, season.id, club.id);

  const managedRow = table.find((row) => row.isManaged);
  const previousRound = lastLeagueRow === null ? null : lastLeagueRow.round - 1;
  const previousTable =
    season === null || lastLeagueRow === null || previousRound === null || previousRound < 1
      ? null
      : await getStandings(saveId, season.id, { before: lastLeagueRow.scheduledAt });

  const secondHalf = season !== null && save.currentDate >= new Date(Date.UTC(season.startYear + 1, 0, 1));
  const lastContractDay = season === null ? null : seasonEndDate(season.startYear);
  const expiring = squad.filter(
    (player) => lastContractDay !== null && player.contractUntil !== null && player.contractUntil <= lastContractDay,
  );
  const ages = squad.map((player) => ageInYears(player.birthDate, save.currentDate));
  // From 1 January, the important players its assistant means to let go, when he decides the contracts: the rule read on
  // the squad and the free agents of today, with his policy, in the club's formation.
  const letGo =
    season === null || !secondHalf || !save.contractsByAssistant || expiring.length === 0
      ? new Set<string>()
      : await importantDepartures(saveId, squad, {
          startYear: season.startYear,
          formation: formationPositions(parseFormation(club.formation)),
          policy: save.assistantPolicy,
        });

  return {
    currentDate: save.currentDate,
    worldVersion: worldVersionOf(save.worldVersion),
    startYear: season?.startYear ?? null,
    competitionCode: club.competition.code,
    windowOpen: transferWindowAt(save.currentDate) !== null,
    club: {
      name: displayClubName(club.club),
      budget: club.budget,
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
    bookingRisks: squad
      .flatMap((player) => {
        const { bookingRisks } = disciplineStatus(player, ahead);
        return bookingRisks.length === 0 ? [] : [{ player, competitions: bookingRisks.map(({ competition }) => competition) }];
      })
      .sort(({ player: a }, { player: b }) => byName(a, b))
      .map(({ player, competitions }) => ({ name: shortName(player), competitions })),
    contractsByAssistant: save.contractsByAssistant,
    expiringContracts: secondHalf ? expiring.map(shortName) : [],
    importantContracts: squad
      .filter((player) => letGo.has(player.playerKey))
      .sort(byName)
      .map(shortName),
    position:
      managedRow === undefined || managedRow.played === 0
        ? null
        : {
            rank: managedRow.rank,
            clubs: table.length,
            points: managedRow.points,
            goalDifference: managedRow.goalDifference,
            previousRank: previousTable?.find((row) => row.isManaged)?.rank ?? null,
            previousRound: previousTable === null ? null : previousRound,
          },
    table: tableAround(table, TABLE_PREVIEW_ROWS),
    managedForm,
    // A match waits live: the managed club's, or its national coach's (« /live/nation »).
    liveMatch: save.liveFixtureId !== null || save.liveInternationalId !== null,
    // A national coach's summer tournament still to play: his season ends with it.
    seasonFinished: season !== null && unplayed === 0 && !(await coachSessionPending(saveId)),
  };
}
