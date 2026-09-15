import type { MatchEventType } from "../engine/match";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";

export type TeamView = {
  clubSaveId: string;
  name: string;
  isManaged: boolean;
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
  side: "home" | "away" | null; // null when the player has since left both clubs
  playerName: string;
  relatedPlayerName: string | null; // assist provider of a goal, player going off in a substitution
};

export type FixtureWithEvents = FixtureView & { events: MatchEventView[] };

export type ClubCalendar = {
  startYear: number | null;
  fixtures: FixtureWithEvents[];
};

const TEAM_SELECT = { select: { id: true, isManaged: true, club: { select: { name: true } } } } as const;

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
    select: {
      ...FIXTURE_SELECT,
      events: {
        // Events are written in match order, so the id breaks ties within a minute.
        orderBy: [{ minute: "asc" }, { id: "asc" }],
        select: {
          id: true,
          minute: true,
          type: true,
          playerSave: { select: { firstName: true, lastName: true, clubSaveId: true } },
          relatedPlayerSave: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  return {
    startYear: latest.startYear,
    fixtures: rows.map(({ events, ...row }) => {
      const fixture = toFixtureView(row);
      return {
        ...fixture,
        events: events.map((event) => {
          const clubSaveId = event.playerSave?.clubSaveId;
          return {
            id: event.id,
            minute: event.minute,
            type: event.type,
            side: clubSaveId === fixture.home.clubSaveId ? "home" : clubSaveId === fixture.away.clubSaveId ? "away" : null,
            playerName: event.playerSave === null ? "Joueur inconnu" : fullName(event.playerSave),
            relatedPlayerName: event.relatedPlayerSave === null ? null : fullName(event.relatedPlayerSave),
          };
        }),
      };
    }),
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
