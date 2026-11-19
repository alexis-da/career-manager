import { cache } from "react";
import { displayClubName } from "../engine/club-name";
import { rankFormations } from "../engine/formation-choice";
import { decodeGoalTimes } from "../engine/match";
import { isNationCode, NATIONS, nationByCode, type NationCode, type NationZone } from "../engine/nations";
import { POSITION_GROUPS, positionGroup, type Position } from "../engine/positions";
import {
  cycleOf,
  cycleQualifiers,
  drawTournament,
  FINAL_ROUND,
  FRIENDLY,
  HEMISPHERES_CUP,
  internationalTable,
  isInternationalCompetition,
  isTournament,
  OLD_CONTINENT_CUP,
  QUALIFIER_EUROPE,
  QUALIFIER_WORLD,
  SEMI_FINAL_ROUND,
  tournamentDates,
  tournamentPlaces,
  type InternationalCompetition,
  type InternationalTableRow,
  type TournamentCode,
} from "../engine/tournaments";
import { seasonStartYear } from "../engine/world";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";
import { coachSaveOf, COACH_SAVE_SELECT, currentNationalSession, sessionBefore } from "./national-team";
import { fitnessAtKickOff } from "./fitness-view";
import { managedPlayersSchema, readCallUps, readQualifierTables, readReserves, readStrengths, type NationPlayer } from "./nations";

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
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { ...COACH_SAVE_SELECT, breaksFrom: true } });
  if (save.breaksFrom === null) {
    return null;
  }
  // A national coach's break: his own list for his nation, and the 23 kept once it has started (src/db/national-team.ts).
  const coach = coachSaveOf(save);
  const coachSession = coach === null ? null : await currentNationalSession(prisma, coach);
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
    const called =
      coach !== null && coachSession !== null && coachSession.kind === "break"
        ? (await sessionBefore(prisma, coach, coachSession, coachSession.first)).called
        : await readCallUps(prisma, saveId, next.from, save.currentDate);
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
  competition: InternationalCompetition;
  round: number;
  pool: 0 | 1 | null; // a tournament group's match: its group
  home: NationCode;
  away: NationCode;
  homeGoals: number;
  awayGoals: number;
  decidedBy: "REGULATION" | "EXTRA_TIME" | "PENALTIES" | null;
  penalties: { home: number; away: number } | null;
  scorers: { side: "home" | "away"; minute: number; extraTime: boolean; name: string; managed: boolean }[];
};

/** A zone's qualifiers in the cycle in progress: its table, and its places in the tournament. */
export type ZoneTableView = {
  zone: NationZone;
  competition: typeof QUALIFIER_EUROPE | typeof QUALIFIER_WORLD;
  places: number;
  rows: InternationalTableRow[];
};

/** A summer tournament: drawn once its cycle's qualifiers are over, then played at the season's transition. */
export type TournamentView = {
  tournament: TournamentCode;
  year: number;
  from: Date;
  to: Date;
  state: "drawn" | "played";
  groups: { pool: 0 | 1; rows: InternationalTableRow[] }[]; // drawn: in the order of the pots, no match played
  results: InternationalResult[]; // played: the groups' matches, then the semi-finals and the final
  winner: NationCode | null;
  runnerUp: NationCode | null;
  yours: { name: string; nation: NationCode; matches: number; goals: number; champion: boolean }[]; // the managed club's players in it
};

/** The cycle in progress: the tournament it leads to, its breaks played, its qualifiers' tables, its draw once made. */
export type CampaignView = {
  tournament: TournamentCode;
  year: number;
  breaksPlayed: number; // of the cycle's CYCLE_BREAKS
  zones: ZoneTableView[];
  draw: TournamentView | null;
};

export type NationsView = {
  nations: NationView[];
  nextBreak: { from: Date; to: Date } | null;
  lastBreak: { from: Date; to: Date; results: InternationalResult[] } | null;
  campaign: CampaignView | null;
  lastTournament: TournamentView | null;
  freshTournament: boolean; // the last tournament was played the June just gone: the screen shows it first
};

/** A cycle's breaks: four a season, two seasons. */
export const CYCLE_BREAKS = 8;

/** One of the managed club's internationals: his caps and goals for his nation while he played for the club. */
export type ClubInternational = { playerKey: string; name: string; nation: NationCode; caps: number; goals: number };

/**
 * The managed club's internationals over the career (docs/design/selections.md § 9.9): every international match keeps
 * the club's players of its squads (InternationalMatch.managedPlayers), so their caps and goals while at the club, the
 * most capped first. null in a save without nations.
 */
export async function getClubInternationals(saveId: string, limit: number): Promise<ClubInternational[] | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { breaksFrom: true } });
  if (save.breaksFrom === null) {
    return null;
  }
  const matches = await prisma.internationalMatch.findMany({
    where: { saveId, played: true, managedPlayers: { not: Prisma.DbNull } },
    select: { home: true, away: true, managedPlayers: true },
  });
  const byPlayer = new Map<string, { nation: NationCode; caps: number; goals: number }>();
  for (const match of matches) {
    for (const line of managedPlayersSchema.parse(match.managedPlayers ?? [])) {
      if (line.minutes === 0) {
        continue;
      }
      const entry = byPlayer.get(line.playerKey) ?? { nation: nationCode(line.side === "home" ? match.home : match.away), caps: 0, goals: 0 };
      entry.caps++;
      entry.goals += line.goals;
      byPlayer.set(line.playerKey, entry);
    }
  }
  const best = [...byPlayer]
    .sort(([keyA, a], [keyB, b]) => b.caps - a.caps || b.goals - a.goals || (keyA < keyB ? -1 : 1))
    .slice(0, limit);
  const rows = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: best.map(([key]) => key) } },
    select: { playerKey: true, firstName: true, lastName: true },
  });
  const nameOf = new Map(rows.map((row) => [row.playerKey, shortName(row)]));
  return best.map(([playerKey, entry]) => ({ playerKey, name: nameOf.get(playerKey) ?? "?", ...entry }));
}

type MatchRow = {
  scheduledAt: Date;
  competition: string;
  round: number;
  pool: number | null;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  decidedBy: "REGULATION" | "EXTRA_TIME" | "PENALTIES" | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  goalTimes: number[];
  scorers: string[];
  managedPlayers: Prisma.JsonValue;
};

const MATCH_SELECT = {
  scheduledAt: true,
  competition: true,
  round: true,
  pool: true,
  home: true,
  away: true,
  homeGoals: true,
  awayGoals: true,
  decidedBy: true,
  homePenalties: true,
  awayPenalties: true,
  goalTimes: true,
  scorers: true,
  managedPlayers: true,
} as const;

/** The tournaments' competitions: their matches are written once played, at a season's transition. */
const TOURNAMENT_CODES: TournamentCode[] = [OLD_CONTINENT_CUP, HEMISPHERES_CUP];

/** The names of the players a set of matches names (scorers, the managed club's players), of our clubs or a reserve. */
async function namesOf(saveId: string, keys: readonly string[]): Promise<Map<string, { name: string; managed: boolean }>> {
  const rows = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: [...new Set(keys)] } },
    select: { playerKey: true, firstName: true, lastName: true, clubSave: { select: { isManaged: true } } },
  });
  const reserves = await readReserves(prisma, saveId);
  return new Map<string, { name: string; managed: boolean }>([
    ...rows.map((row) => [row.playerKey, { name: shortName(row), managed: row.clubSave?.isManaged === true }] as const),
    ...reserves.flatMap((nation) => nation.reserve.map((player) => [player.key, { name: shortName(player), managed: false }] as const)),
  ]);
}

/** A played match for the screen: its stage, its score after extra time and its shoot-out, its scorers. */
function resultOf(match: MatchRow, names: ReadonlyMap<string, { name: string; managed: boolean }>): InternationalResult {
  return {
    date: match.scheduledAt,
    competition: isInternationalCompetition(match.competition) ? match.competition : FRIENDLY,
    round: match.round,
    pool: match.pool === 0 ? 0 : match.pool === 1 ? 1 : null,
    home: nationCode(match.home),
    away: nationCode(match.away),
    homeGoals: match.homeGoals ?? 0,
    awayGoals: match.awayGoals ?? 0,
    decidedBy: match.decidedBy,
    penalties: match.homePenalties === null || match.awayPenalties === null ? null : { home: match.homePenalties, away: match.awayPenalties },
    scorers: decodeGoalTimes(match.goalTimes).map((goal, index) => {
      const scorer = names.get(match.scorers[index] ?? "");
      return { side: goal.side, minute: goal.minute, extraTime: goal.period === "EXTRA_TIME", name: scorer?.name ?? "?", managed: scorer?.managed ?? false };
    }),
  };
}

/** The winner of a played knockout match: the side with more goals, after extra time, or the shoot-out's. */
function knockoutWinner(match: MatchRow): NationCode {
  const home = match.homeGoals ?? 0;
  const away = match.awayGoals ?? 0;
  const homeWins = home !== away ? home > away : (match.homePenalties ?? 0) > (match.awayPenalties ?? 0);
  return nationCode(homeWins ? match.home : match.away);
}

/**
 * A played tournament as the screen tells it, from its matches: its groups' tables (their first two as its semi-finals
 * had them), its knockout matches, its winner, and the managed club's players who took part, champions or not.
 */
async function playedTournament(saveId: string, matches: readonly MatchRow[], strengths: ReadonlyMap<NationCode, number>): Promise<TournamentView> {
  const [first] = matches;
  const tournament = isTournament(first.competition) ? first.competition : OLD_CONTINENT_CUP;
  const results = (pool: number) =>
    matches
      .filter((match) => match.pool === pool)
      .map((match) => ({ home: nationCode(match.home), away: nationCode(match.away), homeGoals: match.homeGoals ?? 0, awayGoals: match.awayGoals ?? 0 }));
  const semis = matches.filter((match) => match.round === SEMI_FINAL_ROUND);
  const final = matches.find((match) => match.round === FINAL_ROUND);
  const groups = [0, 1].map((pool) => {
    const codes = [...new Set(results(pool).flatMap((result) => [result.home, result.away]))];
    const table = internationalTable(codes, results(pool), strengths);
    // The semi-finals were drawn from the tables of the day: their first two, as they had them, stay on top.
    const first = semis.find((match) => (codes as string[]).includes(match.home))?.home;
    const second = semis.find((match) => (codes as string[]).includes(match.away))?.away;
    const top = [first, second].filter((code): code is string => code !== undefined);
    const ordered = [
      ...table.filter((row) => top.includes(row.code)).sort((a, b) => top.indexOf(a.code) - top.indexOf(b.code)),
      ...table.filter((row) => !top.includes(row.code)),
    ];
    return { pool: pool === 0 ? (0 as const) : (1 as const), rows: ordered.map((row, index) => ({ ...row, rank: index + 1 })) };
  });
  const names = await namesOf(
    saveId,
    matches.flatMap((match) => [...match.scorers, ...managedPlayersSchema.parse(match.managedPlayers ?? []).map((line) => line.playerKey)]),
  );
  const winner = final === undefined ? null : knockoutWinner(final);
  const yours = new Map<string, TournamentView["yours"][number]>();
  for (const match of matches) {
    for (const line of managedPlayersSchema.parse(match.managedPlayers ?? [])) {
      const nation = nationCode(line.side === "home" ? match.home : match.away);
      const entry = yours.get(line.playerKey) ?? { name: names.get(line.playerKey)?.name ?? "?", nation, matches: 0, goals: 0, champion: nation === winner };
      entry.matches += line.minutes > 0 ? 1 : 0;
      entry.goals += line.goals;
      yours.set(line.playerKey, entry);
    }
  }
  const times = matches.map((match) => match.scheduledAt.getTime());
  return {
    tournament,
    year: first.scheduledAt.getUTCFullYear(),
    from: new Date(Math.min(...times)),
    to: new Date(Math.max(...times)),
    state: "played",
    groups,
    results: [...matches]
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || (a.pool ?? 2) - (b.pool ?? 2))
      .map((match) => resultOf(match, names)),
    winner,
    runnerUp: final === undefined || winner === null ? null : nationCode(winner === final.home ? final.away : final.home),
    yours: [...yours.values()].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, "fr")),
  };
}

/**
 * The national teams of a save as they would be called today (readCallUps: each nation's 23, of our clubs or its
 * reserve), ranked by strength (rankFormations, the formation an AI club would choose), with the next break and the
 * results of the last one; the cycle in progress (its qualifiers' tables, its tournament drawn once they are over) and
 * the last tournament played. null in a save without nations.
 */
export async function getNationsView(saveId: string): Promise<NationsView | null> {
  const save = await prisma.save.findUniqueOrThrow({
    where: { id: saveId },
    select: { seed: true, currentDate: true, breaksFrom: true, cyclesFrom: true },
  });
  if (save.breaksFrom === null) {
    return null;
  }
  const called = await readCallUps(prisma, saveId, save.currentDate, save.currentDate);
  const clubIds = [...new Set([...called.values()].flat().flatMap((player) => (player.clubSaveId === null ? [] : [player.clubSaveId])))];
  const [clubs, upcoming, lastPlayed] = await Promise.all([
    prisma.clubSave.findMany({ where: { saveId, id: { in: clubIds } }, select: { id: true, isManaged: true, club: { select: { slug: true, name: true } } } }),
    prisma.internationalMatch.findMany({
      where: { saveId, played: false, competition: { notIn: TOURNAMENT_CODES } },
      orderBy: { scheduledAt: "asc" },
      take: NATIONS.length,
      select: { scheduledAt: true },
    }),
    prisma.internationalMatch.findFirst({
      where: { saveId, played: true, competition: { notIn: TOURNAMENT_CODES } },
      orderBy: { scheduledAt: "desc" },
      select: { scheduledAt: true },
    }),
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
    const matches: MatchRow[] = await prisma.internationalMatch.findMany({
      where: {
        saveId,
        played: true,
        competition: { notIn: TOURNAMENT_CODES },
        scheduledAt: { gte: new Date(to.getTime() - BREAK_SPAN_DAYS * DAY_MS), lte: to },
      },
      // A date's qualifiers first, then its friendlies.
      orderBy: [{ scheduledAt: "asc" }, { competition: "desc" }, { home: "asc" }],
      select: MATCH_SELECT,
    });
    const names = await namesOf(saveId, matches.flatMap((match) => match.scorers));
    lastBreak = { from: matches[0]?.scheduledAt ?? to, to, results: matches.map((match) => resultOf(match, names)) };
  }

  // The cycle in progress: its qualifiers' tables, and its tournament drawn once they are all played.
  const strengths = await readStrengths(prisma, saveId);
  const cycle = cycleOf(save.cyclesFrom, seasonStartYear(save.currentDate));
  let campaign: CampaignView | null = null;
  if (cycle !== null) {
    const tables = await readQualifierTables(prisma, saveId, cycle, strengths);
    const places = tournamentPlaces(cycle.tournament);
    const zones: ZoneTableView[] = [{ zone: "EUROPE", competition: QUALIFIER_EUROPE, places: places.EUROPE, rows: tables.europe }];
    if (cycle.tournament === HEMISPHERES_CUP) {
      zones.push({ zone: "WORLD", competition: QUALIFIER_WORLD, places: places.WORLD, rows: tables.world });
    }
    const playedDates = await prisma.internationalMatch.groupBy({
      by: ["scheduledAt"],
      where: { saveId, played: true, competition: { notIn: TOURNAMENT_CODES }, startYear: { in: [cycle.startYear, cycle.startYear + 1] } },
    });
    const dates = tournamentDates(cycle.tournamentYear);
    const draw: TournamentView | null =
      tables.played === cycleQualifiers(save.seed, cycle).length
        ? {
            tournament: cycle.tournament,
            year: cycle.tournamentYear,
            from: dates[0],
            to: dates[dates.length - 1],
            state: "drawn",
            groups: drawTournament({
              tournament: cycle.tournament,
              europe: tables.europe,
              world: tables.world,
              strengths,
              saveSeed: save.seed,
              year: cycle.tournamentYear,
            }).map((codes, pool) => ({
              pool: pool === 0 ? (0 as const) : (1 as const),
              // No match yet: the pots' order.
              rows: internationalTable(codes, [], new Map(codes.map((code, index) => [code, -index]))),
            })),
            results: [],
            winner: null,
            runnerUp: null,
            yours: [],
          }
        : null;
    // A national coach's tournament under way, in June (src/db/national-team.ts): its matches played so far.
    const underWay =
      draw === null
        ? []
        : await prisma.internationalMatch.findMany({
            where: { saveId, played: true, competition: cycle.tournament, startYear: cycle.tournamentYear - 1 },
            orderBy: [{ scheduledAt: "asc" }, { pool: "asc" }],
            select: MATCH_SELECT,
          });
    const shown = underWay.length > 0 ? { ...(await playedTournament(saveId, underWay, strengths)), groups: draw?.groups ?? [] } : draw;
    campaign = { tournament: cycle.tournament, year: cycle.tournamentYear, breaksPlayed: Math.floor(playedDates.length / 2), zones, draw: shown };
  }

  // The last tournament played to its final: at a season's transition, or in June by a national coach's steps.
  const lastYear = await prisma.internationalMatch.findFirst({
    where: { saveId, played: true, competition: { in: TOURNAMENT_CODES }, round: FINAL_ROUND },
    orderBy: { scheduledAt: "desc" },
    select: { startYear: true },
  });
  const lastTournament =
    lastYear === null
      ? null
      : await playedTournament(
          saveId,
          await prisma.internationalMatch.findMany({
            where: { saveId, played: true, competition: { in: TOURNAMENT_CODES }, startYear: lastYear.startYear },
            orderBy: [{ scheduledAt: "asc" }, { pool: "asc" }],
            select: MATCH_SELECT,
          }),
          strengths,
        );

  return {
    nations,
    nextBreak: breakSpan(upcoming.map((match) => match.scheduledAt)),
    lastBreak,
    campaign,
    lastTournament,
    freshTournament: lastTournament !== null && lastTournament.year === seasonStartYear(save.currentDate),
  };
}
