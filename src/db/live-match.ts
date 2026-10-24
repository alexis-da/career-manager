import {
  applyHalfTimeChoice,
  automaticHalfTimeChoice,
  finishKnockout,
  halfRngSeed,
  matchResult,
  simulateHalf,
  type HalfTimeChoice,
  type MatchResult,
} from "../engine/match";
import { formationPositions, type FormationName } from "../engine/formations";
import { clubColorsOf, type ClubColors } from "../lib/color";
import { ageInYears } from "../lib/dates";
import { getOrThrow } from "../lib/maps";
import { makeRng } from "../lib/rng";
import { prisma } from "./client";
import { progressCups } from "./cup";
import type { LineupPlayer } from "./lineup";
import { parseLiveState } from "./live-state";
import {
  FIXTURE_SEASON_SELECT,
  fixtureMatchSeed,
  isKnockout,
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

/** The managed club at half-time, as the half-time screen shows it. */
export type HalfTimeTeam = {
  formation: FormationName;
  starters: (string | null)[]; // player key per slot: on the pitch, or injured in the first half and still in his slot
  injured: string[]; // injured in the first half: off the pitch, to replace
  sentOff: { slot: number; playerKey: string }[]; // their slots stay empty
  bench: string[]; // substitutes who can still come on
  substitutions: number; // already made in the match
  players: LineupPlayer[]; // every player above, rated as the engine plays him
  clubColors: ClubColors;
};

/** The managed club's side of its match paused at half-time, or null when no match waits. */
export async function getHalfTimeTeam(saveId: string): Promise<HalfTimeTeam | null> {
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { liveFixtureId: true, currentDate: true } });
  if (save.liveFixtureId === null) {
    return null;
  }
  const fixture = await prisma.fixture.findFirst({
    where: { id: save.liveFixtureId, saveId, status: "HALF_TIME" },
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
  result: MatchResult;
};

/**
 * Plays the second half of the managed club's match paused at half-time, in one transaction: the manager's
 * half-time choice (null: the automatic changes, as an AI club makes them) and the opponent's automatic changes,
 * then the second half with its own stream, so the same choices always give the same match; a cup tie level after 90
 * minutes goes on to extra time and a shoot-out, played at once. Writes the second half's events (half-time
 * substitutions at 46') and what follows, the final score, season stats, form and injuries, then clears
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
          season: FIXTURE_SEASON_SELECT,
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
      const matchSeed = fixtureMatchSeed(save.seed, fixture);
      state = finishKnockout(simulateHalf(state, makeRng(halfRngSeed(matchSeed, "h2")), "h2"), matchSeed);
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
      return { fixtureId: fixture.id, result };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
