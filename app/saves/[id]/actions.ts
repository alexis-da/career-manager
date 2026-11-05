"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getManagedClubFixtureOn } from "@/src/db/calendar";
import { advanceLiveMatch, getLiveStep, NoMatchInProgressError, PauseMismatchError, type LiveStep } from "@/src/db/live-match";
import { formationSchema } from "@/src/db/lineup";
import { MatchInProgressError, playNextMatchday } from "@/src/db/matchday";
import { chooseObjective, ObjectiveChoiceError } from "@/src/db/objectives";
import { getOpponentPreview, type OpponentPreview } from "@/src/db/opponent";
import { advanceToNextSeason, SeasonNotFinishedError } from "@/src/db/season";
import {
  getSimulationSummary,
  planSimulation,
  playUntilNextMatch,
  type IntermediateBatch,
  simulateMatchdays as simulateMatchdaysOfSave,
  SIMULATION_MAX_MATCHDAYS,
  type SimulationBatch,
  type SimulationPlan,
  type SimulationSummary,
} from "@/src/db/simulation";
import { EXTRA_TIME_SUBSTITUTIONS, MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import { CHOICE_OPTIONS, ChoiceError } from "@/src/engine/choices";
import { HalfTimeChoiceError } from "@/src/engine/match";
import { OPTIONAL_OBJECTIVES, type OptionalObjective } from "@/src/engine/objectives";
import { seasonLabel } from "@/src/engine/world";
import type { Translator } from "@/src/i18n/translator";
import { formatDate } from "@/src/lib/format";
import type { ActionResult } from "./_lib/action-result";
import { halfTimeRefusalMessage } from "./_lib/live-match";
import { extraTimeNote, penaltiesNote, stageLabel, type Decision } from "./_lib/stage";

export type GameActionResult = {
  ok: boolean;
  message: string;
  // Page to open instead of showing the message: the replay of the managed club's match, or the season just closed.
  redirectTo?: string;
  announce?: boolean; // show the message as well as opening redirectTo
};

const saveIdSchema = z.string().min(1);

/** « a.p., 5-3 t.a.b. » after a score, each note after a space; empty for a match decided in 90 minutes. */
function scoreNotes(decision: Decision, t: Translator<"score">): string {
  return [extraTimeNote(decision, t), penaltiesNote(decision, t)]
    .filter((note) => note !== null)
    .map((note) => ` ${note}`)
    .join(",");
}

export async function playMatchdayAction(saveId: string): Promise<GameActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tLive, tScore, tStage, locale] = await Promise.all([
    getTranslations("actions.matchday"),
    getTranslations("liveMatch"),
    getTranslations("score"),
    getTranslations("stage"),
    getLocale(),
  ]);
  let matchday;
  try {
    // The managed club's match is played live: its first segment now, the rest step by step from the replay page.
    matchday = await playNextMatchday(id, { pauseManagedMatch: true });
  } catch (error) {
    if (error instanceof MatchInProgressError) {
      return { ok: false, message: tLive("matchInProgress") };
    }
    throw error;
  }
  if (matchday === null) {
    return { ok: false, message: t("seasonOver") };
  }
  const fixture = await getManagedClubFixtureOn(id, matchday.date);
  revalidatePath(`/saves/${id}`, "layout");

  const date = formatDate(matchday.date, locale);
  const day = fixture?.cup === true ? t("cupDay", { stage: stageLabel(fixture, tStage), date }) : t("leagueDay", { date });
  if (matchday.managed?.live === true && fixture !== null) {
    return {
      ok: true,
      message: t("live", { day, home: fixture.home.name, away: fixture.away.name }),
      redirectTo: `/saves/${id}/live?rejouer=1`,
    };
  }
  if (fixture === null || fixture.homeGoals === null || fixture.awayGoals === null) {
    return { ok: true, message: t("notPlaying", { day }) };
  }
  return {
    ok: true,
    message: t("result", {
      day,
      home: fixture.home.name,
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
      away: fixture.away.name,
      notes: scoreNotes(fixture, tScore),
    }),
    redirectTo: `/saves/${id}/live`,
  };
}

/**
 * « Prochain match », worldVersion 2: plays at most SIMULATION_MAX_MATCHDAYS dates before the managed club's next
 * match, the other competitions' intermediate matchdays. The client calls it again until done, then playMatchdayAction.
 */
export async function playUntilNextMatchAction(saveId: string): Promise<IntermediateBatch> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  return playUntilNextMatch(id);
}

export async function advanceSeasonAction(saveId: string): Promise<GameActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tLive] = await Promise.all([getTranslations("actions.season"), getTranslations("liveMatch")]);
  try {
    const transition = await advanceToNextSeason(id);
    revalidatePath(`/saves/${id}`, "layout");
    return {
      ok: true,
      message: t("started", {
        season: seasonLabel(transition.startYear),
        retired: transition.retired,
        youth: transition.preseason.youthPlayers,
      }),
      // The season just closed, with its card.
      ...(transition.completedSeasonId === null
        ? {}
        : { redirectTo: `/saves/${id}/seasons/${transition.completedSeasonId}`, announce: true }),
    };
  } catch (error) {
    if (error instanceof MatchInProgressError) {
      return { ok: false, message: tLive("matchInProgress") };
    }
    if (error instanceof SeasonNotFinishedError) {
      return { ok: false, message: t("notFinished") };
    }
    throw error;
  }
}

/** An optional objective, as the season's start screen sends it. */
const optionalObjectiveSchema = z.enum(OPTIONAL_OBJECTIVES);

/**
 * The player's choice of the season's optional objective, on the season's start screen: one of the three the board
 * proposes, once, before the managed club's first match of the season (chooseObjective). A refusal says why; the screens
 * that show the objectives are read again once it is chosen.
 */
export async function chooseObjectiveAction(saveId: string, kind: OptionalObjective): Promise<ActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tObjectives] = await Promise.all([getTranslations("actions.objective"), getTranslations("objectives")]);
  const parsed = optionalObjectiveSchema.safeParse(kind);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  try {
    await chooseObjective(id, parsed.data);
  } catch (error) {
    if (error instanceof ObjectiveChoiceError) {
      return { ok: false, message: t(`refusals.${error.reason}`) };
    }
    throw error;
  }
  // The dashboard, the Club screen and the season's start show the objectives.
  for (const screen of ["", "/club", "/season-start"]) {
    revalidatePath(`/saves/${id}${screen}`);
  }
  return { ok: true, message: t("chosen", { objective: tObjectives(`kind.${parsed.data}`) }) };
}

/**
 * The manager's changes at a pause: formation, player per slot index, substitutions (playerKey in, playerKey out).
 * null: none, the injured players being replaced automatically at half-time as AI clubs do.
 */
const halfTimeChoiceSchema = z
  .object({
    formation: formationSchema,
    lineup: z
      .array(z.object({ slot: z.number().int().min(0).max(10), playerKey: z.string().min(1).max(100) }))
      .max(11),
    substitutions: z
      .array(z.object({ in: z.string().min(1).max(100), out: z.string().min(1).max(100) }))
      .max(MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS), // the engine checks the pause's own limit and windows
  })
  .nullable();

export type HalfTimeChoiceInput = z.input<typeof halfTimeChoiceSchema>;

/** The manager's decision on a choice event: an option, and for a penalty its taker. null: the assistant's. */
const decisionSchema = z
  .object({ option: z.enum(CHOICE_OPTIONS), playerKey: z.string().min(1).max(100).optional() })
  .nullable();

export type DecisionInput = z.input<typeof decisionSchema>;

/** What the manager brings to a pause: his decision on its choice event, his changes, his instruction (null: none). */
const liveMoveSchema = z.object({
  decision: decisionSchema,
  changes: halfTimeChoiceSchema,
  instruction: z.enum(["ATTACK", "BALANCED", "DEFEND"]).nullable(),
});

export type LiveMoveInput = z.input<typeof liveMoveSchema>;

/** The pause a step plays on from, as the page received it: a step naming another pause is refused. */
const livePauseSchema = z.object({
  phase: z.enum(["IN_PLAY", "HALF_TIME", "REGULATION_END", "EXTRA_TIME_BREAK"]),
  minute: z.number().int().min(0).max(120),
});

export type LivePauseInput = { phase: string; minute: number };

/** A step refused because of the match's state, as the live page says it. */
function liveRefusal(error: unknown, tLive: Translator<"liveMatch">): LiveStepResult | null {
  if (error instanceof HalfTimeChoiceError) {
    return { ok: false, message: halfTimeRefusalMessage(error.issue, tLive) };
  }
  if (error instanceof ChoiceError) {
    return { ok: false, message: tLive("invalidDecision") };
  }
  if (error instanceof PauseMismatchError) {
    return { ok: false, message: tLive("pauseGone") };
  }
  if (error instanceof NoMatchInProgressError) {
    return { ok: false, message: tLive("noMatchInProgress") };
  }
  return null;
}

export type LiveStepResult = { ok: true; step: LiveStep } | { ok: false; message: string };

/**
 * Plays on the managed club's match from the pause it waits at (`at`), with what the manager brings there (his decision
 * on its choice event, his changes, his instruction): its next segment ("segment", the page watching), on to the next
 * pause he must act at ("pause", without motion), or on to its next break ("break", the assistant deciding the choice
 * events on the way). One call a step: it returns what the page shows, never further than the pause reached, and the
 * page is not read again. Once the match is over, the save's screens change: they are read again on the way out.
 */
export async function playLiveStepAction(
  saveId: string,
  at: LivePauseInput,
  move: LiveMoveInput,
  until: "segment" | "pause" | "break",
): Promise<LiveStepResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tLive] = await Promise.all([getTranslations("actions.resume"), getTranslations("liveMatch")]);
  const pause = livePauseSchema.safeParse(at);
  const parsed = liveMoveSchema.safeParse(move);
  const mode = z.enum(["segment", "pause", "break"]).safeParse(until);
  if (!pause.success || !mode.success) {
    return { ok: false, message: tLive("pauseGone") };
  }
  if (!parsed.success) {
    return { ok: false, message: t("invalid", { max: MAX_SUBSTITUTIONS }) };
  }
  const { decision, changes, instruction } = parsed.data;
  try {
    const moved = await advanceLiveMatch(
      id,
      pause.data,
      {
        decision: decision === null ? null : { option: decision.option, playerId: decision.playerKey },
        changes: changes === null ? null : { formation: changes.formation, starters: changes.lineup, substitutions: changes.substitutions },
        instruction,
      },
      mode.data,
    );
    const step = await getLiveStep(id, moved);
    if (moved.pause === null) {
      revalidatePath(`/saves/${id}`, "layout");
    }
    return { ok: true, step };
  } catch (error) {
    const refusal = liveRefusal(error, tLive);
    if (refusal !== null) {
      return refusal;
    }
    throw error;
  }
}

/** An in-game day sent by the client, « 2026-08-31 », read as the UTC midnight the game stores. */
const daySchema = z.iso.date().transform((day) => new Date(`${day}T00:00:00.000Z`));

const simulationTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("next-match") }),
  z.object({ kind: z.literal("month-end") }),
  z.object({ kind: z.literal("window-close") }),
  z.object({ kind: z.literal("season-end") }),
  z.object({ kind: z.literal("date"), date: daySchema }),
]);

export type SimulationTargetInput = z.input<typeof simulationTargetSchema>;

/** Where a simulation toward a target stops and how many matchdays it plays, before playing anything. */
export async function planSimulationAction(saveId: string, target: SimulationTargetInput): Promise<SimulationPlan> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  return planSimulation(id, simulationTargetSchema.parse(target));
}

/**
 * Plays at most maxMatchdays matchdays dated untilDate (« 2026-08-31 ») or earlier, never past the season's end.
 * The client calls it again until done, so each call stays short.
 */
export async function simulateMatchdays(
  saveId: string,
  untilDate: string,
  maxMatchdays: number = SIMULATION_MAX_MATCHDAYS,
): Promise<SimulationBatch> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  return simulateMatchdaysOfSave(
    id,
    daySchema.parse(untilDate),
    z.number().int().min(1).max(SIMULATION_MAX_MATCHDAYS).parse(maxMatchdays),
  );
}

/** The managed club's rank, injuries and ended contracts since fromDate (« 2026-08-15 »), the date before a simulation. */
export async function simulationSummaryAction(saveId: string, fromDate: string): Promise<SimulationSummary> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const summary = await getSimulationSummary(id, daySchema.parse(fromDate));
  // The simulation is over: every page of the save shows the new date, results and table.
  revalidatePath(`/saves/${id}`, "layout");
  return summary;
}

/** The opponent of an unplayed fixture of the managed club, for the calendar's « Voir l'adversaire » panel. */
export async function opponentPreviewAction(saveId: string, fixtureId: string): Promise<OpponentPreview | null> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  return getOpponentPreview(id, z.string().min(1).parse(fixtureId));
}
