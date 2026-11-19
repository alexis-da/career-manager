import { decideChoice } from "../engine/choices";
import { pauseOf, playOn, type LivePause, type PlayOnInput, type PlayOnUntil } from "../engine/live";
import type { InstructionSpan } from "../engine/instructions";
import { decodeGoalTimes, matchResult, scoreOf, type MatchEvent, type MatchResult, type MatchState, type Side } from "../engine/match";
import { isNationCode } from "../engine/nations";
import type { ChoiceKind, ChoiceOption, MatchDecision } from "../engine/choices";
import { ageInYears } from "../lib/dates";
import { NATION_COLORS } from "../lib/nation-colors";
import type { FixtureView, FixtureWithEvents, MatchEventView, DecisionView, ScoreTimeline, TeamView } from "./calendar";
import { prisma } from "./client";
import {
  halfTimeTeamOf,
  instructionsOf,
  livePauseViewOf,
  NoMatchInProgressError,
  PauseMismatchError,
  squadKeys,
  type HalfTimeTeam,
  type Identity,
  type LivePauseView,
  type LiveStep,
} from "./live-match";
import { parseLiveState, serializeLiveState } from "./live-state";
import { lockSave, TRANSACTION_MAX_WAIT_MS, TRANSACTION_TIMEOUT_MS } from "./matchday";
import { checkCoachQualification } from "./national-missions";
import { readReserves } from "./nations";
import {
  coachMatchSeed,
  coachSaveOf,
  COACH_SAVE_SELECT,
  parseDecisions,
  parseEvents,
  playNationalStep,
  type NationalStep,
} from "./national-team";
import type { Prisma } from "../generated/prisma/client";

// The national coach's match live (docs/design/selections.md § 9.8, N4b): the club's live machinery on an
// InternationalMatch row. The server plays it a segment of 15 minutes at a time from its state at a pause
// (InternationalMatch.liveState, Save.liveInternationalId), its events and his decisions kept on the row as the engine
// gives them; once over, its session (the break or the tournament) records it and goes on to his next match at stake
// (playNationalStep). The same choices always give the same match, and his assistant's the match simulated.

/** A nation as the live screens show a club: its code (named by the page), its colours, whether it is the coach's. */
export function nationTeamView(code: string, managed: string | null): TeamView {
  return {
    clubSaveId: code,
    name: code,
    isManaged: code === managed,
    colors: isNationCode(code) ? NATION_COLORS[code] : { primary: "#2A3678", secondary: "#FFFFFF" },
  };
}

/**
 * Every player a match's state names: both squads (on the pitch and on the bench), those gone off (its appearances),
 * those of its events and its decisions.
 */
function keysOf(state: MatchState): string[] {
  return [
    ...new Set([
      ...squadKeys(state, "home"),
      ...squadKeys(state, "away"),
      ...state.appearances.map((appearance) => appearance.playerId),
      ...state.events.flatMap((event) => [event.playerId, ...(event.relatedPlayerId === undefined ? [] : [event.relatedPlayerId])]),
      ...(state.choices?.decisions ?? []).flatMap((decision) => (decision.playerId === undefined ? [] : [decision.playerId])),
    ]),
  ];
}

/** The players of a match's two squads, by key: our players' rows, the reserves' players. */
async function identitiesOf(saveId: string, keys: readonly string[]): Promise<Identity[]> {
  const league = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: [...keys] } },
    select: { playerKey: true, firstName: true, lastName: true, birthDate: true },
  });
  const known = new Set(league.map((row) => row.playerKey));
  const wanted = keys.filter((key) => !known.has(key));
  if (wanted.length === 0) {
    return league;
  }
  const reserves = await readReserves(prisma, saveId);
  const reserve = reserves.flatMap((row) =>
    row.reserve
      .filter((player) => wanted.includes(player.key))
      .map((player) => ({ playerKey: player.key, firstName: player.firstName, lastName: player.lastName, birthDate: new Date(`${player.birthDate}T00:00:00.000Z`) })),
  );
  return [...league, ...reserve];
}

const fullName = (identity: { firstName: string; lastName: string }): string => `${identity.firstName} ${identity.lastName}`;

/** A match's events as the screens show them, by their order in the match. */
function eventViews(matchId: string, events: readonly MatchEvent[], identities: readonly Identity[], date: Date, from = 0): MatchEventView[] {
  const byKey = new Map(identities.map((row) => [row.playerKey, row]));
  return events.slice(from).map((event, index) => {
    const player = byKey.get(event.playerId);
    const related = event.relatedPlayerId === undefined ? undefined : byKey.get(event.relatedPlayerId);
    return {
      id: `${matchId}:${from + index}`,
      minute: event.minute,
      type: event.type,
      period: event.period ?? "REGULAR",
      side: event.side,
      playerName: player === undefined ? event.playerId : fullName(player),
      playerKey: event.playerId,
      playerAge: player === undefined ? null : ageInYears(player.birthDate, date),
      relatedPlayerName: related === undefined ? null : fullName(related),
      relatedPlayerKey: event.relatedPlayerId ?? null,
    };
  });
}

function decisionViews(decisions: readonly MatchDecision[], identities: readonly Identity[], from = 0): DecisionView[] {
  const byKey = new Map(identities.map((row) => [row.playerKey, row]));
  return decisions
    .filter((decision) => decision.sequence > from)
    .map((decision) => {
      const player = decision.playerId === undefined ? undefined : byKey.get(decision.playerId);
      return {
        sequence: decision.sequence,
        minute: decision.minute,
        kind: decision.kind as ChoiceKind,
        option: decision.option as ChoiceOption,
        assistant: decision.assistant,
        playerName: player === undefined ? null : fullName(player),
        playerKey: decision.playerId ?? null,
      };
    });
}

const LIVE_SELECT = {
  id: true,
  competition: true,
  startYear: true,
  round: true,
  pool: true,
  scheduledAt: true,
  home: true,
  away: true,
  neutral: true,
  played: true,
  homeGoals: true,
  awayGoals: true,
  decidedBy: true,
  homePenalties: true,
  awayPenalties: true,
  goalTimes: true,
  liveState: true,
  events: true,
  decisions: true,
  instructions: true,
  outcome: true,
} as const;

type LiveRow = Prisma.InternationalMatchGetPayload<{ select: typeof LIVE_SELECT }>;

/** A national match as the live screen reads a fixture: its nations, its score once played, its stage. */
function fixtureViewOf(row: Pick<LiveRow, "id" | "round" | "scheduledAt" | "competition" | "home" | "away" | "played" | "homeGoals" | "awayGoals" | "decidedBy" | "homePenalties" | "awayPenalties">, managed: string | null): FixtureView {
  return {
    id: row.id,
    round: row.round,
    cup: false,
    scheduledAt: row.scheduledAt,
    competitionCode: row.competition,
    home: nationTeamView(row.home, managed),
    away: nationTeamView(row.away, managed),
    played: row.played,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    homeHalfTimeGoals: null,
    awayHalfTimeGoals: null,
    decidedBy: row.decidedBy,
    homePenalties: row.homePenalties,
    awayPenalties: row.awayPenalties,
  };
}

const spansOf = (value: Prisma.JsonValue | null): InstructionSpan[] => (Array.isArray(value) ? (value as unknown as InstructionSpan[]) : []);

const colorsOf = (code: string | null) => (code !== null && isNationCode(code) ? NATION_COLORS[code] : nationTeamView("", null).colors);

/** The coach's national match on the live screen, waiting at a pause or played: what the page reads first. */
export type NationalLive = {
  match: FixtureWithEvents;
  stage: { competition: string; round: number; pool: 0 | 1 | null; neutral: boolean; startYear: number };
  others: (ScoreTimeline & { pool: 0 | 1 | null })[]; // the other national matches of its date, played; a tournament's with its group
  pause: LivePauseView | null;
  team: HalfTimeTeam | null;
  instructions: InstructionSpan[] | null; // while it waits; null once over
};

/**
 * The coach's national match on the live screen (matchId, or the one waiting, Save.liveInternationalId): its events and
 * his decisions so far, the pause it waits at with its choice event and his team there (the Coaching panel's), the other
 * matches of its date. null when the match is not one of his nation's.
 */
export async function getNationalLive(saveId: string, matchId: string | null): Promise<NationalLive | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveInternationalId: true, nationCode: true, currentDate: true } });
  const id = matchId ?? save.liveInternationalId;
  if (id === null) {
    return null;
  }
  const row = await prisma.internationalMatch.findFirst({ where: { id, saveId }, select: LIVE_SELECT });
  // One of the coach's: waiting live, or played by the full engine (its outcome kept); never a light match.
  if (row === null || (row.liveState === null && row.outcome === null)) {
    return null;
  }
  const waiting = row.liveState === null ? null : parseLiveState(row.id, row.liveState);
  const events = waiting === null ? parseEvents(row.events) : waiting.state.events;
  const decisions = waiting === null ? parseDecisions(row.decisions) : (waiting.state.choices?.decisions ?? []);
  const keys =
    waiting === null
      ? [...new Set([...events.flatMap((event) => [event.playerId, ...(event.relatedPlayerId === undefined ? [] : [event.relatedPlayerId])]), ...decisions.flatMap((decision) => (decision.playerId === undefined ? [] : [decision.playerId]))])]
      : keysOf(waiting.state);
  const identities = await identitiesOf(saveId, keys);
  const othersRows = await prisma.internationalMatch.findMany({
    where: { saveId, scheduledAt: row.scheduledAt, played: true, id: { not: row.id } },
    orderBy: { home: "asc" },
    select: { id: true, round: true, pool: true, scheduledAt: true, competition: true, home: true, away: true, played: true, homeGoals: true, awayGoals: true, decidedBy: true, homePenalties: true, awayPenalties: true, goalTimes: true },
  });
  const pause = waiting === null ? null : livePauseViewOf(waiting.state, waiting.managedSide, identities);
  const managedCode =
    waiting !== null ? (waiting.managedSide === "home" ? row.home : row.away) : save.nationCode === row.home || save.nationCode === row.away ? save.nationCode : null;
  const team =
    waiting === null || pause === null
      ? null
      : halfTimeTeamOf(waiting.state, waiting.managedSide, pause, identities, save.currentDate, colorsOf(managedCode));
  return {
    match: {
      ...fixtureViewOf(row, managedCode),
      events: eventViews(row.id, events, identities, row.scheduledAt),
      decisions: decisionViews(decisions, identities),
      instructions: waiting === null ? spansOf(row.instructions) : instructionsOf(waiting.state, waiting.managedSide),
    },
    stage: { competition: row.competition, round: row.round, pool: row.pool === 0 ? 0 : row.pool === 1 ? 1 : null, neutral: row.neutral, startYear: row.startYear },
    others: othersRows.map(({ goalTimes, pool, ...other }) => ({
      ...fixtureViewOf(other, managedCode),
      pool: pool === 0 ? (0 as const) : pool === 1 ? (1 as const) : null,
      goals: decodeGoalTimes(goalTimes).map((goal, index) => ({ id: `${other.id}:${index}`, ...goal })),
    })),
    pause,
    team,
    instructions: waiting === null ? null : instructionsOf(waiting.state, waiting.managedSide),
  };
}

/** Where the coach's national match stands after a move: the pause it waits at, or its result once over. */
export type AdvancedNationalMatch = {
  matchId: string;
  pause: LivePause | null;
  result: MatchResult | null;
  score: { homeGoals: number; awayGoals: number };
  state: MatchState;
  managedSide: Side;
  date: Date;
  eventsBefore: number;
  decisionsBefore: number;
  step: NationalStep | null; // once over: its session gone on to his next match at stake, or ended
};

/**
 * Plays the coach's national match on from the pause it waits at (`at`), in one transaction, and only from that pause, as
 * advanceLiveMatch does for his club's: the save locked, the pause claimed by a conditional update on the stored state,
 * his decision on the open choice event, his changes and his instruction, then its segments up to where `until` says.
 * Its events and decisions are kept on its row at each pause. Once over: the save's match waits no more, and its session
 * records it and goes on (playNationalStep, until his next match at stake), the federation's verdict once its last
 * qualifiers are played. Refusals as advanceLiveMatch's.
 */
export async function advanceNationalLiveMatch(saveId: string, at: LivePause, input: PlayOnInput, until: PlayOnUntil): Promise<AdvancedNationalMatch> {
  return prisma.$transaction(
    async (tx) => {
      await lockSave(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { ...COACH_SAVE_SELECT, liveInternationalId: true } });
      if (save.liveInternationalId === null) {
        throw new NoMatchInProgressError(saveId);
      }
      const row = await tx.internationalMatch.findFirst({
        where: { id: save.liveInternationalId, saveId, played: false },
        select: { id: true, scheduledAt: true, home: true, away: true, liveState: true },
      });
      if (row === null || row.liveState === null) {
        throw new Error(`Save ${saveId} points to international match ${save.liveInternationalId}, which does not wait live`);
      }
      const { managedSide, state: paused } = parseLiveState(row.id, row.liveState);
      const pause = pauseOf(paused);
      if (pause === null || pause.phase !== at.phase || pause.minute !== at.minute) {
        throw new PauseMismatchError(row.id);
      }
      const claimed = await tx.$executeRaw`
        UPDATE "InternationalMatch" SET "played" = "played"
        WHERE "id" = ${row.id} AND "saveId" = ${saveId} AND "liveState" = ${JSON.stringify(row.liveState)}::jsonb`;
      if (claimed !== 1) {
        throw new PauseMismatchError(row.id);
      }
      const seed = coachMatchSeed(save, { date: row.scheduledAt, home: row.home, away: row.away });
      let state = paused;
      if ((paused.choices?.pending ?? null) !== null) {
        state = decideChoice(paused, seed, input.decision ?? null);
      }
      state = playOn(state, managedSide, seed, { changes: input.changes ?? null, instruction: input.instruction ?? null }, until);
      const moved = {
        matchId: row.id,
        state,
        managedSide,
        date: row.scheduledAt,
        eventsBefore: paused.events.length,
        decisionsBefore: paused.choices?.decisions.length ?? 0,
      };
      if (state.phase !== "FULL_TIME") {
        await tx.internationalMatch.update({
          where: { id: row.id, saveId },
          data: {
            liveState: serializeLiveState({ managedSide, state }),
            events: JSON.parse(JSON.stringify(state.events)) as Prisma.InputJsonValue,
            decisions: JSON.parse(JSON.stringify(state.choices?.decisions ?? [])) as Prisma.InputJsonValue,
          },
        });
        return { ...moved, pause: pauseOf(state), result: null, score: scoreOf(state), step: null };
      }
      const result = matchResult(state);
      await tx.save.update({ where: { id: saveId }, data: { liveInternationalId: null } });
      const coach = coachSaveOf(save);
      if (coach === null) {
        throw new Error(`Save ${saveId} plays a national match live without a national team`);
      }
      const step = await playNationalStep(tx, coach, "until-stop", undefined, { id: row.id, result, managedSide });
      if (step !== null && step.completed !== null) {
        await checkCoachQualification(tx, coach, step.session);
      }
      return { ...moved, pause: null, result, score: { homeGoals: result.homeGoals, awayGoals: result.awayGoals }, step };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}

/** What the live page shows after a move of the coach's national match, as getLiveStep for his club's. */
export async function getNationalLiveStep(saveId: string, moved: AdvancedNationalMatch): Promise<LiveStep> {
  const { state, managedSide } = moved;
  const identities = await identitiesOf(saveId, keysOf(state));
  const events = eventViews(moved.matchId, state.events, identities, moved.date, moved.eventsBefore);
  const decisions = decisionViews(state.choices?.decisions ?? [], identities, moved.decisionsBefore);
  const instructions = instructionsOf(state, managedSide);
  if (moved.pause === null) {
    const result = moved.result;
    return {
      events,
      decisions,
      instructions,
      pause: null,
      team: null,
      result:
        result === null
          ? null
          : {
              homeGoals: result.homeGoals,
              awayGoals: result.awayGoals,
              decidedBy: result.decidedBy ?? null,
              homePenalties: result.homePenalties ?? null,
              awayPenalties: result.awayPenalties ?? null,
            },
    };
  }
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true, nationCode: true } });
  return {
    events,
    decisions,
    instructions,
    pause: livePauseViewOf(state, managedSide, identities),
    team: halfTimeTeamOf(state, managedSide, moved.pause, identities, save.currentDate, colorsOf(save.nationCode)),
    result: null,
  };
}
