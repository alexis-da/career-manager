import { MAX_SUBSTITUTION_WINDOWS } from "../engine/balance";
import { decideChoice, optionInstruction, type ChoiceEvent, type ChoiceKind, type ChoiceOption } from "../engine/choices";
import { fitnessFactor } from "../engine/fitness";
import { pauseOf, playOn, type LivePause, type PausePhase, type PlayOnInput, type PlayOnUntil } from "../engine/live";
import {
  assistantInstruction,
  breakSubstitutionLimit,
  currentInstructionOf,
  fitnessAt,
  inMatchFactor,
  instructionAt,
  instructionSourceAt,
  matchResult,
  replacementFor,
  scoreOf,
  startingInstructionOf,
  windowOpenAt,
  type DecidedBy,
  type Instruction,
  type InstructionSource,
  type InstructionSpan,
  type MatchResult,
  type MatchState,
  type Side,
} from "../engine/match";
import { formationPositions, type FormationName } from "../engine/formations";
import type { AttributeName } from "../engine/generation";
import { condition } from "../engine/strength";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { matchFacts } from "../lib/missions";
import { DECISIONS_SELECT, EVENTS_SELECT, toDecisionView, toEventView, type DecisionView, type MatchEventView } from "./calendar";
import { recordFirstMatch, recordFirstSeasonEnd } from "./activation";
import { recordChallengeScore } from "./challenge";
import { countManagedMatch } from "./daily-stats";
import { recordMissionMoves } from "./missions";
import { refreshBoardConfidence } from "./objectives";
import { prisma } from "./client";
import { progressCups } from "./cup";
import type { LineupPlayer } from "./lineup";
import { parseLiveState, serializeLiveState } from "./live-state";
import {
  FIXTURE_SEASON_SELECT,
  fixtureMatchSeed,
  isKnockout,
  liveFixtureStatus,
  lockSave,
  matchDecisionRows,
  matchEventRows,
  PLAYER_SELECT,
  recordFinishedMatches,
  squadsOf,
  TRANSACTION_MAX_WAIT_MS,
  TRANSACTION_TIMEOUT_MS,
} from "./matchday";

export class NoMatchInProgressError extends Error {
  constructor(saveId: string) {
    super(`Save ${saveId} has no match waiting to be played on`);
    this.name = "NoMatchInProgressError";
  }
}

/**
 * Refusal of a resume naming a pause the match no longer waits at: played on already, from another tab or by a second
 * click. Nothing is written; the page reads where the match stands.
 */
export class PauseMismatchError extends Error {
  constructor(readonly fixtureId: string) {
    super(`Fixture ${fixtureId} no longer waits at that pause`);
    this.name = "PauseMismatchError";
  }
}

/** The breaks a managed club's match waits at: half-time, and the end of regulation time of a level cup tie. */
export type MatchBreak = "HALF_TIME" | "REGULATION_END";

/** Statuses of a fixture whose match waits live: at a break, or between two segments (and between the periods of extra time). */
const LIVE_STATUSES: ("IN_PLAY" | MatchBreak)[] = ["IN_PLAY", "HALF_TIME", "REGULATION_END"];

/** What a player has done in a match so far: his goals, his assists and his cards. */
export type MatchActions = { goals: number; assists: number; yellowCards: number; redCards: number };

/**
 * A player at a pause, with his form, his fitness at that minute, the factor of his share of strength for his fitness
 * (fresh at kick-off, worn since, hurt if he plays on after a knock), and his whole factor for form, morale and fitness
 * (the engine's condition): what the next segment plays him at. With his attributes and what he has done in the match,
 * which the Coaching panel's comparison of a substitution shows.
 */
export type HalfTimePlayer = LineupPlayer & {
  form: number;
  fitness: number;
  fitnessFactor: number;
  condition: number;
  attributes: Record<AttributeName, number>;
  actions: MatchActions;
};

const NO_ACTION: MatchActions = { goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

/** Each player's goals, assists and cards in a match so far, by key: a side's, the shoot-out left out. */
function actionsOf(state: MatchState, side: Side): Map<string, MatchActions> {
  const actions = new Map<string, MatchActions>();
  const add = (key: string | undefined, action: keyof MatchActions): void => {
    if (key === undefined) {
      return;
    }
    const done = { ...(actions.get(key) ?? NO_ACTION) };
    done[action] += 1;
    actions.set(key, done);
  };
  for (const event of state.events) {
    if (event.side !== side || event.period === "SHOOTOUT") {
      continue;
    }
    if (event.type === "GOAL") {
      add(event.playerId, "goals");
      add(event.relatedPlayerId, "assists");
    } else if (event.type === "YELLOW_CARD") {
      add(event.playerId, "yellowCards");
    } else if (event.type === "RED_CARD") {
      add(event.playerId, "redCards");
    }
  }
  return actions;
}

/**
 * The managed club at a pause of its match, as the Coaching panel shows it: named after half-time, its first pause, it
 * opens at every one. The substitutions it may make there (MAX_SUBSTITUTIONS, one more from the end of regulation time;
 * during play, in a window only), the instruction it plays the next segment with, its players as they stand.
 */
export type HalfTimeTeam = {
  phase: PausePhase;
  minute: number; // the pause's: the minute the next segment starts from
  maxSubstitutions: number; // in the whole match: one more before extra time (breakSubstitutionLimit)
  substitutions: number; // already made in the match
  windows: { used: number; max: number; open: boolean }; // during play; open: a substitution may be made at this pause
  manual: boolean; // its manager makes its substitutions himself: its assistant makes none any more
  // Who set the current one: given for the period of play by him (MANAGER) or an event, or else the assistant's rule,
  // which comes back to the starting instruction (START) when it has nothing to say.
  instruction: { current: Instruction; source: InstructionSource; assistant: Instruction; starting: Instruction };
  formation: FormationName;
  starters: (string | null)[]; // player key per slot: on the pitch, or injured and still in his slot
  injured: string[]; // injured and not replaced: off the pitch, to replace
  sentOff: { slot: number; playerKey: string }[]; // their slots stay empty
  bench: string[]; // substitutes who can still come on
  booked: string[]; // players with a yellow card, still on the pitch or not: a second one sends off
  hurt: string[]; // playing on after a knock
  players: HalfTimePlayer[]; // every player above, rated as the engine plays him
  clubColors: ClubColors;
};

type Identity = { playerKey: string; firstName: string; lastName: string; birthDate: Date };

/** The managed club's side of its match at a pause, from the state the engine plays and its players' identities. */
function halfTimeTeamOf(
  state: MatchState,
  side: Side,
  pause: LivePause,
  identities: readonly Identity[],
  today: Date,
  clubColors: ClubColors,
): HalfTimeTeam {
  const team = state[side];
  const minute = pause.minute;
  // What the players have left in their legs when the next segment starts; a substitute has not played.
  const fitnessOf = new Map([
    ...team.pitch.map((entry) => [entry.player.id, fitnessAt(entry, minute)] as const),
    ...team.bench.map((player) => [player.id, player.fitness] as const),
  ]);
  const factorOf = new Map([
    ...team.pitch.map((entry) => [entry.player.id, fitnessFactor(entry.player.fitness) * inMatchFactor(entry, minute)] as const),
    ...team.bench.map((player) => [player.id, fitnessFactor(player.fitness)] as const),
  ]);
  const squad = [...team.pitch.map((entry) => entry.player), ...team.bench];
  const identityOf = new Map(identities.map((row) => [row.playerKey, row]));
  const injured = new Set(team.pitch.filter((entry) => entry.status === "INJURED").map((entry) => entry.player.id));
  const actions = actionsOf(state, side);

  const starters: (string | null)[] = formationPositions(team.formation).map(() => null);
  for (const entry of team.pitch) {
    if (entry.status !== "SENT_OFF") {
      starters[entry.index] = entry.player.id;
    }
  }
  return {
    phase: pause.phase,
    minute,
    maxSubstitutions: breakSubstitutionLimit(state),
    substitutions: team.substitutions,
    windows: {
      used: team.windows?.length ?? 0,
      max: MAX_SUBSTITUTION_WINDOWS,
      open: pause.phase !== "IN_PLAY" || windowOpenAt(team, minute + 1),
    },
    manual: team.manual === true,
    instruction: {
      current: instructionAt(state, side),
      source: instructionSourceAt(state, side),
      assistant: assistantInstruction(state, side, minute),
      starting: startingInstructionOf(team),
    },
    formation: team.formation,
    starters,
    injured: [...injured],
    sentOff: team.pitch
      .filter((entry) => entry.status === "SENT_OFF")
      .map((entry) => ({ slot: entry.index, playerKey: entry.player.id })),
    bench: team.bench.map((player) => player.id),
    booked: team.booked,
    hurt: team.pitch.filter((entry) => entry.status === "ON" && entry.hurt === true).map((entry) => entry.player.id),
    // The ratings of the snapshot the engine plays, not today's: nothing changes them until the final whistle.
    players: squad.map((player) => {
      const identity = getOrThrow(identityOf, player.id, "player");
      const fitnessFactorAtPause = getOrThrow(factorOf, player.id, "fitness factor");
      return {
        id: player.id,
        position: player.position,
        overall: player.overall,
        injured: injured.has(player.id),
        injuredUntil: null,
        form: player.form,
        fitness: getOrThrow(fitnessOf, player.id, "fitness"),
        fitnessFactor: fitnessFactorAtPause,
        condition: condition(player) * fitnessFactorAtPause,
        attributes: {
          pace: player.pace,
          shooting: player.shooting,
          passing: player.passing,
          dribbling: player.dribbling,
          defending: player.defending,
          physical: player.physical,
          goalkeeping: player.goalkeeping,
        },
        actions: actions.get(player.id) ?? NO_ACTION,
        firstName: identity.firstName,
        lastName: identity.lastName,
        age: ageInYears(identity.birthDate, today),
      };
    }),
    clubColors,
  };
}

/** The keys of every player of a side's squad in a match: on the pitch, gone off, or on the bench. */
const squadKeys = (state: MatchState, side: Side): string[] => [
  ...state[side].pitch.map((entry) => entry.player.id),
  ...state[side].bench.map((player) => player.id),
];

/** The identities of a save's players, by key. */
const identitiesOf = (saveId: string, keys: readonly string[]): Promise<Identity[]> =>
  prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: [...keys] } },
    select: { playerKey: true, firstName: true, lastName: true, birthDate: true },
  });

const managedClubColors = async (saveId: string): Promise<ClubColors> => {
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { club: { select: { primaryColor: true, secondaryColor: true } } },
  });
  return clubColorsOf(club.club);
};

/** The managed club's side of its match at the pause it waits at, or null when no match waits. */
export async function getHalfTimeTeam(saveId: string): Promise<HalfTimeTeam | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, currentDate: true } });
  if (save.liveFixtureId === null) {
    return null;
  }
  const fixture = await prisma.fixture.findFirst({
    where: { id: save.liveFixtureId, saveId, status: { in: LIVE_STATUSES } },
    select: { id: true, liveState: true },
  });
  if (fixture === null) {
    return null;
  }
  const { managedSide, state } = parseLiveState(fixture.id, fixture.liveState);
  const pause = pauseOf(state);
  if (pause === null) {
    return null;
  }
  const [identities, clubColors] = [await identitiesOf(saveId, squadKeys(state, managedSide)), await managedClubColors(saveId)];
  return halfTimeTeamOf(state, managedSide, pause, identities, save.currentDate, clubColors);
}

/**
 * A choice event as the live page receives it: the player it is about, its options, each player named, the kick's
 * chance shown, for an option that takes a player off the substitute who comes on, and for a late tactical choice the
 * instruction it gives.
 */
export type ChoiceEventView = {
  minute: number;
  kind: ChoiceKind;
  player: string | null; // the player it is about
  playerKey: string | null;
  options: {
    option: ChoiceOption;
    playerKey: string | null;
    player: string | null;
    chance: number | null;
    replacement: { key: string; name: string } | null;
    instruction: Instruction | null; // for the rest of regular time
    current: boolean; // its instruction is the one the club has been playing with: « (actuelle) »
  }[];
  assistant: number; // the assistant's option
};

/** Where the managed club's match waits, and the choice event open there; never what follows. */
export type LivePauseView = LivePause & { choice: ChoiceEventView | null };

const fullName = (identity: { firstName: string; lastName: string }): string => `${identity.firstName} ${identity.lastName}`;

function choiceEventViewOf(event: ChoiceEvent, state: MatchState, side: Side, identities: readonly Identity[]): ChoiceEventView {
  const names = new Map(identities.map((row) => [row.playerKey, fullName(row)]));
  const current = currentInstructionOf(state[side]);
  const nameOf = (key: string | undefined): string | null => (key === undefined ? null : (names.get(key) ?? null));
  return {
    minute: event.minute,
    kind: event.kind,
    player: nameOf(event.playerId),
    playerKey: event.playerId ?? null,
    options: event.options.map((option) => {
      const replacement =
        (option.option === "TAKE_OFF" || option.option === "REPLACE") && option.playerId !== undefined
          ? replacementFor(state, side, option.playerId)
          : undefined;
      return {
        option: option.option,
        playerKey: option.playerId ?? null,
        player: nameOf(option.playerId),
        chance: option.chance ?? null,
        replacement: replacement === undefined ? null : { key: replacement.id, name: nameOf(replacement.id) ?? replacement.id },
        instruction: optionInstruction(option.option),
        current: optionInstruction(option.option) === current,
      };
    }),
    assistant: event.assistant,
  };
}

/** The pause a match waits at, with the choice event open there. */
function livePauseViewOf(state: MatchState, side: Side, identities: readonly Identity[]): LivePauseView | null {
  const pause = pauseOf(state);
  if (pause === null) {
    return null;
  }
  const event = state.choices?.pending ?? null;
  return { ...pause, choice: event === null ? null : choiceEventViewOf(event, state, side, identities) };
}

/**
 * The instructions a side has played its segments with, a span at each change and who set each: none in a state kept
 * before them.
 */
const instructionsOf = (state: MatchState, side: Side): InstructionSpan[] => state[side].instructions ?? [];

/**
 * The managed club's match where it waits, as the live page first reads it: the pause, and the instructions the club has
 * played its segments with up to there, from the same state. Each step brings its own (LiveStep).
 */
export type LiveWaiting = { pause: LivePauseView; instructions: InstructionSpan[] };

/** Where the managed club's match waits, and its instructions up to there; null when no match waits. */
export async function getLiveWaiting(saveId: string): Promise<LiveWaiting | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true } });
  if (save.liveFixtureId === null) {
    return null;
  }
  const fixture = await prisma.fixture.findFirst({
    where: { id: save.liveFixtureId, saveId, status: { in: LIVE_STATUSES } },
    select: { id: true, liveState: true },
  });
  if (fixture === null) {
    return null;
  }
  const { managedSide, state } = parseLiveState(fixture.id, fixture.liveState);
  const event = state.choices?.pending ?? null;
  // Names only when an event needs them.
  const identities = event === null ? [] : await identitiesOf(saveId, squadKeys(state, managedSide));
  const pause = livePauseViewOf(state, managedSide, identities);
  return pause === null ? null : { pause, instructions: instructionsOf(state, managedSide) };
}

/** The pause the managed club's match waits at, or null when no match waits. */
export async function getLivePause(saveId: string): Promise<LivePauseView | null> {
  return (await getLiveWaiting(saveId))?.pause ?? null;
}

/** Where the match stands after a move: the pause it waits at, or its result once over. */
export type AdvancedMatch = {
  fixtureId: string;
  pause: LivePause | null; // null once over
  result: MatchResult | null;
  score: { homeGoals: number; awayGoals: number };
  state: MatchState; // as the engine left it: at the pause, or over
  managedSide: Side;
  date: Date; // the match's
  eventsBefore: number; // the match's events written before the move: those after it are new
  decisionsBefore: number; // the same for its decisions
};

/**
 * Plays the managed club's match on from the pause it waits at, in one transaction, and only from that pause: `at`
 * names it (phase and minute), and a resume naming another one, already played on from another tab or by a second
 * click, is refused with PauseMismatchError. The save is locked first, then the pause claimed by a conditional update
 * on the stored state: of two resumes at once, the second finds the pause gone and writes nothing.
 * - At a choice event: the manager's decision (null: the assistant's), written before anything that follows is played.
 * - At any pause: the manager's changes (null: none, the automatic ones at half-time, with the opponent's) and his
 *   instruction (null: none).
 * Then the match plays on (playOn) one segment, to its next pause or to its next break, as `until` says: its events and
 * decisions written, and its state at the new pause, the half-time score once there. Once over: the final score, the cup
 * tie's winner, season stats, form, fitness, injuries and suspensions, the cups' prizes and draws, the challenge's score,
 * then Save.liveFixtureId cleared. The same choices always give the same match, and the assistant's decisions with no
 * change but the automatic ones the match played without a pause. A state of version 1 plays on the same way, without
 * choice events. An invalid choice throws HalfTimeChoiceError or ChoiceError and writes nothing.
 */
export async function advanceLiveMatch(
  saveId: string,
  at: LivePause,
  input: PlayOnInput,
  until: PlayOnUntil,
): Promise<AdvancedMatch> {
  const advanced = await prisma.$transaction(
    async (tx) => {
      await lockSave(tx, saveId);
      const save = await tx.save.findUniqueOrThrow({
        where: { id: saveId },
        select: { seed: true, liveFixtureId: true, challengeId: true },
      });
      if (save.liveFixtureId === null) {
        throw new NoMatchInProgressError(saveId);
      }
      const clubSelect = { select: { club: { select: { slug: true } } } } as const;
      const fixture = await tx.fixture.findFirst({
        where: { id: save.liveFixtureId, saveId, status: { in: LIVE_STATUSES } },
        select: {
          id: true,
          round: true,
          seasonId: true,
          scheduledAt: true,
          status: true,
          homeClubSaveId: true,
          awayClubSaveId: true,
          liveState: true,
          season: FIXTURE_SEASON_SELECT,
          homeClubSave: clubSelect,
          awayClubSave: clubSelect,
        },
      });
      if (fixture === null) {
        throw new Error(`Save ${saveId} points to fixture ${save.liveFixtureId}, which does not wait live`);
      }

      const { managedSide, state: paused } = parseLiveState(fixture.id, fixture.liveState);
      const pause = pauseOf(paused);
      if (pause === null || pause.phase !== at.phase || pause.minute !== at.minute) {
        throw new PauseMismatchError(fixture.id);
      }
      // The pause claimed: the stored state must still be the one just read.
      const claimed = await tx.$executeRaw`
        UPDATE "Fixture" SET "status" = "status"
        WHERE "id" = ${fixture.id} AND "saveId" = ${saveId} AND "liveState" = ${JSON.stringify(fixture.liveState)}::jsonb`;
      if (claimed !== 1) {
        throw new PauseMismatchError(fixture.id);
      }

      // The clubs' current players, whose form and injuries change, and anyone of the match who has left since.
      const matchKeys = [...paused.home.pitch, ...paused.away.pitch].map((entry) => entry.player.id);
      const benchKeys = [...paused.home.bench, ...paused.away.bench].map((player) => player.id);
      const rows = await tx.playerSave.findMany({
        where: {
          saveId,
          OR: [
            { clubSaveId: { in: [fixture.homeClubSaveId, fixture.awayClubSaveId] } },
            { playerKey: { in: [...matchKeys, ...benchKeys] } },
          ],
        },
        select: PLAYER_SELECT,
      });
      const { squads, stateByKey } = squadsOf(rows, fixture.scheduledAt);
      const matchSeed = fixtureMatchSeed(save.seed, fixture);
      const decisionsBefore = paused.choices?.decisions.length ?? 0;

      // The manager's decision on the open choice event, written before anything that follows is played.
      let state = paused;
      if ((paused.choices?.pending ?? null) !== null) {
        state = decideChoice(paused, matchSeed, input.decision ?? null);
        await tx.matchDecision.createMany({
          data: matchDecisionRows(fixture.id, state.choices?.decisions.slice(decisionsBefore) ?? [], stateByKey),
        });
      }
      state = playOn(state, managedSide, matchSeed, { changes: input.changes ?? null, instruction: input.instruction ?? null }, until);
      const decisionsWritten = (paused.choices?.pending ?? null) !== null ? decisionsBefore + 1 : decisionsBefore;
      // Written here, before what a finished match records: a step's events and decisions, all of them.
      const events = matchEventRows(fixture.id, state.events.slice(paused.events.length), stateByKey);
      if (events.length > 0) {
        await tx.matchEvent.createMany({ data: events });
      }
      const decisions = matchDecisionRows(fixture.id, state.choices?.decisions.slice(decisionsWritten) ?? [], stateByKey);
      if (decisions.length > 0) {
        await tx.matchDecision.createMany({ data: decisions });
      }
      const moved = { state, managedSide, date: fixture.scheduledAt, eventsBefore: paused.events.length, decisionsBefore };

      if (state.phase !== "FULL_TIME") {
        const updated = await tx.fixture.updateMany({
          where: { id: fixture.id, saveId },
          data: {
            status: liveFixtureStatus(state),
            liveState: serializeLiveState({ managedSide, state }),
            ...(state.phase === "HALF_TIME" ? { homeHalfTimeGoals: state.home.goals, awayHalfTimeGoals: state.away.goals } : {}),
          },
        });
        if (updated.count !== 1) {
          throw new Error(`Fixture ${fixture.id} could not wait at its next pause`);
        }
        return { ...moved, fixtureId: fixture.id, pause: pauseOf(state), result: null, score: scoreOf(state) };
      }

      const result = matchResult(state);
      await recordFinishedMatches(
        tx,
        saveId,
        fixture.scheduledAt,
        [
          {
            fixtureId: fixture.id,
            seasonId: fixture.seasonId,
            result,
            newEvents: [], // written above
            newDecisions: [],
            managedSide,
            knockout: isKnockout(fixture.season),
            squads: {
              home: getOrThrow(squads, fixture.homeClubSaveId, "home squad"),
              away: getOrThrow(squads, fixture.awayClubSaveId, "away squad"),
            },
          },
        ],
        stateByKey,
      );
      // A cup tie: its prize, and the next round once it was the round's last tie.
      await progressCups(tx, saveId, save.seed, [fixture.id]);
      // A challenge save's entry and the president's confidence, now that its club's match is over.
      await recordChallengeScore(tx, saveId, save.challengeId);
      await refreshBoardConfidence(tx, saveId);
      // The player's first steps (src/db/activation.ts): this match, and the season once it was the last of all.
      await recordFirstMatch(tx, saveId, { live: true });
      await recordFirstSeasonEnd(tx, saveId);
      await tx.save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
      return {
        ...moved,
        fixtureId: fixture.id,
        pause: null,
        result,
        score: { homeGoals: result.homeGoals, awayGoals: result.awayGoals },
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
  // The day's count of the matches players play (src/db/daily-stats.ts), once this one is over and written.
  if (advanced.result !== null) {
    await countManagedMatch(prisma, "live");
  }
  // The day's mission (src/db/missions.ts): the player's substitution or instruction at this pause, the match once over.
  await recordMissionMoves(prisma, saveId, {
    match: advanced.result === null ? null : { facts: matchFacts(advanced.result, advanced.managedSide, true), date: advanced.date },
    substitution: (input.changes?.substitutions.length ?? 0) > 0,
    instruction: (input.instruction ?? null) !== null,
  });
  return advanced;
}

/**
 * What the live page shows after a move, read once the move is written: the match's new events and decisions as the
 * screens show them, the instructions the managed club has played with so far, the pause it waits at now with its choice
 * event and the managed club there (the Coaching panel's), or how it ended. Nothing past that pause, which is not played
 * yet.
 */
export type LiveStep = {
  events: MatchEventView[];
  decisions: DecisionView[];
  // All of them, from kick-off: once the match is over, its state goes, and these with it.
  instructions: InstructionSpan[];
  pause: LivePauseView | null;
  team: HalfTimeTeam | null;
  result: { homeGoals: number; awayGoals: number; decidedBy: DecidedBy | null; homePenalties: number | null; awayPenalties: number | null } | null;
};

export async function getLiveStep(saveId: string, moved: AdvancedMatch): Promise<LiveStep> {
  const fixture = await prisma.fixture.findFirstOrThrow({
    where: { id: moved.fixtureId, saveId },
    select: {
      scheduledAt: true,
      events: EVENTS_SELECT,
      decisions: { ...DECISIONS_SELECT, where: { sequence: { gt: moved.decisionsBefore } } },
    },
  });
  // The events written before the move come first in match order: they never come after a new one.
  const events = fixture.events.slice(moved.eventsBefore).map(toEventView(fixture.scheduledAt));
  const decisions = fixture.decisions.map(toDecisionView);
  const { state, managedSide } = moved;
  const instructions = instructionsOf(state, managedSide);
  const pause = moved.pause;
  if (pause === null) {
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
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const identities = await identitiesOf(saveId, squadKeys(state, managedSide));
  const clubColors = await managedClubColors(saveId);
  return {
    events,
    decisions,
    instructions,
    pause: livePauseViewOf(state, managedSide, identities),
    team: halfTimeTeamOf(state, managedSide, pause, identities, save.currentDate, clubColors),
    result: null,
  };
}
