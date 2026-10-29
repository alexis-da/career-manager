import { monthEndDate, seasonEndDate, seasonStartYear, upcomingWindowCloseDate } from "../engine/world";
import { FIXTURE_SELECT, toFixtureView, type FixtureView } from "./calendar";
import { prisma } from "./client";
import { assertNoMatchInProgress, playNextMatchday } from "./matchday";
import { getStandings } from "./standings";

const DAY_MS = 86_400_000;

/** Matchdays one call plays at most: about 0.8 s each, so a call stays under 5 s. */
export const SIMULATION_MAX_MATCHDAYS = 5;

export type SimulationTarget =
  | { kind: "next-match" }
  | { kind: "month-end" }
  | { kind: "window-close" }
  | { kind: "season-end" }
  | { kind: "date"; date: Date };

export type SimulationPlan = {
  matchInProgress: boolean; // the managed club's match waits at half-time: nothing can be simulated before it ends
  fromDate: Date; // the save's current date before the simulation
  untilDate: Date; // last day whose matchdays are played, never past the season's end
  matchdays: number; // dates with fixtures to play from the day after fromDate to untilDate
};

/** A match of the managed club played by a simulation. */
export type SimulatedMatch = FixtureView & {
  autoFilledSlots: number; // starters picked automatically in place of the saved lineup's
};

export type SimulationBatch = {
  played: number; // matchdays played by this call
  nextDate: Date | null; // date of the next matchday of the season in progress; null once it is all played
  done: boolean; // nothing left to play up to untilDate
  matches: SimulatedMatch[]; // the managed club's matches of this call, in date order
};

export type SimulationSummary = {
  rankBefore: number | null; // null when the managed club had not played yet
  rankAfter: number | null;
  clubCount: number;
  injuries: { playerName: string; date: Date; injuredUntil: Date | null }[];
  expiredContracts: { playerName: string; contractUntil: Date }[];
};

/** Fixtures of the seasons in progress: a simulation never plays a fixture of another season. */
const IN_PROGRESS = { season: { completed: false } } as const;

const fullName = (player: { firstName: string; lastName: string }): string => `${player.firstName} ${player.lastName}`;

async function nextMatchdayDate(saveId: string): Promise<Date | null> {
  const next = await prisma.fixture.findFirst({
    where: { saveId, played: false, ...IN_PROGRESS },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });
  return next?.scheduledAt ?? null;
}

async function managedClubSaveId(saveId: string): Promise<string> {
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  return managed.id;
}

/**
 * The last day a simulation toward a target plays, and how many matchdays that is. Every target stops at the end
 * of the season of the save's current date: the next season only starts through advanceToNextSeason.
 */
export async function planSimulation(saveId: string, target: SimulationTarget): Promise<SimulationPlan> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, liveFixtureId: true } });
  const fromDate = save.currentDate;
  if (save.liveFixtureId !== null) {
    return { matchInProgress: true, fromDate, untilDate: fromDate, matchdays: 0 };
  }
  const seasonEnd = seasonEndDate(seasonStartYear(fromDate));

  let wanted: Date;
  switch (target.kind) {
    case "next-match": {
      const managedId = await managedClubSaveId(saveId);
      const next = await prisma.fixture.findFirst({
        where: { saveId, played: false, ...IN_PROGRESS, OR: [{ homeClubSaveId: managedId }, { awayClubSaveId: managedId }] },
        orderBy: { scheduledAt: "asc" },
        select: { scheduledAt: true },
      });
      wanted = next?.scheduledAt ?? fromDate;
      break;
    }
    case "month-end":
      wanted = monthEndDate(fromDate);
      break;
    case "window-close":
      wanted = upcomingWindowCloseDate(fromDate);
      break;
    case "season-end":
      wanted = seasonEnd;
      break;
    case "date":
      wanted = target.date;
      break;
  }
  const untilDate = wanted > seasonEnd ? seasonEnd : wanted;

  const dates = await prisma.fixture.groupBy({
    by: ["scheduledAt"],
    where: { saveId, played: false, ...IN_PROGRESS, scheduledAt: { lte: untilDate } },
  });
  return { matchInProgress: false, fromDate, untilDate, matchdays: dates.length };
}

export type IntermediateBatch = {
  played: number; // dates played by this call, none of them with a match of the managed club
  done: boolean; // the next date to play is the managed club's match, or it has none left
};

/**
 * « Prochain match » of a worldVersion 2 save: plays at most maxMatchdays dates of the season in progress before the
 * managed club's next match date, the other competitions' midweek and rest-week matchdays, through simulateMatchdays
 * (one transaction each). The client calls it again until done, then plays the managed club's date as « Jouer la
 * journée » does, half-time pause included. Without a match left for the managed club, done at once.
 */
export async function playUntilNextMatch(
  saveId: string,
  maxMatchdays: number = SIMULATION_MAX_MATCHDAYS,
): Promise<IntermediateBatch> {
  const managedId = await managedClubSaveId(saveId);
  const next = await prisma.fixture.findFirst({
    where: { saveId, played: false, ...IN_PROGRESS, OR: [{ homeClubSaveId: managedId }, { awayClubSaveId: managedId }] },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });
  if (next === null) {
    return { played: 0, done: true };
  }
  // The day before the managed club's match: its date is left to playNextMatchday, with the half-time pause.
  const batch = await simulateMatchdays(saveId, new Date(next.scheduledAt.getTime() - DAY_MS), maxMatchdays);
  return { played: batch.played, done: batch.done };
}

/**
 * Plays at most maxMatchdays matchdays of the season in progress dated untilDate or earlier, one transaction
 * each through playNextMatchday, the managed club's matches included, without a half-time pause. Never moves to
 * the next season. With nothing to play, writes nothing. Refused with MatchInProgressError while the managed
 * club's match waits at half-time.
 */
export async function simulateMatchdays(
  saveId: string,
  untilDate: Date,
  maxMatchdays: number = SIMULATION_MAX_MATCHDAYS,
): Promise<SimulationBatch> {
  await assertNoMatchInProgress(prisma, saveId);
  const managedMatches: { fixtureId: string; autoFilledSlots: number }[] = [];
  let played = 0;
  let next = await nextMatchdayDate(saveId);

  while (played < maxMatchdays && next !== null && next <= untilDate) {
    const matchday = await playNextMatchday(saveId);
    if (matchday === null) {
      break;
    }
    played++;
    if (matchday.managed !== null) {
      managedMatches.push(matchday.managed);
    }
    next = await nextMatchdayDate(saveId);
  }

  const rows =
    managedMatches.length === 0
      ? []
      : await prisma.fixture.findMany({
          where: { saveId, id: { in: managedMatches.map((match) => match.fixtureId) } },
          orderBy: { scheduledAt: "asc" },
          select: FIXTURE_SELECT,
        });
  const autoFilledById = new Map(managedMatches.map((match) => [match.fixtureId, match.autoFilledSlots]));

  return {
    played,
    nextDate: next,
    done: next === null || next > untilDate,
    matches: rows.map((row) => ({ ...toFixtureView(row), autoFilledSlots: autoFilledById.get(row.id) ?? 0 })),
  };
}

/**
 * What happened to the managed club since fromDate, the save's date before a simulation: its rank then and now,
 * the injuries of its players in its matches, and the contracts of its players that ended.
 */
export async function getSimulationSummary(saveId: string, fromDate: Date): Promise<SimulationSummary> {
  const [save, managedId] = await Promise.all([
    prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } }),
    managedClubSaveId(saveId),
  ]);
  const toDate = save.currentDate;
  const period = { gt: fromDate, lte: toDate };

  const involving = { OR: [{ homeClubSaveId: managedId }, { awayClubSaveId: managedId }] };
  // The managed club's league: the latest league season with a fixture of it.
  const season = await prisma.season.findFirst({
    where: { saveId, competition: { kind: "LEAGUE" }, fixtures: { some: { saveId, ...involving } } },
    orderBy: { startYear: "desc" },
    select: { id: true },
  });

  const [before, after, injuryEvents, expired] = await Promise.all([
    season === null ? [] : getStandings(saveId, season.id, { before: new Date(fromDate.getTime() + DAY_MS) }),
    season === null ? [] : getStandings(saveId, season.id),
    prisma.matchEvent.findMany({
      where: {
        type: "INJURY",
        fixture: { saveId, scheduledAt: period, ...involving },
      },
      orderBy: [{ fixture: { scheduledAt: "asc" } }, { minute: "asc" }],
      select: {
        side: true,
        fixture: { select: { scheduledAt: true, homeClubSaveId: true } },
        playerSave: { select: { firstName: true, lastName: true, injuredUntil: true } },
      },
    }),
    prisma.playerSave.findMany({
      where: { saveId, clubSaveId: managedId, contractUntil: period },
      orderBy: [{ contractUntil: "asc" }, { lastName: "asc" }],
      select: { firstName: true, lastName: true, contractUntil: true },
    }),
  ]);

  const managedRow = (rows: typeof after) => rows.find((row) => row.isManaged);
  const rankOf = (rows: typeof after): number | null => {
    const row = managedRow(rows);
    return row === undefined || row.played === 0 ? null : row.rank;
  };

  return {
    rankBefore: rankOf(before),
    rankAfter: rankOf(after),
    clubCount: after.length,
    injuries: injuryEvents
      // An injury event of the managed club's side: the other side's injuries are the opponent's.
      .filter((event) => (event.side === "HOME") === (event.fixture.homeClubSaveId === managedId))
      // Every match event is written with its player (matchEventRows): one without names no one to show.
      .flatMap((event) =>
        event.playerSave === null
          ? []
          : [
              {
                playerName: fullName(event.playerSave),
                date: event.fixture.scheduledAt,
                injuredUntil: event.playerSave.injuredUntil,
              },
            ],
      ),
    expiredContracts: expired.flatMap((player) =>
      player.contractUntil === null ? [] : [{ playerName: fullName(player), contractUntil: player.contractUntil }],
    ),
  };
}
