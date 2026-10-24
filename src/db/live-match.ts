import {
  applyHalfTimeChoice,
  automaticHalfTimeChoice,
  breakSubstitutionLimit,
  finishKnockout,
  halfRngSeed,
  matchResult,
  scoreOf,
  simulateHalf,
  type HalfTimeChoice,
  type MatchResult,
  type MatchState,
} from "../engine/match";
import { formationPositions, type FormationName } from "../engine/formations";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { progressCups } from "./cup";
import type { LineupPlayer } from "./lineup";
import { parseLiveState, serializeLiveState } from "./live-state";
import {
  FIXTURE_SEASON_SELECT,
  fixtureMatchSeed,
  isKnockout,
  matchEventRows,
  PLAYER_SELECT,
  recordFinishedMatches,
  squadsOf,
  TRANSACTION_MAX_WAIT_MS,
  TRANSACTION_TIMEOUT_MS,
} from "./matchday";

export class NoMatchInProgressError extends Error {
  constructor(saveId: string) {
    super(`Save ${saveId} has no match paused at a break`);
    this.name = "NoMatchInProgressError";
  }
}

/** The breaks a managed club's match waits at: half-time, and the end of regulation time of a level cup tie. */
export type MatchBreak = "HALF_TIME" | "REGULATION_END";

/** Statuses of a fixture paused at a break. */
const PAUSED_STATUSES: MatchBreak[] = ["HALF_TIME", "REGULATION_END"];

/** The managed club at a break, as the half-time (or end of regulation time) screen shows it. */
export type HalfTimeTeam = {
  phase: MatchBreak;
  maxSubstitutions: number; // in the whole match: one more before extra time (breakSubstitutionLimit)
  formation: FormationName;
  starters: (string | null)[]; // player key per slot: on the pitch, or injured in the first half and still in his slot
  injured: string[]; // injured in the first half: off the pitch, to replace
  sentOff: { slot: number; playerKey: string }[]; // their slots stay empty
  bench: string[]; // substitutes who can still come on
  substitutions: number; // already made in the match
  players: LineupPlayer[]; // every player above, rated as the engine plays him
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
    substitutions: team.substitutions,
    // The ratings of the snapshot the engine plays, not today's: nothing changes them until the final whistle.
    players: squad.map((player) => {
      const identity = getOrThrow(identityOf, player.id, "player");
      return {
        id: player.id,
        position: player.position,
        overall: player.overall,
        injured: injured.has(player.id),
        injuredUntil: null,
        firstName: identity.firstName,
        lastName: identity.lastName,
        age: ageInYears(identity.birthDate, save.currentDate),
      };
    }),
    clubColors: clubColorsOf(club.club),
  };
}

export type ResumedMatch = {
  fixtureId: string;
  from: MatchBreak; // the break the match resumed from
  result: MatchResult | null; // null: a cup tie level after 90 minutes, now waiting at the end of regulation time
  score: { homeGoals: number; awayGoals: number };
};

/**
 * Plays on the managed club's match paused at a break, in one transaction.
 * - At half-time: the manager's choice (null: the automatic changes, as an AI club makes them) and the opponent's
 *   automatic changes, then the second half with its own stream. A cup tie level after 90 minutes stops again at the
 *   end of regulation time: its second half's events and the engine state are written, the save still waits.
 * - At the end of regulation time: the manager's choice only (null: no change, and the opponent never changes here, as
 *   in a cup tie played without a pause), then extra time and the shoot-out (finishKnockout).
 * The same choices always give the same match. Once over: the events not written yet, the final score, the cup tie's
 * winner, season stats, form and injuries, the cups' prizes and draws, then the live state and Save.liveFixtureId
 * are cleared. An invalid choice throws HalfTimeChoiceError and writes nothing.
 */
export async function resumeLiveMatch(saveId: string, choice: HalfTimeChoice | null): Promise<ResumedMatch> {
  return prisma.$transaction(
    async (tx) => {
      const save = await tx.save.findUniqueOrThrow({ where: { id: saveId }, select: { seed: true, liveFixtureId: true } });
      if (save.liveFixtureId === null) {
        throw new NoMatchInProgressError(saveId);
      }
      const clubSelect = { select: { club: { select: { slug: true } } } } as const;
      const fixture = await tx.fixture.findFirst({
        where: { id: save.liveFixtureId, saveId, status: { in: PAUSED_STATUSES } },
        select: {
          id: true,
          round: true,
          seasonId: true,
          scheduledAt: true,
          homeClubSaveId: true,
          awayClubSaveId: true,
          liveState: true,
          season: FIXTURE_SEASON_SELECT,
          homeClubSave: clubSelect,
          awayClubSave: clubSelect,
        },
      });
      if (fixture === null) {
        throw new Error(`Save ${saveId} points to fixture ${save.liveFixtureId}, which is not paused at a break`);
      }

      const { managedSide, state: paused } = parseLiveState(fixture.id, fixture.liveState);
      const opponentSide = managedSide === "home" ? "away" : "home";
      const matchSeed = fixtureMatchSeed(save.seed, fixture);
      let state: MatchState;
      if (paused.phase === "HALF_TIME") {
        state = applyHalfTimeChoice(paused, managedSide, choice ?? automaticHalfTimeChoice(paused, managedSide));
        state = applyHalfTimeChoice(state, opponentSide, automaticHalfTimeChoice(state, opponentSide));
        state = simulateHalf(state, makeRng(halfRngSeed(matchSeed, "h2")), "h2");
      } else {
        state = choice === null ? paused : applyHalfTimeChoice(paused, managedSide, choice);
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

      if (state.phase === "REGULATION_END" && paused.phase === "HALF_TIME") {
        const updated = await tx.fixture.updateMany({
          where: { id: fixture.id, saveId, status: "HALF_TIME" },
          data: { status: "REGULATION_END", liveState: serializeLiveState({ managedSide, state }) },
        });
        if (updated.count !== 1) {
          throw new Error(`Fixture ${fixture.id} could not wait for extra time`);
        }
        const events = matchEventRows(fixture.id, state.events.slice(paused.events.length), stateByKey);
        if (events.length > 0) {
          await tx.matchEvent.createMany({ data: events });
        }
        return { fixtureId: fixture.id, from: paused.phase, result: null, score: scoreOf(state) };
      }

      state = finishKnockout(state, matchSeed);
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
            newEvents: result.events.slice(paused.events.length),
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
      await tx.save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
      return {
        fixtureId: fixture.id,
        from: paused.phase === "REGULATION_END" ? "REGULATION_END" : "HALF_TIME",
        result,
        score: { homeGoals: result.homeGoals, awayGoals: result.awayGoals },
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
