import * as z from "zod";
import { EXTRA_TIME_SUBSTITUTIONS, FULL_FITNESS, HALF_TIME_MINUTE, MAX_SUBSTITUTIONS, REGULATION_MINUTES } from "../engine/balance";
import { CHOICE_KINDS, CHOICE_OPTIONS } from "../engine/choices";
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
const instruction = z.enum(["ATTACK", "BALANCED", "DEFEND"]);

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
  // At kick-off. A state paused before fatigue counted has none: every player was rested then.
  fitness: z.number().int().min(0).max(FULL_FITNESS).default(FULL_FITNESS),
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
        hurt: z.literal(true).optional(), // played on after a knock, a choice event's
      }),
    )
    .max(SLOT_COUNT),
  bench: z.array(squadPlayerSchema).max(50),
  substitutions: z.number().int().min(0).max(MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS),
  booked: z.array(playerKey),
  goals: z.number().int().min(0),
  windows: z.array(minute).max(MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS).optional(), // its windows during play
  manual: z.literal(true).optional(), // its manager makes its substitutions himself
});

const eventsSchema = z.array(
  z.object({
    minute,
    side,
    type: z.enum(["GOAL", "YELLOW_CARD", "RED_CARD", "INJURY", "SUBSTITUTION"]),
    playerId: playerKey,
    relatedPlayerId: playerKey.optional(),
    period: z.literal("EXTRA_TIME").optional(), // paused between the two periods of extra time
  }),
);

const appearancesSchema = z.array(
  z.object({ playerId: playerKey, side, slot: position, from: minute, to: minute, minutes: minute }),
);

const injuriesSchema = z.array(z.object({ playerId: playerKey, side, days: z.number().int().min(0) }));

const choiceKind = z.enum(CHOICE_KINDS);
const choiceOption = z.enum(CHOICE_OPTIONS);

/** The managed club's choice events: their plan, the event open at the pause, the decisions made. */
const choicesSchema = z.object({
  side,
  minutes: z.array(minute).max(5),
  pending: z
    .object({
      minute,
      kind: choiceKind,
      playerId: playerKey.optional(),
      options: z
        .array(z.object({ option: choiceOption, playerId: playerKey.optional(), chance: z.number().min(0).max(1).optional() }))
        .min(1)
        .max(3),
      assistant: z.number().int().min(0).max(2),
    })
    .nullable(),
  decisions: z
    .array(
      z.object({
        sequence: z.number().int().min(1),
        minute,
        kind: choiceKind,
        option: choiceOption,
        playerId: playerKey.optional(),
        assistant: z.boolean(),
      }),
    )
    .max(5),
});

/** What choice events leave for the segments to come. */
const modifiersSchema = z.object({
  goals: z.object({ home: z.number().positive().optional(), away: z.number().positive().optional() }),
  instructions: z.object({ home: instruction.optional(), away: instruction.optional() }),
  scheduled: z.array(
    z.object({ minute, side, kind: z.enum(["RED_CARD", "INJURY"]), playerId: playerKey, days: z.number().int().min(0) }),
  ),
});

/**
 * Version 2, the engine in segments with choice events: the state at any pause of the managed club's match, between two
 * segments (IN_PLAY, EXTRA_TIME_BREAK) or at a break, with the minutes played.
 */
const liveStateSchemaV2 = z.object({
  version: z.literal(2),
  managedSide: side,
  state: z.object({
    phase: z.enum(["IN_PLAY", "HALF_TIME", "REGULATION_END", "EXTRA_TIME_BREAK"]),
    played: minute,
    knockout: z.literal(true).optional(), // a cup tie: level after 90 minutes, extra time and a shoot-out follow
    regulationTime: minute.optional(), // the minute the 90 ended at, once extra time is reached
    fullTime: minute.nullable(),
    home: teamSchema,
    away: teamSchema,
    events: eventsSchema,
    appearances: appearancesSchema,
    injuries: injuriesSchema,
    choices: choicesSchema.optional(),
    modifiers: modifiersSchema.optional(),
  }),
});

/**
 * Version 1, before the pauses between segments: a state at half-time or at the end of regulation time of a cup tie
 * level after 90 minutes. Such a match plays on to its end, without choice events.
 */
const liveStateSchemaV1 = z.object({
  version: z.literal(1),
  managedSide: side,
  state: z.object({
    phase: z.enum(["HALF_TIME", "REGULATION_END"]),
    knockout: z.literal(true).optional(),
    regulationTime: minute.optional(),
    fullTime: minute.nullable(),
    home: teamSchema,
    away: teamSchema,
    events: eventsSchema,
    appearances: appearancesSchema,
    injuries: injuriesSchema,
  }),
});

const liveStateSchema = z.discriminatedUnion("version", [liveStateSchemaV2, liveStateSchemaV1]);

/** Fixture.liveState read back: the engine state of the managed club's match at a pause, and the club's side. */
export type LiveState = { managedSide: Side; state: MatchState };

export class InvalidLiveStateError extends Error {
  constructor(fixtureId: string, cause: unknown) {
    super(`Fixture ${fixtureId} has an invalid live state`, { cause });
    this.name = "InvalidLiveStateError";
  }
}

export function serializeLiveState(live: LiveState): Prisma.InputJsonValue {
  // Round trip through JSON: optional keys left undefined disappear, as they will once stored.
  const value: Prisma.InputJsonValue = JSON.parse(JSON.stringify({ version: 2, ...live }));
  return value;
}

/**
 * Fixture.liveState read back, validated: a malformed state is an error, never a match silently restarted. A state of
 * version 1 comes back with the minutes it was paused at, 45 or 90.
 */
export function parseLiveState(fixtureId: string, value: unknown): LiveState {
  const parsed = liveStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidLiveStateError(fixtureId, parsed.error);
  }
  if (parsed.data.version === 1) {
    const { managedSide, state } = parsed.data;
    return { managedSide, state: { ...state, played: state.phase === "HALF_TIME" ? HALF_TIME_MINUTE : REGULATION_MINUTES } };
  }
  return { managedSide: parsed.data.managedSide, state: parsed.data.state };
}
