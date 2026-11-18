import { displayClubName } from "../engine/club-name";
import {
  europeDates,
  EUROPE_CODES,
  EUROPE_FINAL_ROUND,
  EUROPE_LEAGUE_ROUNDS,
  type EuropeCode,
  type EuropeEntrant,
} from "../engine/europe";
import { getOrThrow } from "../lib/maps";
import {
  DECISIONS_SELECT,
  EVENTS_SELECT,
  FIXTURE_SELECT,
  instructionsOf,
  toDecisionView,
  toEventView,
  toFixtureView,
  type FixtureView,
  type FixtureWithEvents,
} from "./calendar";
import { prisma } from "./client";
import { seasonHasBreaks } from "./nations";
import { europeCodeOf, leaguePhaseOver, leaguePhaseTableOf, parseEuropeEntrants, type EuropeFixtureRow } from "./europe";

// What the screens show of the European competitions (docs/design/europe.md § 6): the save's latest year of them, each
// competition with its league phase's table and its knockout matches, and the managed club's matches in its own. Reads
// only, every query by saveId. The latest year is the one in progress: a European season is completed, then archived,
// only once the next year's are open.

/** A club of a European season, as the screens name it. */
export type EuropeClubView = {
  clubSaveId: string;
  name: string;
  country: string; // the prefix of its league's code at the opening: « en », named by the world messages
  isManaged: boolean;
};

/** A line of a league phase's table. */
export type EuropeTableRowView = EuropeClubView & {
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

/** A knockout match of a European season, with the club through once it is played (a shoot-out leaves the score level). */
export type EuropeTieView = FixtureView & { winnerClubSaveId: string | null };

/** A European competition of a year, as its screen shows it. */
export type EuropeCompetitionView = {
  code: EuropeCode;
  dates: Date[]; // its ten rounds' (europeDates), index = round − 1, scheduled or not
  leagueMatches: number; // the matches each club plays in its league phase: 6 with four pots (eu.1), 4 with three (eu.2)
  table: EuropeTableRowView[]; // the league phase's, by rank: every club, played or not
  leaguePhaseOver: boolean; // its six rounds played: its knockout bracket is known
  knockout: EuropeTieView[]; // its knockout matches scheduled so far (rounds 7 to 10, each once the one before is over)
  winner: EuropeClubView | null; // once the final is played
};

export type EuropeView = {
  startYear: number;
  competitions: EuropeCompetitionView[]; // the year's, eu.1 first
  managedCode: EuropeCode | null; // the competition the managed club plays this year; null when it did not qualify
  managedMatches: FixtureWithEvents[]; // its matches there, by date, with their events: none when it did not qualify
};

/** A club's league phase matches: two against each other pot (drawLeaguePhase). */
const leagueMatchesOf = (entrants: readonly EuropeEntrant[]): number =>
  2 * (Math.max(1, ...entrants.map((entrant) => entrant.pot)) - 1);

type ClubKeys = { id: string; club: { slug: string } };

type ScoreRow = {
  round: number;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  winnerClubSaveId: string | null;
  homeClubSave: ClubKeys;
  awayClubSave: ClubKeys;
};

/** A match as the league phase's table and the runs read it, by slug (src/db/europe.ts). */
function bySlug(row: ScoreRow): EuropeFixtureRow {
  const home = row.homeClubSave.club.slug;
  const away = row.awayClubSave.club.slug;
  return {
    round: row.round,
    played: row.played,
    home,
    away,
    homeClubSaveId: row.homeClubSave.id,
    awayClubSaveId: row.awayClubSave.id,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    winner: row.winnerClubSaveId === row.homeClubSave.id ? home : row.winnerClubSaveId === row.awayClubSave.id ? away : null,
  };
}

/** The managed club's matches in a European season, by date, with their events, as the calendar gives them. */
async function managedMatchesIn(saveId: string, seasonId: string | null, clubSaveId: string): Promise<FixtureWithEvents[]> {
  if (seasonId === null) {
    return [];
  }
  const rows = await prisma.fixture.findMany({
    where: { saveId, seasonId, OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] },
    orderBy: [{ scheduledAt: "asc" }, { round: "asc" }],
    select: { ...FIXTURE_SELECT, events: EVENTS_SELECT, decisions: DECISIONS_SELECT, instructions: true },
  });
  return rows.map(({ events, decisions, instructions, ...row }) => ({
    ...toFixtureView(row),
    events: events.map(toEventView(row.scheduledAt)),
    decisions: decisions.map(toDecisionView),
    instructions: instructionsOf(instructions),
  }));
}

/**
 * The save's latest year of European competitions: each one's league phase table (every club with its country) and
 * knockout matches, which one the managed club plays, and its matches there; null when the save has none (a worldVersion
 * 1 save, a challenge save, a save from before the European competitions until its next season).
 */
export async function getEuropeView(saveId: string): Promise<EuropeView | null> {
  const [managed, recent, save] = await Promise.all([
    prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, club: { select: { slug: true } } } }),
    // A year has a season of each competition: the latest year's, eu.1 first.
    prisma.season.findMany({
      where: { saveId, competition: { kind: "EUROPE" } },
      orderBy: [{ startYear: "desc" }, { competition: { code: "asc" } }],
      take: EUROPE_CODES.length,
      select: { id: true, startYear: true, entrants: true, competition: { select: { code: true } } },
    }),
    // The dates of the rounds still to draw: those of a season with or without international breaks.
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { breaksFrom: true } }),
  ]);
  const startYear = recent.at(0)?.startYear;
  if (startYear === undefined) {
    return null;
  }
  const seasons = recent
    .filter((season) => season.startYear === startYear)
    .map((season) => ({
      id: season.id,
      code: europeCodeOf(season.competition.code),
      entrants: parseEuropeEntrants(season.id, season.entrants),
    }));
  const managedSeason = seasons.find((season) => season.entrants.some((entrant) => entrant.club === managed.club.slug)) ?? null;

  const [clubs, rows, managedMatches] = await Promise.all([
    // Entrants are kept by slug: the same in every database, where ids are not.
    prisma.clubSave.findMany({
      where: { saveId, club: { slug: { in: seasons.flatMap((season) => season.entrants.map((entrant) => entrant.club)) } } },
      select: { id: true, isManaged: true, club: { select: { slug: true, name: true } } },
    }),
    prisma.fixture.findMany({
      where: { saveId, seasonId: { in: seasons.map((season) => season.id) } },
      orderBy: [{ round: "asc" }, { scheduledAt: "asc" }, { id: "asc" }],
      select: { ...FIXTURE_SELECT, seasonId: true, winnerClubSaveId: true },
    }),
    managedMatchesIn(saveId, managedSeason?.id ?? null, managed.id),
  ]);
  const clubBySlug = new Map(clubs.map((club) => [club.club.slug, club]));

  const competitions = seasons.map((season): EuropeCompetitionView => {
    const ofSeason = rows.filter((row) => row.seasonId === season.id);
    const fixtures = ofSeason.map(bySlug);
    const countryOf = new Map(season.entrants.map((entrant) => [entrant.club, entrant.country]));
    const clubView = (slug: string): EuropeClubView => {
      const club = getOrThrow(clubBySlug, slug, "European club");
      return {
        clubSaveId: club.id,
        name: displayClubName(club.club),
        country: getOrThrow(countryOf, slug, "European club's country"),
        isManaged: club.isManaged,
      };
    };
    const table = leaguePhaseTableOf(season.entrants, fixtures).map(
      ({ club, ...line }): EuropeTableRowView => ({ ...clubView(club), ...line, goalDifference: line.goalsFor - line.goalsAgainst }),
    );
    const knockout = ofSeason
      .filter((row) => row.round > EUROPE_LEAGUE_ROUNDS)
      .map((row): EuropeTieView => ({ ...toFixtureView(row), winnerClubSaveId: row.winnerClubSaveId }));
    const final = knockout.find((match) => match.round === EUROPE_FINAL_ROUND && match.played);
    const winner = final === undefined ? undefined : table.find((row) => row.clubSaveId === final.winnerClubSaveId);
    return {
      code: season.code,
      dates: europeDates(startYear, seasonHasBreaks(save.breaksFrom, startYear)),
      leagueMatches: leagueMatchesOf(season.entrants),
      table,
      leaguePhaseOver: leaguePhaseOver(fixtures),
      knockout,
      winner:
        winner === undefined
          ? null
          : { clubSaveId: winner.clubSaveId, name: winner.name, country: winner.country, isManaged: winner.isManaged },
    };
  });

  return { startYear, competitions, managedCode: managedSeason?.code ?? null, managedMatches };
}

/** Whether the save has a European season: its navigation shows « Europe » then. */
export async function hasEurope(saveId: string): Promise<boolean> {
  return (await prisma.season.count({ where: { saveId, competition: { kind: "EUROPE" } } })) > 0;
}
