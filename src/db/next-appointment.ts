import { displayClubName } from "../engine/club-name";
import { isoWeekKey, isoWeekNumber } from "../lib/iso-week";
import { stakeOf, type Stake } from "../lib/session-end";
import { prisma } from "./client";
import { getStandings } from "./standings";

// The « À demain » card's reading (app/saves/[id]/_components/session-end-card.tsx), after a live match and after a
// simulation: the managed club's next match and what it is worth, and the week's challenge while it runs. Read only: no
// simulation, nothing written. `now` is real time, the caller's: a challenge's days left are the player's.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The managed club's next match: when, where, against whom, in which competition and stage, and its stake. */
export type AppointmentMatch = {
  scheduledAt: Date;
  home: boolean; // the managed club plays at home
  opponent: string;
  competitionCode: string;
  cup: boolean;
  round: number; // a league matchday, or a cup round
  stake: Stake;
};

/** The week's challenge while it runs: its number and end; this save's matchdays when it is the challenge's save. */
export type AppointmentChallenge = {
  weekNumber: number;
  endsAt: Date;
  daysLeft: number; // whole days, rounded up: 1 on its last day
  own: { played: number; horizon: number } | null;
};

export type NextAppointment = {
  match: AppointmentMatch | null; // null once the season's matches are all played
  leaguePlayed: number; // the managed club's league matches of the season: the assistant's word reads it
  challenge: AppointmentChallenge | null;
};

/**
 * What comes next for a save: the managed club's next match, in any competition of the seasons in progress (`excluded`:
 * the live match itself, still unplayed until its end), with its stake in the league table; and the week's challenge.
 */
export async function getNextAppointment(saveId: string, now: Date, excluded?: string): Promise<NextAppointment> {
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true, competitionId: true } });
  const involving = { OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] };
  const [next, season, save, challenge] = await Promise.all([
    prisma.fixture.findFirst({
      where: { saveId, played: false, season: { completed: false }, ...involving, ...(excluded === undefined ? {} : { id: { not: excluded } }) },
      orderBy: { scheduledAt: "asc" },
      select: {
        scheduledAt: true,
        round: true,
        homeClubSaveId: true,
        awayClubSaveId: true,
        season: { select: { competition: { select: { code: true, kind: true } } } },
        homeClubSave: { select: { club: { select: { slug: true, name: true } } } },
        awayClubSave: { select: { club: { select: { slug: true, name: true } } } },
      },
    }),
    prisma.season.findFirst({
      where: { saveId, competitionId: managed.competitionId, completed: false },
      orderBy: { startYear: "desc" },
      select: { id: true },
    }),
    prisma.save.findUniqueOrThrow({
      where: { id: saveId },
      select: { challengeEntry: { select: { matchdaysPlayed: true, challengeId: true } } },
    }),
    prisma.challenge.findUnique({ where: { weekKey: isoWeekKey(now) }, select: { id: true, weekKey: true, endsAt: true, horizonMatchdays: true } }),
  ]);
  const table = season === null ? [] : await getStandings(saveId, season.id);
  const leaguePlayed = table.find((row) => row.isManaged)?.played ?? 0;

  let match: AppointmentMatch | null = null;
  if (next !== null) {
    const home = next.homeClubSaveId === managed.id;
    const [own, opponent] = home ? [next.homeClubSave.club, next.awayClubSave.club] : [next.awayClubSave.club, next.homeClubSave.club];
    const cup = next.season.competition.kind === "CUP";
    match = {
      scheduledAt: next.scheduledAt,
      home,
      opponent: displayClubName(opponent),
      competitionCode: next.season.competition.code,
      cup,
      round: next.round,
      // The table knows its clubs by their slug.
      stake: stakeOf({ cup, table, own: own.slug, opponent: opponent.slug }),
    };
  }

  const daysLeft = challenge === null ? 0 : Math.ceil((challenge.endsAt.getTime() - now.getTime()) / DAY_MS);
  const entry = save.challengeEntry;
  return {
    match,
    leaguePlayed,
    challenge:
      challenge === null || daysLeft <= 0
        ? null
        : {
            weekNumber: isoWeekNumber(challenge.weekKey),
            endsAt: challenge.endsAt,
            daysLeft,
            own: entry !== null && entry.challengeId === challenge.id ? { played: entry.matchdaysPlayed, horizon: challenge.horizonMatchdays } : null,
          },
  };
}

/** The managed club's last match played, as the assistant's word reads it: its score, how it was decided, where, which competition. */
export type LastManagedResult = {
  homeGoals: number;
  awayGoals: number;
  decidedBy: "REGULATION" | "EXTRA_TIME" | "PENALTIES" | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  home: boolean; // the managed club played at home
  cup: boolean;
};

/** The managed club's last match played in the seasons in progress, or null before its first. */
export async function lastManagedResult(saveId: string): Promise<LastManagedResult | null> {
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const last = await prisma.fixture.findFirst({
    where: { saveId, played: true, season: { completed: false }, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
    orderBy: { scheduledAt: "desc" },
    select: {
      homeClubSaveId: true,
      homeGoals: true,
      awayGoals: true,
      decidedBy: true,
      homePenalties: true,
      awayPenalties: true,
      season: { select: { competition: { select: { kind: true } } } },
    },
  });
  if (last === null || last.homeGoals === null || last.awayGoals === null) {
    return null;
  }
  return {
    homeGoals: last.homeGoals,
    awayGoals: last.awayGoals,
    decidedBy: last.decidedBy,
    homePenalties: last.homePenalties,
    awayPenalties: last.awayPenalties,
    home: last.homeClubSaveId === managed.id,
    cup: last.season.competition.kind === "CUP",
  };
}
