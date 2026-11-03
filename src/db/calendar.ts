import { displayClubName } from "../engine/club-name";
import type { DecidedBy, MatchEventType, Side } from "../engine/match";
import type { Prisma } from "../generated/prisma/client";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { prisma } from "./client";

export type TeamView = {
  clubSaveId: string;
  name: string;
  isManaged: boolean;
  colors: ClubColors;
};

export type FixtureView = {
  id: string;
  round: number; // the matchday; in a cup, the round (1 preliminary … 6 final)
  cup: boolean; // a national cup tie
  scheduledAt: Date;
  competitionCode: string; // « fr.1 », named by the screens
  home: TeamView;
  away: TeamView;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  homeHalfTimeGoals: number | null; // null for matches played before the two-half engine
  awayHalfTimeGoals: number | null;
  decidedBy: DecidedBy | null; // a played cup tie: in 90 minutes, after extra time or on penalties; null in a league
  homePenalties: number | null; // shoot-out kicks scored
  awayPenalties: number | null;
};

export type MatchEventView = {
  id: string;
  minute: number;
  type: MatchEventType;
  period: "REGULAR" | "EXTRA_TIME" | "SHOOTOUT"; // the minute of a shoot-out kick is its number
  side: Side; // stored with the event: the player's club may have changed since
  playerName: string;
  playerKey: string | null; // with his age on the match day, to draw his face
  playerAge: number | null;
  relatedPlayerName: string | null; // assist provider of a goal, player going off in a substitution
  relatedPlayerKey: string | null; // his key: two players of a match may share a name
};

export type FixtureWithEvents = FixtureView & { events: MatchEventView[] };

export type ClubCalendar = {
  startYear: number | null;
  fixtures: FixtureWithEvents[];
};

const TEAM_SELECT = {
  select: { id: true, isManaged: true, club: { select: { slug: true, name: true, primaryColor: true, secondaryColor: true } } },
} as const;

export const FIXTURE_SELECT = {
  id: true,
  round: true,
  scheduledAt: true,
  played: true,
  homeGoals: true,
  awayGoals: true,
  homeHalfTimeGoals: true,
  awayHalfTimeGoals: true,
  decidedBy: true,
  homePenalties: true,
  awayPenalties: true,
  season: { select: { competition: { select: { code: true, kind: true } } } },
  homeClubSave: TEAM_SELECT,
  awayClubSave: TEAM_SELECT,
} as const;

type FixtureRow = Prisma.FixtureGetPayload<{ select: typeof FIXTURE_SELECT }>;

const toTeamView = (clubSave: FixtureRow["homeClubSave"]): TeamView => ({
  clubSaveId: clubSave.id,
  name: displayClubName(clubSave.club),
  isManaged: clubSave.isManaged,
  colors: clubColorsOf(clubSave.club),
});

export function toFixtureView(row: FixtureRow): FixtureView {
  return {
    id: row.id,
    round: row.round,
    cup: row.season.competition.kind === "CUP",
    scheduledAt: row.scheduledAt,
    competitionCode: row.season.competition.code,
    home: toTeamView(row.homeClubSave),
    away: toTeamView(row.awayClubSave),
    played: row.played,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    homeHalfTimeGoals: row.homeHalfTimeGoals,
    awayHalfTimeGoals: row.awayHalfTimeGoals,
    decidedBy: row.decidedBy,
    homePenalties: row.homePenalties,
    awayPenalties: row.awayPenalties,
  };
}

const fullName = (player: { firstName: string; lastName: string }): string => `${player.firstName} ${player.lastName}`;

const involving = (clubSaveId: string) => ({ OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] });

const EVENTS_SELECT = {
  // Events are written in match order, so the id breaks ties within a minute. Periods first: the enum's order is the
  // match's (regular time, extra time, shoot-out), and a kick's « minute » is its number.
  orderBy: [{ period: "asc" }, { minute: "asc" }, { id: "asc" }],
  select: {
    id: true,
    minute: true,
    period: true,
    type: true,
    side: true,
    playerSave: { select: { firstName: true, lastName: true, playerKey: true, birthDate: true } },
    relatedPlayerSave: { select: { firstName: true, lastName: true, playerKey: true } },
  },
} as const satisfies Prisma.Fixture$eventsArgs;

type EventRow = Prisma.MatchEventGetPayload<{ select: (typeof EVENTS_SELECT)["select"] }>;

const toEventView =
  (matchDate: Date) =>
  (event: EventRow): MatchEventView => ({
    id: event.id,
    minute: event.minute,
    period: event.period,
    type: event.type,
    side: event.side === "HOME" ? "home" : "away",
    playerName: event.playerSave === null ? "Joueur inconnu" : fullName(event.playerSave),
    playerKey: event.playerSave?.playerKey ?? null,
    playerAge: event.playerSave === null ? null : ageInYears(event.playerSave.birthDate, matchDate),
    relatedPlayerName: event.relatedPlayerSave === null ? null : fullName(event.relatedPlayerSave),
    relatedPlayerKey: event.relatedPlayerSave?.playerKey ?? null,
  });

/** Fixtures of the managed club in the save's latest season, by date, with the events of played matches. */
export async function getManagedClubCalendar(saveId: string): Promise<ClubCalendar> {
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const latest = await prisma.season.findFirst({
    where: { saveId },
    orderBy: { startYear: "desc" },
    select: { startYear: true },
  });
  if (latest === null) {
    return { startYear: null, fixtures: [] };
  }

  const rows = await prisma.fixture.findMany({
    where: { saveId, season: { startYear: latest.startYear }, ...involving(managed.id) },
    orderBy: [{ scheduledAt: "asc" }, { round: "asc" }],
    select: { ...FIXTURE_SELECT, events: EVENTS_SELECT },
  });

  return {
    startYear: latest.startYear,
    fixtures: rows.map(({ events, ...row }) => ({
      ...toFixtureView(row),
      events: events.map(toEventView(row.scheduledAt)),
    })),
  };
}

/** The managed club's fixture on a date, if it played that day. */
export async function getManagedClubFixtureOn(saveId: string, date: Date): Promise<FixtureView | null> {
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const row = await prisma.fixture.findFirst({
    where: { saveId, scheduledAt: date, ...involving(managed.id) },
    select: FIXTURE_SELECT,
  });
  return row === null ? null : toFixtureView(row);
}

/** A match of the same competition and day, with the minute and side of its goals to replay its score. */
export type ScoreTimeline = FixtureView & { goals: { id: string; minute: number; period: MatchEventView["period"]; side: Side }[] };

export type LiveMatchday = {
  match: FixtureWithEvents;
  stadium: string | null; // the home club's, when known
  // Whether the match waits live, its events stopping where it was played to (getLivePause says where); null once played.
  pause: "IN_PLAY" | "HALF_TIME" | "REGULATION_END" | null;
  others: ScoreTimeline[];
};

/**
 * The managed club's match of the save's current date with all its events, played or waiting live, and the
 * other matches its competition played that day; null when the managed club did not play on the current date.
 */
export async function getLiveMatchday(saveId: string): Promise<LiveMatchday | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const row = await prisma.fixture.findFirst({
    where: {
      saveId,
      scheduledAt: save.currentDate,
      status: { in: ["PLAYED", "IN_PLAY", "HALF_TIME", "REGULATION_END"] },
      ...involving(managed.id),
    },
    select: {
      ...FIXTURE_SELECT,
      homeClubSave: { select: { ...FIXTURE_SELECT.homeClubSave.select, club: { select: { ...TEAM_SELECT.select.club.select, stadium: true } } } },
      seasonId: true,
      status: true,
      events: EVENTS_SELECT,
    },
  });
  if (row === null) {
    return null;
  }

  const others = await prisma.fixture.findMany({
    where: { saveId, seasonId: row.seasonId, scheduledAt: save.currentDate, played: true, id: { not: row.id } },
    select: {
      ...FIXTURE_SELECT,
      events: { where: { type: "GOAL" }, orderBy: EVENTS_SELECT.orderBy, select: { id: true, minute: true, period: true, side: true } },
    },
  });

  const { events, status, ...fixture } = row;
  return {
    match: { ...toFixtureView(fixture), events: events.map(toEventView(fixture.scheduledAt)) },
    stadium: fixture.homeClubSave.club.stadium,
    pause: status === "PLAYED" || status === "SCHEDULED" ? null : status,
    // By home club, in the names shown: the database only knows the real ones.
    others: others
      .map(({ events: goals, ...other }): ScoreTimeline => ({
        ...toFixtureView(other),
        goals: goals.map((goal) => ({
          id: goal.id,
          minute: goal.minute,
          period: goal.period,
          side: goal.side === "HOME" ? "home" : "away",
        })),
      }))
      .sort((a, b) => a.home.name.localeCompare(b.home.name, "fr")),
  };
}
