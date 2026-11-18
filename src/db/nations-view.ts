import { cache } from "react";
import { displayClubName } from "../engine/club-name";
import { rankFormations } from "../engine/formation-choice";
import { isNationCode, NATIONS, nationByCode, type NationCode, type NationZone } from "../engine/nations";
import { POSITION_GROUPS, positionGroup, type Position } from "../engine/positions";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";
import { fitnessAtKickOff } from "./fitness-view";
import { managedPlayersSchema, readCallUps, readReserves, type NationPlayer } from "./nations";

// What the screens show of the national teams (docs/design/selections.md § 9): the managed club's players at a break,
// before it and back from it, and the 14 nations with their 23. Reads only.

const DAY_MS = 86_400_000;
/** Days between a break's first and last dates: its Friday and its Tuesday. */
const BREAK_SPAN_DAYS = 4;
const FAR_FUTURE = new Date(Date.UTC(9999, 0, 1));

const shortName = (player: { firstName: string; lastName: string }): string => `${player.firstName.charAt(0)}. ${player.lastName}`;

/** A nation's code as a match row holds it, checked. */
function nationCode(code: string): NationCode {
  if (!isNationCode(code)) {
    throw new Error(`Unknown nation ${code}`);
  }
  return code;
}

/** A break's dates: those of its matches, from the first to the last within BREAK_SPAN_DAYS of it. */
function breakSpan(dates: readonly Date[]): { from: Date; to: Date } | null {
  const [first] = dates;
  if (first === undefined) {
    return null;
  }
  const within = dates.filter((date) => date.getTime() - first.getTime() <= BREAK_SPAN_DAYS * DAY_MS);
  return { from: first, to: within[within.length - 1] };
}

/** One of the managed club's players at a break. */
export type BreakPlayer = {
  playerSaveId: string;
  playerKey: string;
  name: string; // « K. Diallo »
  nation: NationCode;
  matches: number; // back from the break: the matches he played; before it, 0
  goals: number;
  injuredUntil: Date | null; // back from the break, injured with his national team: until when
  fitness: number; // at the club's next match
};

/**
 * The managed club's international break as the screens tell it: "upcoming" from its last date before the break (the
 * save's next step is the break), with its players the nations call (readCallUps: the very call-up of the break);
 * "back" on the break's last date, the step just played, with those who played, their goals and their injuries. null
 * otherwise, and in a save without nations.
 */
export type ManagedBreak = {
  state: "upcoming" | "back";
  from: Date;
  to: Date;
  players: BreakPlayer[];
};

export const getManagedBreak = cache(async (saveId: string): Promise<ManagedBreak | null> => {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, breaksFrom: true } });
  if (save.breaksFrom === null) {
    return null;
  }
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const [nextMatch, upcoming, lastPlayed] = await Promise.all([
    prisma.fixture.findFirst({
      where: { saveId, played: false, season: { completed: false }, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    }),
    prisma.internationalMatch.findMany({
      where: { saveId, played: false },
      orderBy: { scheduledAt: "asc" },
      take: NATIONS.length, // a break's two dates
      select: { scheduledAt: true },
    }),
    prisma.internationalMatch.findFirst({ where: { saveId, played: true }, orderBy: { scheduledAt: "desc" }, select: { scheduledAt: true } }),
  ]);

  // The break comes before the managed club's next match: its players' call-ups are what they will be, the club playing
  // no match before it (other clubs may: a call-up only reads injuries and their clubs, nothing the club's players risk).
  const next = breakSpan(upcoming.map((match) => match.scheduledAt));
  if (next !== null && next.from < (nextMatch?.scheduledAt ?? FAR_FUTURE)) {
    const called = await readCallUps(prisma, saveId, next.from, save.currentDate);
    const players = [...called.values()]
      .flat()
      .filter((player) => player.clubSaveId === managed.id && player.playerSaveId !== null)
      .map(
        (player): BreakPlayer => ({
          playerSaveId: player.playerSaveId ?? "",
          playerKey: player.id,
          name: shortName(player),
          nation: player.nation,
          matches: 0,
          goals: 0,
          injuredUntil: null,
          fitness: player.fitness,
        }),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return { state: "upcoming", ...next, players };
  }

  if (lastPlayed === null || lastPlayed.scheduledAt.getTime() !== save.currentDate.getTime()) {
    return null;
  }
  const to = lastPlayed.scheduledAt;
  const matches = await prisma.internationalMatch.findMany({
    where: { saveId, played: true, scheduledAt: { gte: new Date(to.getTime() - BREAK_SPAN_DAYS * DAY_MS), lte: to } },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true, home: true, away: true, managedPlayers: true },
  });
  const lines = matches.flatMap((match) =>
    managedPlayersSchema.parse(match.managedPlayers ?? []).map((line) => ({ ...line, nation: nationCode(line.side === "home" ? match.home : match.away) })),
  );
  const rows = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: [...new Set(lines.map((line) => line.playerKey))] } },
    select: { id: true, playerKey: true, firstName: true, lastName: true, fitness: true, injuredUntil: true, clubSaveId: true },
  });
  const players = rows
    // Still the club's: a player is never sold during a break, but a player released since is no longer its concern.
    .filter((row) => row.clubSaveId === managed.id)
    .map((row): BreakPlayer => {
      const ofPlayer = lines.filter((line) => line.playerKey === row.playerKey);
      const injured = ofPlayer.some((line) => line.injuryDays !== null) && row.injuredUntil !== null && row.injuredUntil > save.currentDate;
      return {
        playerSaveId: row.id,
        playerKey: row.playerKey,
        name: shortName(row),
        nation: ofPlayer[0].nation,
        matches: ofPlayer.filter((line) => line.minutes > 0).length,
        goals: ofPlayer.reduce((sum, line) => sum + line.goals, 0),
        injuredUntil: injured ? row.injuredUntil : null,
        fitness: nextMatch === null ? row.fitness : fitnessAtKickOff(row.fitness, save.currentDate, nextMatch.scheduledAt),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { state: "back", from: matches[0]?.scheduledAt ?? to, to, players };
});

/**
 * The injuries the managed club's players came back with from the season's breaks, by player key: the nation and the
 * day, for a sheet to say « Blessé avec le Sénégal le 13/10 » while he is out (the caller compares his injury's end).
 */
export async function internationalInjuries(
  saveId: string,
  startYear: number,
): Promise<Map<string, { nation: NationCode; on: Date; until: Date }>> {
  const matches = await prisma.internationalMatch.findMany({
    where: { saveId, startYear, played: true, managedPlayers: { not: Prisma.DbNull } },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true, home: true, away: true, managedPlayers: true },
  });
  const injuries = new Map<string, { nation: NationCode; on: Date; until: Date }>();
  for (const match of matches) {
    for (const line of managedPlayersSchema.parse(match.managedPlayers ?? [])) {
      if (line.injuryDays !== null) {
        injuries.set(line.playerKey, {
          nation: nationCode(line.side === "home" ? match.home : match.away),
          on: match.scheduledAt,
          until: new Date(match.scheduledAt.getTime() + line.injuryDays * DAY_MS),
        });
      }
    }
  }
  return injuries;
}

/** A break of the season as the calendar shows it: its dates, and the managed club's players it took. */
export type SeasonBreak = {
  from: Date;
  to: Date;
  played: boolean;
  called: number | null; // the club's players its nations called (played, or the next break); null: not known yet
  injured: number; // of them, injured with their national team
};

/** The international breaks of a season, in order (the matches of a break within BREAK_SPAN_DAYS of its first). */
export async function getSeasonBreaks(saveId: string, startYear: number): Promise<SeasonBreak[]> {
  const matches = await prisma.internationalMatch.findMany({
    where: { saveId, startYear },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true, played: true, managedPlayers: true },
  });
  const breaks: { from: Date; to: Date; matches: typeof matches }[] = [];
  for (const match of matches) {
    const current = breaks.at(-1);
    if (current !== undefined && match.scheduledAt.getTime() - current.from.getTime() <= BREAK_SPAN_DAYS * DAY_MS) {
      current.to = match.scheduledAt;
      current.matches.push(match);
    } else {
      breaks.push({ from: match.scheduledAt, to: match.scheduledAt, matches: [match] });
    }
  }
  const upcoming = breaks.some((entry) => entry.matches.some((match) => !match.played)) ? await getManagedBreak(saveId) : null;
  return breaks.map(({ from, to, matches: ofBreak }): SeasonBreak => {
    const played = ofBreak.every((match) => match.played);
    if (!played) {
      const next = upcoming?.state === "upcoming" && upcoming.from.getTime() === from.getTime() ? upcoming : null;
      return { from, to, played, called: next === null ? null : next.players.length, injured: 0 };
    }
    const lines = ofBreak.flatMap((match) => managedPlayersSchema.parse(match.managedPlayers ?? []));
    return {
      from,
      to,
      played,
      called: new Set(lines.map((line) => line.playerKey)).size,
      injured: new Set(lines.filter((line) => line.injuryDays !== null).map((line) => line.playerKey)).size,
    };
  });
}

// ------------------------------------------------------------------ The 14 nations (Match → Sélections)

export type NationSquadPlayer = {
  key: string;
  name: string;
  position: Position;
  overall: number;
  club: string | null; // null: outside our leagues, in his nation's reserve
  managed: boolean; // a player of the managed club
  caps: number;
  goals: number;
};

export type NationView = {
  code: NationCode;
  zone: NationZone;
  rank: number; // by strength: the points its eleven expects against the first divisions' average opponent
  eleven: number; // its eleven's average rating
  outside: number; // its 23's players outside our leagues
  players: NationSquadPlayer[]; // its 23, line by line, best first
};

export type InternationalResult = {
  date: Date;
  home: NationCode;
  away: NationCode;
  homeGoals: number;
  awayGoals: number;
  scorers: { side: "home" | "away"; minute: number; name: string; managed: boolean }[];
};

export type NationsView = {
  nations: NationView[];
  nextBreak: { from: Date; to: Date } | null;
  lastBreak: { from: Date; to: Date; results: InternationalResult[] } | null;
};

/**
 * The national teams of a save as they would be called today (readCallUps: each nation's 23, of our clubs or its
 * reserve), ranked by strength (rankFormations, the formation an AI club would choose), with the next break and the
 * results of the last one. null in a save without nations.
 */
export async function getNationsView(saveId: string): Promise<NationsView | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, breaksFrom: true } });
  if (save.breaksFrom === null) {
    return null;
  }
  const called = await readCallUps(prisma, saveId, save.currentDate, save.currentDate);
  const clubIds = [...new Set([...called.values()].flat().flatMap((player) => (player.clubSaveId === null ? [] : [player.clubSaveId])))];
  const [clubs, upcoming, lastPlayed] = await Promise.all([
    prisma.clubSave.findMany({ where: { saveId, id: { in: clubIds } }, select: { id: true, isManaged: true, club: { select: { slug: true, name: true } } } }),
    prisma.internationalMatch.findMany({ where: { saveId, played: false }, orderBy: { scheduledAt: "asc" }, take: NATIONS.length, select: { scheduledAt: true } }),
    prisma.internationalMatch.findFirst({ where: { saveId, played: true }, orderBy: { scheduledAt: "desc" }, select: { scheduledAt: true } }),
  ]);
  const clubById = new Map(clubs.map((club) => [club.id, club]));

  const squadPlayer = (player: NationPlayer): NationSquadPlayer => {
    const club = player.clubSaveId === null ? undefined : clubById.get(player.clubSaveId);
    return {
      key: player.id,
      name: shortName(player),
      position: player.position,
      overall: player.overall,
      club: club === undefined ? null : displayClubName(club.club),
      managed: club?.isManaged === true,
      caps: player.caps,
      goals: player.goals,
    };
  };
  const lineOrder = (player: NationPlayer): number => POSITION_GROUPS.indexOf(positionGroup(player.position));
  const nations = [...called]
    .map(([code, players]) => {
      const [best] = rankFormations(players, 1);
      const eleven = best.lineup.starters.reduce((sum, { player }) => sum + player.overall, 0) / Math.max(1, best.lineup.starters.length);
      return {
        code,
        zone: nationByCode(code).zone,
        points: best.points,
        eleven: Math.round(eleven * 10) / 10,
        outside: players.filter((player) => player.playerSaveId === null).length,
        players: [...players].sort((a, b) => lineOrder(a) - lineOrder(b) || b.overall - a.overall || (a.id < b.id ? -1 : 1)).map(squadPlayer),
      };
    })
    .sort((a, b) => b.points - a.points || (a.code < b.code ? -1 : 1))
    // Ranked by the points expected, which the screen does not show.
    .map(({ code, zone, eleven, outside, players }, index): NationView => ({ code, zone, rank: index + 1, eleven, outside, players }));

  let lastBreak: NationsView["lastBreak"] = null;
  if (lastPlayed !== null) {
    const to = lastPlayed.scheduledAt;
    const matches = await prisma.internationalMatch.findMany({
      where: { saveId, played: true, scheduledAt: { gte: new Date(to.getTime() - BREAK_SPAN_DAYS * DAY_MS), lte: to } },
      orderBy: [{ scheduledAt: "asc" }, { home: "asc" }],
      select: { scheduledAt: true, home: true, away: true, homeGoals: true, awayGoals: true, goalTimes: true, scorers: true },
    });
    const keys = [...new Set(matches.flatMap((match) => match.scorers))];
    const [rows, reserves] = [
      await prisma.playerSave.findMany({
        where: { saveId, playerKey: { in: keys } },
        select: { playerKey: true, firstName: true, lastName: true, clubSave: { select: { isManaged: true } } },
      }),
      await readReserves(prisma, saveId),
    ];
    const nameByKey = new Map<string, { name: string; managed: boolean }>([
      ...rows.map((row) => [row.playerKey, { name: shortName(row), managed: row.clubSave?.isManaged === true }] as const),
      ...reserves.flatMap((nation) => nation.reserve.map((player) => [player.key, { name: shortName(player), managed: false }] as const)),
    ]);
    lastBreak = {
      from: matches[0]?.scheduledAt ?? to,
      to,
      results: matches.map((match) => ({
        date: match.scheduledAt,
        home: nationCode(match.home),
        away: nationCode(match.away),
        homeGoals: match.homeGoals ?? 0,
        awayGoals: match.awayGoals ?? 0,
        scorers: match.goalTimes.map((time, index) => {
          const scorer = nameByKey.get(match.scorers[index] ?? "");
          return { side: time > 0 ? ("home" as const) : ("away" as const), minute: Math.abs(time), name: scorer?.name ?? "?", managed: scorer?.managed ?? false };
        }),
      })),
    };
  }

  return { nations, nextBreak: breakSpan(upcoming.map((match) => match.scheduledAt)), lastBreak };
}
