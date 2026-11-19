import { monthEndDate, seasonEndDate, seasonStartYear, upcomingWindowCloseDate } from "../engine/world";
import { FIXTURE_SELECT, toFixtureView, type FixtureView } from "./calendar";
import { prisma } from "./client";
import { assertNoMatchInProgress, playNextMatchday } from "./matchday";
import { managedPlayersSchema } from "./nations";
import { coachSaveOf, COACH_SAVE_SELECT, currentNationalSession, nextNationalStop, type CoachSave } from "./national-team";
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
  played: number; // matchdays played by this call, an international break counting as one
  nextDate: Date | null; // date of the next matchday of the season in progress; null once it is all played
  done: boolean; // nothing left to play up to untilDate
  matches: SimulatedMatch[]; // the managed club's matches of this call, in date order
  breakPlayed: boolean; // an international break was among them (with stopAfterBreak, the last step)
  nationalStop: boolean; // with untilNationalStop: it stopped before a national coach's match at stake
};

export type SimulationSummary = {
  rankBefore: number | null; // null when the managed club had not played yet
  rankAfter: number | null;
  clubCount: number;
  // nation: the national team he was injured with (its code), null in a match of the managed club
  injuries: { playerName: string; date: Date; injuredUntil: Date | null; nation: string | null }[];
  expiredContracts: { playerName: string; contractUntil: Date }[];
  // The international breaks played: the managed club's players called, with their matches and goals; for a national
  // coach, his nation's matches (and a summer tournament, by its code: « int.eu »).
  breaks: {
    from: Date;
    to: Date;
    tournament: string | null;
    players: { playerName: string; nation: string; matches: number; goals: number }[];
    national: { home: string; away: string; homeGoals: number; awayGoals: number; competition: string; round: number; pool: number | null }[];
  }[];
};

/** Fixtures of the seasons in progress: a simulation never plays a fixture of another season. */
const IN_PROGRESS = { season: { completed: false } } as const;

const fullName = (player: { firstName: string; lastName: string }): string => `${player.firstName} ${player.lastName}`;

/** The save's national coach, or null when its player coaches no nation. */
async function coachOf(saveId: string): Promise<CoachSave | null> {
  return coachSaveOf(await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: COACH_SAVE_SELECT }));
}

/**
 * The next date of the season in progress: of its clubs, or of an international break, which plays as one step; for a
 * national coach, the next date of his break or summer tournament (played in steps, src/db/national-team.ts).
 */
async function nextMatchdayDate(saveId: string): Promise<Date | null> {
  const next = await prisma.fixture.findFirst({
    where: { saveId, played: false, ...IN_PROGRESS },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });
  const coach = await coachOf(saveId);
  const session = coach === null ? null : await currentNationalSession(prisma, coach);
  const nextBreak =
    coach === null
      ? await prisma.internationalMatch.findFirst({
          where: { saveId, played: false },
          orderBy: { scheduledAt: "asc" },
          select: { scheduledAt: true },
        })
      : session === null
        ? null
        : { scheduledAt: session.next };
  if (nextBreak !== null && (next === null || nextBreak.scheduledAt < next.scheduledAt)) {
    return nextBreak.scheduledAt;
  }
  return next?.scheduledAt ?? null;
}

/**
 * The steps from the save's date to untilDate: each date of the clubs, and each international break (its dates in a
 * row, without a date of the clubs between them), played in one step.
 */
async function stepsUntil(saveId: string, untilDate: Date): Promise<number> {
  const [clubDates, internationalDates] = await Promise.all([
    prisma.fixture.groupBy({ by: ["scheduledAt"], where: { saveId, played: false, ...IN_PROGRESS, scheduledAt: { lte: untilDate } } }),
    prisma.internationalMatch.groupBy({ by: ["scheduledAt"], where: { saveId, played: false, scheduledAt: { lte: untilDate } } }),
  ]);
  // A national coach's summer tournament, its dates not written yet: one step, as a break.
  const coach = await coachOf(saveId);
  const session = coach === null ? null : await currentNationalSession(prisma, coach);
  const tournament = session?.kind === "tournament" && session.next <= untilDate ? [{ scheduledAt: session.next }] : [];
  const dates = [
    ...clubDates.map(({ scheduledAt }) => ({ time: scheduledAt.getTime(), international: false })),
    ...[...internationalDates, ...tournament].map(({ scheduledAt }) => ({ time: scheduledAt.getTime(), international: true })),
  ].sort((a, b) => a.time - b.time);
  return dates.filter((date, index) => !date.international || index === 0 || !dates[index - 1].international).length;
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
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, liveFixtureId: true, liveInternationalId: true } });
  const fromDate = save.currentDate;
  if (save.liveFixtureId !== null || save.liveInternationalId !== null) {
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
      // A national coach's next match at stake, when it comes first.
      const coach = await coachOf(saveId);
      const stop = coach === null ? null : await nextNationalStop(prisma, coach);
      const club = next?.scheduledAt ?? null;
      wanted = stop !== null && (club === null || stop.date < club) ? stop.date : (club ?? fromDate);
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
  return { matchInProgress: false, fromDate, untilDate, matchdays: await stepsUntil(saveId, untilDate) };
}

export type IntermediateBatch = {
  played: number; // dates played by this call, none of them with a match of the managed club
  done: boolean; // the next date to play is the managed club's match (or his national team's at stake), or it has none left
  breakPlayed: boolean; // an international break was its last step: the manager sees who comes back before his match
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
  // A national coach's next match at stake, before his club's: the way stops before it, for him to play it live.
  const coach = await coachOf(saveId);
  const stop = coach === null ? null : await nextNationalStop(prisma, coach);
  const target = stop !== null && (next === null || stop.date < next.scheduledAt) ? stop.date : (next?.scheduledAt ?? null);
  if (target === null) {
    return { played: 0, done: true, breakPlayed: false };
  }
  // The day before the managed club's match: its date is left to playNextMatchday, with the half-time pause. An
  // international break stops the way there: the manager sees who comes back tired or injured before his match.
  const batch = await simulateMatchdays(saveId, new Date(target.getTime() - DAY_MS), maxMatchdays, {
    stopAfterBreak: true,
    untilNationalStop: coach !== null,
  });
  return { played: batch.played, done: batch.done || batch.nationalStop, breakPlayed: batch.breakPlayed };
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
  { stopAfterBreak = false, untilNationalStop = false }: { stopAfterBreak?: boolean; untilNationalStop?: boolean } = {},
): Promise<SimulationBatch> {
  await assertNoMatchInProgress(prisma, saveId);
  const managedMatches: { fixtureId: string; autoFilledSlots: number }[] = [];
  let played = 0;
  let breakPlayed = false;
  let nationalStop = false;
  let next = await nextMatchdayDate(saveId);

  while (played < maxMatchdays && next !== null && next <= untilDate) {
    const matchday = await playNextMatchday(saveId, { untilNationalStop });
    if (matchday === null) {
      break;
    }
    // A national coach's match at stake next: left to him (« Prochain match » then plays it live).
    if (matchday.national?.stopNext === true) {
      nationalStop = true;
      if (matchday.national.played === 0) {
        break;
      }
    }
    played++;
    if (matchday.managed !== null) {
      managedMatches.push(matchday.managed);
    }
    next = await nextMatchdayDate(saveId);
    if (matchday.internationalBreak !== undefined) {
      breakPlayed = true;
      if (stopAfterBreak) {
        break;
      }
    }
    if (nationalStop) {
      break;
    }
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
    breakPlayed,
    nationalStop,
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

  const breaks = await breaksBetween(saveId, period);

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
      .flatMap((event): SimulationSummary["injuries"] =>
        event.playerSave === null
          ? []
          : [
              {
                playerName: fullName(event.playerSave),
                date: event.fixture.scheduledAt,
                injuredUntil: event.playerSave.injuredUntil,
                nation: null,
              },
            ],
      )
      .concat(breaks.injuries)
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
    expiredContracts: expired.flatMap((player) =>
      player.contractUntil === null ? [] : [{ playerName: fullName(player), contractUntil: player.contractUntil }],
    ),
    breaks: breaks.breaks,
  };
}

/** Days between two dates of the same break, at most: its Friday and its Tuesday. */
const BREAK_SPAN_DAYS = 4;

/**
 * The international breaks played in a period, from their matches (InternationalMatch.managedPlayers): each with the
 * managed club's players its nations called, their matches and goals, and those injured with their national team.
 */
async function breaksBetween(
  saveId: string,
  period: { gt: Date; lte: Date },
): Promise<{ breaks: SimulationSummary["breaks"]; injuries: SimulationSummary["injuries"] }> {
  const matches = await prisma.internationalMatch.findMany({
    where: { saveId, played: true, scheduledAt: period },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true, home: true, away: true, managedPlayers: true, competition: true, round: true, pool: true, homeGoals: true, awayGoals: true },
  });
  const { nationCode } = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { nationCode: true } });
  if (matches.length === 0) {
    return { breaks: [], injuries: [] };
  }
  const lines = matches.flatMap((match) =>
    managedPlayersSchema.parse(match.managedPlayers ?? []).map((player) => ({
      ...player,
      date: match.scheduledAt,
      nation: player.side === "home" ? match.home : match.away,
    })),
  );
  const players = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: [...new Set(lines.map((line) => line.playerKey))] } },
    select: { playerKey: true, firstName: true, lastName: true, injuredUntil: true },
  });
  const playerByKey = new Map(players.map((player) => [player.playerKey, player]));

  const groups: { from: Date; to: Date }[] = [];
  for (const match of matches) {
    const current = groups.at(-1);
    if (current !== undefined && match.scheduledAt.getTime() - current.to.getTime() <= BREAK_SPAN_DAYS * DAY_MS) {
      current.to = match.scheduledAt;
    } else {
      groups.push({ from: match.scheduledAt, to: match.scheduledAt });
    }
  }
  const breaks = groups.map((group) => {
    const ofBreak = lines.filter((line) => line.date >= group.from && line.date <= group.to);
    const byPlayer = Map.groupBy(ofBreak, (line) => line.playerKey);
    const inGroup = matches.filter((match) => match.scheduledAt >= group.from && match.scheduledAt <= group.to);
    return {
      ...group,
      tournament: inGroup.find((match) => match.competition === "int.eu" || match.competition === "int.world")?.competition ?? null,
      national: inGroup
        .filter((match) => nationCode !== null && (match.home === nationCode || match.away === nationCode))
        .map((match) => ({
          home: match.home,
          away: match.away,
          homeGoals: match.homeGoals ?? 0,
          awayGoals: match.awayGoals ?? 0,
          competition: match.competition,
          round: match.round,
          pool: match.pool,
        })),
      players: [...byPlayer].flatMap(([playerKey, entries]) => {
        const player = playerByKey.get(playerKey);
        return player === undefined
          ? []
          : [
              {
                playerName: fullName(player),
                nation: entries[0].nation,
                matches: entries.filter((entry) => entry.minutes > 0).length,
                goals: entries.reduce((sum, entry) => sum + entry.goals, 0),
              },
            ];
      }),
    };
  });
  const injuries = lines.flatMap((line) => {
    const player = playerByKey.get(line.playerKey);
    return line.injuryDays === null || player === undefined
      ? []
      : [{ playerName: fullName(player), date: line.date, injuredUntil: player.injuredUntil, nation: line.nation }];
  });
  return { breaks, injuries };
}
