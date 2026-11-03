import { HALF_TIME_MINUTE, REGULATION_MINUTES } from "../engine/balance";
import { decideChoice, type ChoiceKind, type ChoiceOption } from "../engine/choices";
import { fitnessFactor } from "../engine/fitness";
import { pauseOf, playOn, type LivePause, type PlayOnInput, type PlayOnUntil } from "../engine/live";
import { breakSubstitutionLimit, condition, fitnessAt, inMatchFactor, matchResult, scoreOf, type MatchResult } from "../engine/match";
import { formationPositions, type FormationName } from "../engine/formations";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { recordChallengeScore } from "./challenge";
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

/** Statuses of a fixture paused at a break. */
const PAUSED_STATUSES: MatchBreak[] = ["HALF_TIME", "REGULATION_END"];

/** Statuses of a fixture whose match waits live: at a break, or between two segments. */
const LIVE_STATUSES: ("IN_PLAY" | MatchBreak)[] = ["IN_PLAY", ...PAUSED_STATUSES];

/**
 * A player at a break, with his form, his fitness at that minute, the factor of his share of strength for his fitness
 * (fresh at kick-off, worn since, hurt if he plays on after a knock), and his whole factor for form, morale and fitness
 * (the engine's condition): what the next segment plays him at.
 */
export type HalfTimePlayer = LineupPlayer & { form: number; fitness: number; fitnessFactor: number; condition: number };

/** The managed club at a break, as the half-time (or end of regulation time) screen shows it. */
export type HalfTimeTeam = {
  phase: MatchBreak;
  maxSubstitutions: number; // in the whole match: one more before extra time (breakSubstitutionLimit)
  formation: FormationName;
  starters: (string | null)[]; // player key per slot: on the pitch, or injured in the first half and still in his slot
  injured: string[]; // injured in the first half: off the pitch, to replace
  sentOff: { slot: number; playerKey: string }[]; // their slots stay empty
  bench: string[]; // substitutes who can still come on
  booked: string[]; // players with a yellow card, still on the pitch or not: a second one sends off
  substitutions: number; // already made in the match
  players: HalfTimePlayer[]; // every player above, rated as the engine plays him
  clubColors: ClubColors;
};

/** The managed club's side of its match paused at a break, or null when no match waits. */
export async function getHalfTimeTeam(saveId: string): Promise<HalfTimeTeam | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, currentDate: true } });
  if (save.liveFixtureId === null) {
    return null;
  }
  const fixture = await prisma.fixture.findFirst({
    where: { id: save.liveFixtureId, saveId, status: { in: PAUSED_STATUSES } },
    select: { id: true, liveState: true },
  });
  if (fixture === null) {
    return null;
  }
  const { managedSide, state } = parseLiveState(fixture.id, fixture.liveState);
  const team = state[managedSide];
  const club = await prisma.clubSave.findFirstOrThrow({
    where: { saveId, isManaged: true },
    select: { club: { select: { primaryColor: true, secondaryColor: true } } },
  });

  // The minute the next segment starts from: what the players have left in their legs then.
  const breakMinute = state.phase === "REGULATION_END" ? REGULATION_MINUTES : HALF_TIME_MINUTE;
  const fitnessOf = new Map([
    ...team.pitch.map((entry) => [entry.player.id, fitnessAt(entry, breakMinute)] as const),
    ...team.bench.map((player) => [player.id, player.fitness] as const),
  ]);
  // A substitute has not played: his freshness of kick-off alone.
  const factorOf = new Map([
    ...team.pitch.map((entry) => [entry.player.id, fitnessFactor(entry.player.fitness) * inMatchFactor(entry, breakMinute)] as const),
    ...team.bench.map((player) => [player.id, fitnessFactor(player.fitness)] as const),
  ]);
  const squad = [...team.pitch.map((entry) => entry.player), ...team.bench];
  const identities = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: squad.map((player) => player.id) } },
    select: { playerKey: true, firstName: true, lastName: true, birthDate: true },
  });
  const identityOf = new Map(identities.map((row) => [row.playerKey, row]));
  const injured = new Set(team.pitch.filter((entry) => entry.status === "INJURED").map((entry) => entry.player.id));

  const starters: (string | null)[] = formationPositions(team.formation).map(() => null);
  for (const entry of team.pitch) {
    if (entry.status !== "SENT_OFF") {
      starters[entry.index] = entry.player.id;
    }
  }
  return {
    phase: state.phase === "REGULATION_END" ? "REGULATION_END" : "HALF_TIME",
    maxSubstitutions: breakSubstitutionLimit(state),
    formation: team.formation,
    starters,
    injured: [...injured],
    sentOff: team.pitch
      .filter((entry) => entry.status === "SENT_OFF")
      .map((entry) => ({ slot: entry.index, playerKey: entry.player.id })),
    bench: team.bench.map((player) => player.id),
    booked: team.booked,
    substitutions: team.substitutions,
    // The ratings of the snapshot the engine plays, not today's: nothing changes them until the final whistle.
    players: squad.map((player) => {
      const identity = getOrThrow(identityOf, player.id, "player");
      const fitness = getOrThrow(fitnessOf, player.id, "fitness");
      const fitnessFactorAtBreak = getOrThrow(factorOf, player.id, "fitness factor");
      return {
        id: player.id,
        position: player.position,
        overall: player.overall,
        injured: injured.has(player.id),
        injuredUntil: null,
        form: player.form,
        fitness,
        fitnessFactor: fitnessFactorAtBreak,
        condition: condition(player) * fitnessFactorAtBreak,
        firstName: identity.firstName,
        lastName: identity.lastName,
        age: ageInYears(identity.birthDate, save.currentDate),
      };
    }),
    clubColors: clubColorsOf(club.club),
  };
}

/** A choice event as the live page receives it: its options, each player named, the kick's chance shown. */
export type ChoiceEventView = {
  minute: number;
  kind: ChoiceKind;
  player: string | null; // the player it is about
  options: { option: ChoiceOption; playerKey: string | null; player: string | null; chance: number | null }[];
  assistant: number; // the assistant's option
};

/** Where the managed club's match waits, and the choice event open there; never what follows. */
export type LivePauseView = LivePause & { choice: ChoiceEventView | null };

/** The pause the managed club's match waits at, or null when no match waits. */
export async function getLivePause(saveId: string): Promise<LivePauseView | null> {
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
  const { state } = parseLiveState(fixture.id, fixture.liveState);
  const pause = pauseOf(state);
  const event = state.choices?.pending ?? null;
  if (pause === null || event === null) {
    return pause === null ? null : { ...pause, choice: null };
  }
  const keys = [event.playerId, ...event.options.map((option) => option.playerId)].filter((key): key is string => key !== undefined);
  const rows = await prisma.playerSave.findMany({
    where: { saveId, playerKey: { in: keys } },
    select: { playerKey: true, firstName: true, lastName: true },
  });
  const names = new Map(rows.map((row) => [row.playerKey, `${row.firstName} ${row.lastName}`]));
  const nameOf = (key: string | undefined): string | null => (key === undefined ? null : (names.get(key) ?? null));
  return {
    ...pause,
    choice: {
      minute: event.minute,
      kind: event.kind,
      player: nameOf(event.playerId),
      options: event.options.map((option) => ({
        option: option.option,
        playerKey: option.playerId ?? null,
        player: nameOf(option.playerId),
        chance: option.chance ?? null,
      })),
      assistant: event.assistant,
    },
  };
}

/** Where the match stands after a move: the pause it waits at, or its result once over. */
export type AdvancedMatch = {
  fixtureId: string;
  pause: LivePause | null; // null once over
  result: MatchResult | null;
  score: { homeGoals: number; awayGoals: number };
};

/**
 * Plays the managed club's match on from the pause it waits at, in one transaction, and only from that pause: `at`
 * names it (phase and minute), and a resume naming another one, already played on from another tab or by a second
 * click, is refused with PauseMismatchError. The save is locked first, then the pause claimed by a conditional update
 * on the stored state: of two resumes at once, the second finds the pause gone and writes nothing.
 * - At a choice event: the manager's decision (null: the assistant's), written before anything that follows is played.
 * - At a break: the manager's changes (null: the automatic ones), with the opponent's at half-time.
 * Then the match plays on (playOn) one segment, to its next pause or to its next break, as `until` says: its events
 * written, and its state at the new pause, the half-time score once there. Once over: the rest of its events and
 * decisions, the final score, the cup tie's winner, season stats, form, fitness, injuries and suspensions, the cups'
 * prizes and draws, the challenge's score, then Save.liveFixtureId cleared. The same choices always give the same match,
 * and the assistant's decisions with the automatic changes the match played without a pause. A state of version 1 plays
 * on the same way, without choice events. An invalid choice throws HalfTimeChoiceError or ChoiceError and writes nothing.
 */
export async function advanceLiveMatch(
  saveId: string,
  at: LivePause,
  input: PlayOnInput,
  until: PlayOnUntil,
): Promise<AdvancedMatch> {
  return prisma.$transaction(
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

      // The manager's decision on the open choice event, written before anything that follows is played.
      let state = paused;
      let decisionsWritten = paused.choices?.decisions.length ?? 0;
      if ((paused.choices?.pending ?? null) !== null) {
        state = decideChoice(paused, matchSeed, input.decision ?? null);
        const made = matchDecisionRows(fixture.id, state.choices?.decisions.slice(decisionsWritten) ?? [], stateByKey);
        await tx.matchDecision.createMany({ data: made });
        decisionsWritten += made.length;
      }
      state = playOn(state, managedSide, matchSeed, { changes: input.changes ?? null }, until);
      const newEvents = state.events.slice(paused.events.length);
      const newDecisions = state.choices?.decisions.slice(decisionsWritten) ?? [];

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
        const events = matchEventRows(fixture.id, newEvents, stateByKey);
        if (events.length > 0) {
          await tx.matchEvent.createMany({ data: events });
        }
        const decisions = matchDecisionRows(fixture.id, newDecisions, stateByKey);
        if (decisions.length > 0) {
          await tx.matchDecision.createMany({ data: decisions });
        }
        return { fixtureId: fixture.id, pause: pauseOf(state), result: null, score: scoreOf(state) };
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
            newEvents,
            newDecisions,
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
      // A challenge save's entry, now that its club's match is over.
      await recordChallengeScore(tx, saveId, save.challengeId);
      await tx.save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
      return {
        fixtureId: fixture.id,
        pause: null,
        result,
        score: { homeGoals: result.homeGoals, awayGoals: result.awayGoals },
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
