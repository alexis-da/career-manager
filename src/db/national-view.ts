import { cache } from "react";
import { CALL_UP_SIZE, FULL_FITNESS } from "../engine/balance";
import { displayClubName } from "../engine/club-name";
import { recoveredFitness } from "../engine/fitness";
import { chooseFormation } from "../engine/formation-choice";
import type { FormationName } from "../engine/formations";
import type { Instruction } from "../engine/instructions";
import {
  COACH_STAGES,
  federationObjective,
  stageReached,
  strengthRanks,
  type CoachStage,
  type SpellEnding,
} from "../engine/national-coach";
import { isNationCode, nationByCode, type NationCode } from "../engine/nations";
import type { Position } from "../engine/positions";
import { breakWindows } from "../engine/schedule";
import {
  cycleOf,
  FINAL_ROUND,
  isTournament,
  QUALIFIER_EUROPE,
  QUALIFIER_WORLD,
  SEMI_FINAL_ROUND,
  tournamentPlaces,
  type Cycle,
  type TournamentCode,
} from "../engine/tournaments";
import { seasonStartYear } from "../engine/world";
import { ageInYears } from "../lib/dates";
import { NATION_COLORS } from "../lib/nation-colors";
import { prisma } from "./client";
import { Prisma } from "../generated/prisma/client";
import type { EditorPlayer, LineupEditor } from "./lineup";
import { offersStillOpen } from "./national-missions";
import {
  callUpOpen,
  coachSaveOf,
  COACH_SAVE_SELECT,
  currentNationalSession,
  isStop,
  nationPool,
  nextNationalStop,
  parseCallUp,
  parseCoachLineup,
  sessionBefore,
  type CoachSave,
  type NationalSession,
} from "./national-team";
import { readCallUps, readQualifierTables, readReserves, readStrengths, type NationPlayer } from "./nations";
import type { ZoneTableView } from "./nations-view";

// What the screens show of the national coach (docs/design/selections.md § 9.6 to 9.10): the federations' offers, his
// nation (its next break or tournament, his list and his lineup, its table, its results), his list's candidates, his
// lineup's players, his next match at stake for the dashboard, his missions for the History and the cards.

const coachOf = cache(async (saveId: string): Promise<CoachSave | null> =>
  coachSaveOf(await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: COACH_SAVE_SELECT })),
);

// ------------------------------------------------------------------ The offers (§ 5.1, 9.6)

export type CoachOffer = {
  code: NationCode;
  rank: number; // its rank of strength among the 14
  tournament: TournamentCode | null; // its cycle's, null before the first cycle
  tournamentYear: number | null;
  objective: CoachStage | null; // null: a World nation in an Old Continent cycle, « Prépare le cycle suivant »
  nextBreak: { from: Date; to: Date } | null; // the season's next break, his first
};

export type CoachOffers = { startYear: number; open: boolean; offers: CoachOffer[] };

/**
 * The federations' offers of the season to a player who coaches no nation: open until his club's first match of the
 * season (open), each with its nation's rank, its cycle's tournament and the objective he would be set, and his first
 * break. null without an offer.
 */
export const getCoachOffers = cache(async (saveId: string): Promise<CoachOffers | null> => {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { nationCode: true, currentDate: true, cyclesFrom: true } });
  if (save.nationCode !== null) {
    return null;
  }
  const startYear = seasonStartYear(save.currentDate);
  const rows = await prisma.nationSave.findMany({ where: { saveId, offeredIn: startYear }, select: { code: true } });
  const codes = rows.flatMap((row) => (isNationCode(row.code) ? [row.code] : []));
  if (codes.length === 0) {
    return null;
  }
  const strengths = await readStrengths(prisma, saveId);
  const ranks = strengthRanks(strengths);
  const cycle = cycleOf(save.cyclesFrom, startYear);
  const window = breakWindows(startYear).find((entry) => entry.dates[0] > save.currentDate);
  return {
    startYear,
    open: await offersStillOpen(prisma, saveId, startYear),
    offers: codes
      .map((code) => ({
        code,
        rank: ranks.get(code) ?? 14,
        tournament: cycle?.tournament ?? null,
        tournamentYear: cycle?.tournamentYear ?? null,
        objective: cycle === null ? null : federationObjective(code, cycle.tournament, strengths),
        nextBreak: window === undefined ? null : { from: window.dates[0], to: window.dates[1] },
      }))
      .sort((a, b) => a.rank - b.rank),
  };
});

// ------------------------------------------------------------------ His nation (§ 9.7)

/** A match of his nation as his screens list it. */
export type CoachMatchLine = {
  id: string | null;
  date: Date;
  competition: string;
  round: number;
  pool: 0 | 1 | null;
  home: NationCode;
  away: NationCode;
  neutral: boolean;
  played: boolean;
  live: boolean; // waiting live
  homeGoals: number | null;
  awayGoals: number | null;
  decidedBy: "REGULATION" | "EXTRA_TIME" | "PENALTIES" | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  byAssistant: boolean; // a friendly his assistant plays, without a stop
};

/** His list for his next break or tournament: his own or his assistant's, and where its players come from. */
export type CallUpSummary = {
  by: "manager" | "assistant";
  locked: boolean; // the break or tournament has started: the list no longer changes
  league: number; // of our clubs
  reserve: number; // outside our leagues
  ownClub: { key: string; name: string }[]; // of his own club: they miss nothing of his club, but come back tired
};

export type NationalTeamView = {
  code: NationCode;
  fromYear: number; // his first season
  objective: CoachStage | null;
  tournament: TournamentCode | null;
  tournamentYear: number | null;
  rank: number; // his nation's rank of strength
  friendliesByAssistant: boolean;
  canLeave: boolean; // nothing of his under way: no break or tournament started, no match live
  session: { kind: "break" | "tournament"; first: Date; last: Date; started: boolean; matches: CoachMatchLine[] } | null;
  callUp: CallUpSummary | null; // for his session in progress or next
  lineup: { formation: FormationName; saved: boolean; instruction: Instruction };
  zone: ZoneTableView | null; // his nation's zone of the qualifiers of the cycle
  results: CoachMatchLine[]; // his nation's matches played this season, the latest first
};

const LINE_SELECT = {
  id: true,
  scheduledAt: true,
  competition: true,
  round: true,
  pool: true,
  home: true,
  away: true,
  neutral: true,
  played: true,
  liveState: true,
  homeGoals: true,
  awayGoals: true,
  decidedBy: true,
  homePenalties: true,
  awayPenalties: true,
} as const;

function lineOf(
  row: {
    id: string | null;
    scheduledAt: Date;
    competition: string;
    round: number;
    pool: number | null;
    home: string;
    away: string;
    neutral: boolean;
    played: boolean;
    live?: boolean;
    homeGoals: number | null;
    awayGoals: number | null;
    decidedBy: "REGULATION" | "EXTRA_TIME" | "PENALTIES" | null;
    homePenalties: number | null;
    awayPenalties: number | null;
  },
  coach: CoachSave,
): CoachMatchLine | null {
  if (!isNationCode(row.home) || !isNationCode(row.away)) {
    return null;
  }
  return {
    id: row.id,
    date: row.scheduledAt,
    competition: row.competition,
    round: row.round,
    pool: row.pool === 0 ? 0 : row.pool === 1 ? 1 : null,
    home: row.home,
    away: row.away,
    neutral: row.neutral,
    played: row.played,
    live: row.live === true,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    decidedBy: row.decidedBy,
    homePenalties: row.homePenalties,
    awayPenalties: row.awayPenalties,
    byAssistant: !isStop(row, coach),
  };
}

/** His nation's matches of his session: a break's, or the tournament's so far and his next one. */
async function sessionLines(coach: CoachSave, session: NationalSession): Promise<CoachMatchLine[]> {
  const own = (match: { home: string; away: string }): boolean => match.home === coach.nationCode || match.away === coach.nationCode;
  const lines = session.matches.filter(own).flatMap((match) =>
    lineOf(
      { ...match, scheduledAt: match.date },
      coach,
    ) ?? [],
  );
  if (session.kind === "tournament") {
    const next = await nextNationalStop(prisma, coach, session);
    if (next !== null && !lines.some((line) => line.date.getTime() === next.date.getTime())) {
      lines.push({
        id: null,
        date: next.date,
        competition: next.competition,
        round: next.round,
        pool: next.pool,
        home: next.home,
        away: next.away,
        neutral: true,
        played: false,
        live: false,
        homeGoals: null,
        awayGoals: null,
        decidedBy: null,
        homePenalties: null,
        awayPenalties: null,
        byAssistant: false,
      });
    }
  }
  return lines.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** The 23 of his session as it stands now: his own list or his assistant's, kept once it has started. */
async function sessionSquad(coach: CoachSave, session: NationalSession): Promise<{ players: NationPlayer[]; by: "manager" | "assistant" }> {
  const { called } = await sessionBefore(prisma, coach, session, session.next);
  const players = called.get(coach.nationCode) ?? [];
  const row = await prisma.nationSave.findUniqueOrThrow({ where: { saveId_code: { saveId: coach.id, code: coach.nationCode } }, select: { callUp: true } });
  const own = parseCallUp(row.callUp);
  return { players, by: own !== null && own.date === session.first.toISOString().slice(0, 10) ? "manager" : "assistant" };
}

/** His nation's zone of a cycle's qualifiers, its table so far; null when the zone has no place in its tournament. */
async function zoneOf(saveId: string, code: NationCode, cycle: Cycle, strengths: ReadonlyMap<NationCode, number>): Promise<ZoneTableView | null> {
  const zone = nationByCode(code).zone;
  const places = tournamentPlaces(cycle.tournament)[zone];
  if (places === 0) {
    return null;
  }
  const tables = await readQualifierTables(prisma, saveId, cycle, strengths);
  return { zone, competition: zone === "EUROPE" ? QUALIFIER_EUROPE : QUALIFIER_WORLD, places, rows: zone === "EUROPE" ? tables.europe : tables.world };
}

/** Ma sélection: his nation, its objective, its next break or tournament, his list and lineup, its table and results. */
export const getNationalTeamView = cache(async (saveId: string): Promise<NationalTeamView | null> => {
  const coach = await coachOf(saveId);
  if (coach === null) {
    return null;
  }
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveInternationalId: true } });
  const spell = await prisma.coachSpell.findFirst({ where: { saveId, toYear: null }, orderBy: { createdAt: "desc" } });
  const strengths = await readStrengths(prisma, saveId);
  const managedClub = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const session = await currentNationalSession(prisma, coach);
  const started = session !== null && !callUpOpen(session);

  let callUp: CallUpSummary | null = null;
  if (session !== null) {
    const squad = await sessionSquad(coach, session);
    callUp = {
      by: squad.by,
      locked: started,
      league: squad.players.filter((player) => player.playerSaveId !== null).length,
      reserve: squad.players.filter((player) => player.playerSaveId === null).length,
      ownClub: squad.players
        .filter((player) => player.clubSaveId === managedClub.id)
        .map((player) => ({ key: player.id, name: `${player.firstName} ${player.lastName}` })),
    };
  }
  const nationRow = await prisma.nationSave.findUniqueOrThrow({ where: { saveId_code: { saveId, code: coach.nationCode } }, select: { lineup: true } });
  const saved = parseCoachLineup(nationRow.lineup);
  const startYear = seasonStartYear(coach.currentDate);
  const cycle = cycleOf(coach.cyclesFrom, startYear);
  const zone = cycle === null ? null : await zoneOf(saveId, coach.nationCode, cycle, strengths);
  const played = await prisma.internationalMatch.findMany({
    where: { saveId, played: true, startYear, OR: [{ home: coach.nationCode }, { away: coach.nationCode }] },
    orderBy: { scheduledAt: "desc" },
    select: LINE_SELECT,
  });
  return {
    code: coach.nationCode,
    fromYear: spell?.fromYear ?? startYear,
    objective: (spell?.objective ?? null) as CoachStage | null,
    tournament: cycle?.tournament ?? null,
    tournamentYear: cycle?.tournamentYear ?? null,
    rank: strengthRanks(strengths).get(coach.nationCode) ?? 14,
    friendliesByAssistant: coach.nationFriendlies,
    canLeave: save.liveInternationalId === null && !started,
    session:
      session === null
        ? null
        : { kind: session.kind, first: session.first, last: session.last, started, matches: await sessionLines(coach, session) },
    callUp,
    lineup: {
      formation: saved?.formation ?? "4-3-3",
      saved: saved !== null,
      instruction: saved?.lineup.instruction ?? "BALANCED",
    },
    zone,
    results: played.flatMap((row) => lineOf({ ...row, live: row.liveState !== null }, coach) ?? []),
  };
});

// ------------------------------------------------------------------ His list (§ 9.7, the sheet)

export type CallUpCandidate = {
  key: string;
  firstName: string;
  lastName: string;
  position: Position;
  overall: number;
  age: number;
  club: string | null; // null: outside our leagues (« Hors championnats »)
  ownClub: boolean; // of the coach's own club
  fitness: number; // on the first date of the break or tournament
  caps: number;
  goals: number;
  injured: boolean; // on that date: he cannot be called
};

export type CallUpEditor = {
  date: Date; // the first date of the break or tournament
  open: boolean; // it has not started: the list may change
  chosen: string[] | null; // his own list, kept for it
  assistant: string[]; // his assistant's 23, in their order
  candidates: CallUpCandidate[]; // every player of his nation of our clubs, then its reserve; best first
};

/** The candidates of his list for his next break or tournament, his own list and his assistant's. null without. */
export async function getCallUpEditor(saveId: string): Promise<CallUpEditor | null> {
  const coach = await coachOf(saveId);
  if (coach === null) {
    return null;
  }
  const session = await currentNationalSession(prisma, coach);
  if (session === null) {
    return null;
  }
  const nation = nationByCode(coach.nationCode);
  const [pool, reserves, managedClub, nationRow] = [
    await nationPool(prisma, saveId, nation.nationality),
    await readReserves(prisma, saveId),
    await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } }),
    await prisma.nationSave.findUniqueOrThrow({ where: { saveId_code: { saveId, code: coach.nationCode } }, select: { callUp: true } }),
  ];
  const clubs = await prisma.clubSave.findMany({
    where: { saveId, id: { in: [...new Set(pool.flatMap((row) => (row.clubSaveId === null ? [] : [row.clubSaveId])))] } },
    select: { id: true, club: { select: { slug: true, name: true } } },
  });
  const clubName = new Map(clubs.map((club) => [club.id, displayClubName(club.club)]));
  const birthDates = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: pool.map((row) => row.playerKey) } },
    select: { playerKey: true, birthDate: true },
  });
  const birthOf = new Map(birthDates.map((row) => [row.playerKey, row.birthDate]));
  const restDays = Math.max(0, Math.round((session.first.getTime() - coach.currentDate.getTime()) / 86_400_000));
  const reserve = reserves.find((row) => row.code === coach.nationCode);
  const assistant = (await readCallUps(prisma, saveId, session.first, coach.currentDate)).get(coach.nationCode) ?? [];
  const own = parseCallUp(nationRow.callUp);
  const candidates: CallUpCandidate[] = [
    ...pool.map((row) => ({
      key: row.playerKey,
      firstName: row.firstName,
      lastName: row.lastName,
      position: row.position,
      overall: row.overall,
      age: ageInYears(birthOf.get(row.playerKey) ?? coach.currentDate, coach.currentDate),
      club: row.clubSaveId === null ? null : (clubName.get(row.clubSaveId) ?? null),
      ownClub: row.clubSaveId === managedClub.id,
      fitness: Math.round(recoveredFitness(row.fitness, restDays)),
      caps: row.caps,
      goals: row.internationalGoals,
      injured: row.injuredUntil !== null && row.injuredUntil > session.first,
    })),
    ...(reserve?.reserve ?? []).map((player, index) => ({
      key: player.key,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      overall: player.overall,
      age: ageInYears(new Date(`${player.birthDate}T00:00:00.000Z`), coach.currentDate),
      club: null,
      ownClub: false,
      fitness: FULL_FITNESS,
      caps: reserve?.caps[index] ?? 0,
      goals: reserve?.goals[index] ?? 0,
      injured: false,
    })),
  ].sort((a, b) => b.overall - a.overall || (a.key < b.key ? -1 : 1));
  return {
    date: session.first,
    open: callUpOpen(session),
    chosen: own !== null && own.date === session.first.toISOString().slice(0, 10) ? own.keys : null,
    assistant: assistant.map((player) => player.id).slice(0, CALL_UP_SIZE),
    candidates,
  };
}

// ------------------------------------------------------------------ His lineup (§ 5.2)

/**
 * His lineup editor: the club's editor with his 23 for squad (his own list or his assistant's, kept once the break or
 * tournament has started) at their fitness on his next match's date, his saved lineup, his nation's colours; ranked as an
 * AI club would against the first divisions' average opponent. null without a break or tournament ahead.
 */
export async function getCoachLineupEditor(saveId: string): Promise<(LineupEditor & { code: NationCode }) | null> {
  const coach = await coachOf(saveId);
  if (coach === null) {
    return null;
  }
  const session = await currentNationalSession(prisma, coach);
  if (session === null) {
    return null;
  }
  // His nation's next match: the first of his still to play in a break (a friendly his assistant plays included), his
  // next one in a tournament.
  const own = session.matches.find((match) => !match.played && (match.home === coach.nationCode || match.away === coach.nationCode));
  const next = session.kind === "break" ? (own?.date ?? session.next) : ((await nextNationalStop(prisma, coach, session))?.date ?? session.next);
  const { state } = await sessionBefore(prisma, coach, session, next);
  // Whole points of fitness, as his match plays them (coachMatchTeams).
  const players = state.teamOn(coach.nationCode, next).players.map((player) => ({ ...player, fitness: Math.round(player.fitness) }));
  const births = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: players.map((player) => player.id) } },
    select: { playerKey: true, birthDate: true },
  });
  const reserve = (await readReserves(prisma, saveId)).find((row) => row.code === coach.nationCode);
  const birthOf = new Map([
    ...births.map((row) => [row.playerKey, row.birthDate] as const),
    ...(reserve?.reserve ?? []).map((player) => [player.key, new Date(`${player.birthDate}T00:00:00.000Z`)] as const),
  ]);
  const row = await prisma.nationSave.findUniqueOrThrow({ where: { saveId_code: { saveId, code: coach.nationCode } }, select: { lineup: true } });
  const saved = parseCoachLineup(row.lineup);
  const editorPlayers: EditorPlayer[] = players.map((player) => ({
    id: player.id,
    position: player.position,
    overall: player.overall,
    injured: player.injured,
    suspended: false,
    firstName: player.firstName,
    lastName: player.lastName,
    age: ageInYears(birthOf.get(player.id) ?? coach.currentDate, coach.currentDate),
    injuredUntil: null,
    fitness: Math.round(player.fitness),
    form: player.form,
    morale: player.morale,
    pace: player.pace,
    shooting: player.shooting,
    passing: player.passing,
    dribbling: player.dribbling,
    defending: player.defending,
    physical: player.physical,
    goalkeeping: player.goalkeeping,
    discipline: { suspended: false, suspendedLater: null, bookingRisks: [], bookingRiskNextMatch: false },
  }));
  return {
    code: coach.nationCode,
    formation: saved?.formation ?? chooseFormation(players, 1).formation,
    saved: saved?.lineup ?? null,
    instruction: saved?.lineup.instruction ?? "BALANCED",
    matchDate: next,
    clubColors: NATION_COLORS[coach.nationCode],
    tier: 1,
    players: editorPlayers,
  };
}

// ------------------------------------------------------------------ His next match at stake (the dashboard, the header)

export type NationalNext = {
  matchId: string | null; // its row once it has one
  date: Date;
  competition: string;
  round: number;
  pool: 0 | 1 | null;
  home: NationCode;
  away: NationCode;
  neutral: boolean;
  code: NationCode; // his nation
  live: boolean; // waiting live
};

/** His next match at stake, when it comes before his club's next match (or his club has none left). null without. */
export const getNationalNext = cache(async (saveId: string): Promise<NationalNext | null> => {
  const coach = await coachOf(saveId);
  if (coach === null) {
    return null;
  }
  const stop = await nextNationalStop(prisma, coach);
  if (stop === null) {
    return null;
  }
  const managed = await prisma.clubSave.findFirstOrThrow({ where: { saveId, isManaged: true }, select: { id: true } });
  const club = await prisma.fixture.findFirst({
    where: { saveId, played: false, season: { completed: false }, OR: [{ homeClubSaveId: managed.id }, { awayClubSaveId: managed.id }] },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });
  if (club !== null && club.scheduledAt <= stop.date) {
    return null;
  }
  const row = stop.session.matches.find((match) => match.date.getTime() === stop.date.getTime() && match.home === stop.home && match.away === stop.away);
  return {
    matchId: row?.id ?? null,
    date: stop.date,
    competition: stop.competition,
    round: stop.round,
    pool: stop.pool,
    home: stop.home,
    away: stop.away,
    neutral: stop.neutral,
    code: coach.nationCode,
    live: row?.live === true,
  };
});

/** Whether his break or summer tournament is under way or ahead in the season: the season ends with it. */
export async function coachSessionPending(saveId: string): Promise<boolean> {
  const coach = await coachOf(saveId);
  return coach !== null && (await currentNationalSession(prisma, coach)) !== null;
}

/** Whether the save's player coaches a nation: the « Sélection » tab of Équipe. */
export async function coachesNation(saveId: string): Promise<NationCode | null> {
  return (await coachOf(saveId))?.nationCode ?? null;
}

// ------------------------------------------------------------------ His missions (§ 9.9, 9.10)

export type CoachTournamentRun = { tournament: TournamentCode; year: number; stage: CoachStage };

export type CoachSpellView = {
  code: NationCode;
  fromYear: number;
  toYear: number | null; // null: in post
  outcome: SpellEnding | null;
  tournaments: CoachTournamentRun[]; // his nation's tournaments under him, in order
};

export type CoachHistory = {
  spells: CoachSpellView[];
  titles: { tournament: TournamentCode; year: number; code: NationCode }[]; // tournaments he won
};

/** His missions and their tournaments, oldest first; null for a player who never coached a nation. */
export async function getCoachHistory(saveId: string): Promise<CoachHistory | null> {
  const spells = await prisma.coachSpell.findMany({ where: { saveId }, orderBy: [{ fromYear: "asc" }, { createdAt: "asc" }] });
  if (spells.length === 0) {
    return null;
  }
  const codes = [...new Set(spells.map((spell) => spell.code))];
  const matches = await prisma.internationalMatch.findMany({
    where: { saveId, played: true, competition: { in: ["int.eu", "int.world"] }, OR: [{ home: { in: codes } }, { away: { in: codes } }] },
    select: { competition: true, startYear: true, round: true, home: true, away: true, winner: true },
  });
  // A tournament is his when his nation played it under him, by the full engine: never one played after he left (a
  // resignation before June), whatever the seasons of his mission say.
  const coached = new Set(
    (
      await prisma.internationalMatch.findMany({
        where: {
          saveId,
          played: true,
          competition: { in: ["int.eu", "int.world"] },
          outcome: { not: Prisma.DbNull },
          OR: [{ home: { in: codes } }, { away: { in: codes } }],
        },
        select: { competition: true, startYear: true, home: true, away: true },
      })
    ).flatMap((match) => [`${match.competition}:${match.startYear}:${match.home}`, `${match.competition}:${match.startYear}:${match.away}`]),
  );
  const views: CoachSpellView[] = spells.flatMap((spell) => {
    if (!isNationCode(spell.code)) {
      return [];
    }
    const code = spell.code;
    const years = [
      ...new Set(
        matches
          .filter((match) => match.startYear >= spell.fromYear && (spell.toYear === null || match.startYear <= spell.toYear))
          .map((match) => `${match.competition}:${match.startYear}`)
          .filter((key) => coached.has(`${key}:${code}`)),
      ),
    ];
    const tournaments = years.flatMap((entry) => {
      const [tournament, startYear] = entry.split(":");
      if (!isTournament(tournament)) {
        return [];
      }
      const ofTournament = matches.filter((match) => match.competition === tournament && match.startYear === Number(startYear));
      const stage = stageReached(
        code,
        ofTournament.flatMap((match) =>
          isNationCode(match.home) && isNationCode(match.away)
            ? [{ round: match.round, home: match.home, away: match.away, winner: match.winner !== null && isNationCode(match.winner) ? match.winner : null }]
            : [],
        ),
        SEMI_FINAL_ROUND,
        FINAL_ROUND,
      );
      return stage === COACH_STAGES.NOT_QUALIFIED ? [] : [{ tournament, year: Number(startYear) + 1, stage }];
    });
    return [
      {
        code,
        fromYear: spell.fromYear,
        toYear: spell.toYear,
        outcome: (spell.outcome ?? null) as SpellEnding | null,
        tournaments: tournaments.sort((a, b) => a.year - b.year),
      },
    ];
  });
  return {
    spells: views,
    titles: views.flatMap((spell) =>
      spell.tournaments.filter((run) => run.stage === COACH_STAGES.WINNER).map((run) => ({ tournament: run.tournament, year: run.year, code: spell.code })),
    ),
  };
}

/** His nation in a season (startYear), and its tournament when the season ended with one: the season card's line. */
export async function getCoachSeason(saveId: string, startYear: number): Promise<{ code: NationCode; tournament: CoachTournamentRun | null } | null> {
  const history = await getCoachHistory(saveId);
  const spell = history?.spells.find((entry) => entry.fromYear <= startYear && (entry.toYear === null || startYear <= entry.toYear));
  if (spell === undefined) {
    return null;
  }
  return { code: spell.code, tournament: spell.tournaments.find((run) => run.year === startYear + 1) ?? null };
}

// ------------------------------------------------------------------ « À faire » (§ 5.4, 6.7)

export type CoachTodo =
  | { kind: "offer"; offers: NationCode[] }
  | { kind: "call-up"; code: NationCode; first: Date; last: Date; tournament: boolean }
  | { kind: "ended"; code: NationCode; outcome: "NOT_QUALIFIED" | "MISSED" };

/**
 * His lines of « À faire »: a federation's offer while it is open; his list before his next break or tournament, from his
 * club's last match before it while his assistant's goes as it is; the end of a mission the federation decided this season.
 */
export async function getCoachTodos(saveId: string): Promise<CoachTodo[]> {
  const todos: CoachTodo[] = [];
  const offers = await getCoachOffers(saveId);
  if (offers !== null && offers.open) {
    todos.push({ kind: "offer", offers: offers.offers.map((offer) => offer.code) });
  }
  const coach = await coachOf(saveId);
  if (coach !== null) {
    const session = await currentNationalSession(prisma, coach);
    const next = await getNationalNext(saveId);
    if (session !== null && callUpOpen(session) && next !== null) {
      const row = await prisma.nationSave.findUniqueOrThrow({ where: { saveId_code: { saveId, code: coach.nationCode } }, select: { callUp: true } });
      const own = parseCallUp(row.callUp);
      if (own === null || own.date !== session.first.toISOString().slice(0, 10)) {
        todos.push({ kind: "call-up", code: coach.nationCode, first: session.first, last: session.last, tournament: session.kind === "tournament" });
      }
    }
  }
  // The federation's end of his mission: not qualified, said for the rest of that season; a tournament below the
  // objective, at the transition after it, said until his club's first match of the new season.
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const startYear = seasonStartYear(save.currentDate);
  const ended = await prisma.coachSpell.findFirst({
    where: {
      saveId,
      OR: [
        { toYear: startYear, outcome: "NOT_QUALIFIED" },
        ...((await offersStillOpen(prisma, saveId, startYear)) ? [{ toYear: startYear - 1, outcome: "MISSED" }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (ended !== null && isNationCode(ended.code) && (ended.outcome === "NOT_QUALIFIED" || ended.outcome === "MISSED")) {
    todos.push({ kind: "ended", code: ended.code, outcome: ended.outcome });
  }
  return todos;
}

