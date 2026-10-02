import type { MatchEventType, Side } from "../engine/match";
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
  round: number;
  scheduledAt: Date;
  competitionName: string;
  home: TeamView;
  away: TeamView;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
};

export type MatchEventView = {
  id: string;
  minute: number;
  type: MatchEventType;
  side: Side; // stored with the event: the player's club may have changed since
  playerName: string;
  playerKey: string | null; // with his age on the match day, to draw his face
  playerAge: number | null;
  relatedPlayerName: string | null; // assist provider of a goal, player going off in a substitution
};

export type FixtureWithEvents = FixtureView & { events: MatchEventView[] };

export type ClubCalendar = {
  startYear: number | null;
  fixtures: FixtureWithEvents[];
};

const TEAM_SELECT = {
  select: { id: true, isManaged: true, club: { select: { name: true, primaryColor: true, secondaryColor: true } } },
} as const;

export const FIXTURE_SELECT = {
  id: true,
  round: true,
  scheduledAt: true,
  played: true,
  homeGoals: true,
  awayGoals: true,
  season: { select: { competition: { select: { name: true } } } },
  homeClubSave: TEAM_SELECT,
  awayClubSave: TEAM_SELECT,
} as const;

type FixtureRow = Prisma.FixtureGetPayload<{ select: typeof FIXTURE_SELECT }>;

const toTeamView = (clubSave: FixtureRow["homeClubSave"]): TeamView => ({
  clubSaveId: clubSave.id,
  name: clubSave.club.name,
  isManaged: clubSave.isManaged,
  colors: clubColorsOf(clubSave.club),
});

export function toFixtureView(row: FixtureRow): FixtureView {
  return {
    id: row.id,
    round: row.round,
    scheduledAt: row.scheduledAt,
    competitionName: row.season.competition.name,
    home: toTeamView(row.homeClubSave),
    away: toTeamView(row.awayClubSave),
    played: row.played,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
  };
}

const fullName = (player: { firstName: string; lastName: string }): string => `${player.firstName} ${player.lastName}`;

const involving = (clubSaveId: string) => ({ OR: [{ homeClubSaveId: clubSaveId }, { awayClubSaveId: clubSaveId }] });

const EVENTS_SELECT = {
  // Events are written in match order, so the id breaks ties within a minute.
  orderBy: [{ minute: "asc" }, { id: "asc" }],
  select: {
    id: true,
    minute: true,
    type: true,
    side: true,
    playerSave: { select: { firstName: true, lastName: true, playerKey: true, birthDate: true } },
    relatedPlayerSave: { select: { firstName: true, lastName: true } },
  },
} as const satisfies Prisma.Fixture$eventsArgs;

type EventRow = Prisma.MatchEventGetPayload<{ select: (typeof EVENTS_SELECT)["select"] }>;

const toEventView =
  (matchDate: Date) =>
  (event: EventRow): MatchEventView => ({
    id: event.id,
    minute: event.minute,
    type: event.type,
    side: event.side === "HOME" ? "home" : "away",
    playerName: event.playerSave === null ? "Joueur inconnu" : fullName(event.playerSave),
    playerKey: event.playerSave?.playerKey ?? null,
    playerAge: event.playerSave === null ? null : ageInYears(event.playerSave.birthDate, matchDate),
    relatedPlayerName: event.relatedPlayerSave === null ? null : fullName(event.relatedPlayerSave),
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
export type ScoreTimeline = FixtureView & { goals: { id: string; minute: number; side: Side }[] };

export type LiveMatchday = {
  match: FixtureWithEvents;
  others: ScoreTimeline[];
};

/**
 * The managed club's match of the save's current date with all its events, and the other matches its competition
 * played that day; null when the managed club did not play on the current date.
 */
export async function getLiveMatchday(saveId: string): Promise<LiveMatchday | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const row = await prisma.fixture.findFirst({
    where: { saveId, scheduledAt: save.currentDate, played: true, ...involving(managed.id) },
    select: { ...FIXTURE_SELECT, seasonId: true, events: EVENTS_SELECT },
  });
  if (row === null) {
    return null;
  }

  const others = await prisma.fixture.findMany({
    where: { saveId, seasonId: row.seasonId, scheduledAt: save.currentDate, played: true, id: { not: row.id } },
    orderBy: { homeClubSave: { club: { name: "asc" } } },
    select: {
      ...FIXTURE_SELECT,
      events: { where: { type: "GOAL" }, orderBy: EVENTS_SELECT.orderBy, select: { id: true, minute: true, side: true } },
    },
  });

  const { events, ...fixture } = row;
  return {
    match: { ...toFixtureView(fixture), events: events.map(toEventView(fixture.scheduledAt)) },
    others: others.map(({ events: goals, ...other }) => ({
      ...toFixtureView(other),
      goals: goals.map((goal) => ({ id: goal.id, minute: goal.minute, side: goal.side === "HOME" ? "home" : "away" })),
    })),
  };
}
