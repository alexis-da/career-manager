import {
  applyHalfTimeChoice,
  automaticHalfTimeChoice,
  halfRngSeed,
  matchResult,
  simulateHalf,
  type HalfTimeChoice,
  type MatchResult,
} from "../engine/match";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { parseLiveState } from "./live-state";
import {
  fixtureMatchSeed,
  PLAYER_SELECT,
  recordFinishedMatches,
  squadsOf,
  TRANSACTION_MAX_WAIT_MS,
  TRANSACTION_TIMEOUT_MS,
} from "./matchday";

export class NoMatchInProgressError extends Error {
  constructor(saveId: string) {
    super(`Save ${saveId} has no match paused at half-time`);
    this.name = "NoMatchInProgressError";
  }
}

export type ResumedMatch = {
  fixtureId: string;
  result: MatchResult;
};

/**
 * Plays the second half of the managed club's match paused at half-time, in one transaction: the manager's
 * half-time choice (null: the automatic changes, as an AI club makes them) and the opponent's automatic changes,
 * then the second half with its own stream, so the same choices always give the same match. Writes the second
 * half's events (half-time substitutions at 46'), the final score, season stats, form and injuries, then clears
 * the live state and Save.liveFixtureId. An invalid choice throws HalfTimeChoiceError and writes nothing.
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
        where: { id: save.liveFixtureId, saveId, status: "HALF_TIME" },
        select: {
          id: true,
          round: true,
          seasonId: true,
          scheduledAt: true,
          homeClubSaveId: true,
          awayClubSaveId: true,
          liveState: true,
          season: { select: { startYear: true } },
          homeClubSave: clubSelect,
          awayClubSave: clubSelect,
        },
      });
      if (fixture === null) {
        throw new Error(`Save ${saveId} points to fixture ${save.liveFixtureId}, which is not paused at half-time`);
      }

      const { managedSide, state: halfTime } = parseLiveState(fixture.id, fixture.liveState);
      const opponentSide = managedSide === "home" ? "away" : "home";
      let state = applyHalfTimeChoice(halfTime, managedSide, choice ?? automaticHalfTimeChoice(halfTime, managedSide));
      state = applyHalfTimeChoice(state, opponentSide, automaticHalfTimeChoice(state, opponentSide));
      state = simulateHalf(state, makeRng(halfRngSeed(fixtureMatchSeed(save.seed, fixture), "h2")), "h2");
      const result = matchResult(state);

      // The clubs' current players, whose form and injuries change, and anyone of the match who has left since.
      const matchKeys = [...halfTime.home.pitch, ...halfTime.away.pitch].map((entry) => entry.player.id);
      const benchKeys = [...halfTime.home.bench, ...halfTime.away.bench].map((player) => player.id);
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

      await recordFinishedMatches(
        tx,
        saveId,
        fixture.scheduledAt,
        [
          {
            fixtureId: fixture.id,
            seasonId: fixture.seasonId,
            result,
            newEvents: result.events.slice(halfTime.events.length),
            squads: {
              home: getOrThrow(squads, fixture.homeClubSaveId, "home squad"),
              away: getOrThrow(squads, fixture.awayClubSaveId, "away squad"),
            },
          },
        ],
        stateByKey,
      );
      await tx.save.update({ where: { id: saveId }, data: { liveFixtureId: null } });
      return { fixtureId: fixture.id, result };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
