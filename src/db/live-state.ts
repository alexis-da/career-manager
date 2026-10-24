import * as z from "zod";
import { MAX_SUBSTITUTIONS } from "../engine/balance";
import { FORMATION_NAMES } from "../engine/formations";
import type { MatchState, Side } from "../engine/match";
import { POSITIONS } from "../engine/positions";
import type { Prisma } from "../generated/prisma/client";

const SLOT_COUNT = 11;

const rating = z.number().int().min(0).max(99);
const minute = z.number().int().min(0).max(200);
const playerKey = z.string().min(1).max(100);
const side = z.enum(["home", "away"]);
const position = z.enum(POSITIONS);

const squadPlayerSchema = z.object({
  id: playerKey,
  position,
  overall: rating,
  pace: rating,
  shooting: rating,
  passing: rating,
  dribbling: rating,
  defending: rating,
  physical: rating,
  goalkeeping: rating,
  form: rating,
  morale: rating,
  injured: z.boolean(),
});

const teamSchema = z.object({
  formation: z.enum(FORMATION_NAMES),
  pitch: z
    .array(
      z.object({
        index: z.number().int().min(0).max(SLOT_COUNT - 1),
        slot: position,
        player: squadPlayerSchema,
        from: minute,
        status: z.enum(["ON", "INJURED", "SENT_OFF"]),
      }),
    )
    .max(SLOT_COUNT),
  bench: z.array(squadPlayerSchema).max(50),
  substitutions: z.number().int().min(0).max(MAX_SUBSTITUTIONS),
  booked: z.array(playerKey),
  goals: z.number().int().min(0),
});

const matchStateSchema = z.object({
  phase: z.enum(["KICK_OFF", "HALF_TIME", "FULL_TIME"]),
  knockout: z.literal(true).optional(), // a cup tie: level after 90 minutes, extra time and a shoot-out follow
  fullTime: minute.nullable(),
  home: teamSchema,
  away: teamSchema,
  events: z.array(
    z.object({
      minute,
      side,
      type: z.enum(["GOAL", "YELLOW_CARD", "RED_CARD", "INJURY", "SUBSTITUTION"]),
      playerId: playerKey,
      relatedPlayerId: playerKey.optional(),
    }),
  ),
  appearances: z.array(
    z.object({ playerId: playerKey, side, slot: position, from: minute, to: minute, minutes: minute }),
  ),
  injuries: z.array(z.object({ playerId: playerKey, side, days: z.number().int().min(0) })),
});

/** Shape of Fixture.liveState: the engine state of the managed club's match at half-time, and the club's side. */
const liveStateSchema = z.object({
  version: z.literal(1),
  managedSide: side,
  state: matchStateSchema,
});

export type LiveState = { managedSide: Side; state: MatchState };

export class InvalidLiveStateError extends Error {
  constructor(fixtureId: string, cause: unknown) {
    super(`Fixture ${fixtureId} has an invalid live state`, { cause });
    this.name = "InvalidLiveStateError";
  }
}

export function serializeLiveState(live: LiveState): Prisma.InputJsonValue {
  // Round trip through JSON: optional keys left undefined disappear, as they will once stored.
  const value: Prisma.InputJsonValue = JSON.parse(JSON.stringify({ version: 1, ...live }));
  return value;
}

/** Fixture.liveState read back, validated: a malformed state is an error, never a match silently restarted. */
export function parseLiveState(fixtureId: string, value: unknown): LiveState {
  const parsed = liveStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidLiveStateError(fixtureId, parsed.error);
  }
  const { managedSide, state } = parsed.data;
  if (state.phase !== "HALF_TIME") {
    throw new InvalidLiveStateError(fixtureId, new Error(`phase ${state.phase}`));
  }
  return { managedSide, state };
}
