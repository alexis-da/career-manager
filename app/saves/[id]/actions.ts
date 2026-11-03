"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getManagedClubFixtureOn } from "@/src/db/calendar";
import { advanceLiveMatch, NoMatchInProgressError, PauseMismatchError } from "@/src/db/live-match";
import { formationSchema } from "@/src/db/lineup";
import { MatchInProgressError, playNextMatchday } from "@/src/db/matchday";
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
import { seasonLabel } from "@/src/engine/world";
import type { Translator } from "@/src/i18n/translator";
import { formatDate } from "@/src/lib/format";
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

/**
 * The manager's half-time changes: formation, player per slot index, substitutions (playerKey in, playerKey out).
 * null resumes without a change, the injured players being replaced automatically as AI clubs do.
 */
const halfTimeChoiceSchema = z
  .object({
    formation: formationSchema,
    lineup: z
      .array(z.object({ slot: z.number().int().min(0).max(10), playerKey: z.string().min(1).max(100) }))
      .max(11),
    substitutions: z
      .array(z.object({ in: z.string().min(1).max(100), out: z.string().min(1).max(100) }))
      .max(MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS), // the engine checks the break's own limit
  })
  .nullable();

export type HalfTimeChoiceInput = z.input<typeof halfTimeChoiceSchema>;

/** The break a resume plays on from, as the page received it: a resume naming another pause is refused. */
const breakSchema = z.object({
  phase: z.enum(["HALF_TIME", "REGULATION_END"]),
  minute: z.number().int().min(0).max(120),
});

/** The pause between two segments a step plays on from, as the page received it. */
const stepPauseSchema = z.object({
  phase: z.enum(["IN_PLAY", "EXTRA_TIME_BREAK"]),
  minute: z.number().int().min(0).max(120),
});

export type LivePauseInput = { phase: string; minute: number };

/** A resume refused because of the match's state, as the live page says it. */
function liveRefusal(error: unknown, tLive: Translator<"liveMatch">): GameActionResult | null {
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

/**
 * Plays on the managed club's match from the break it waits at (`at`: half-time, or the end of regulation time of a
 * level cup tie), with the manager's changes: its next segment only, the replay page going on from there.
 */
export async function resumeMatch(saveId: string, at: LivePauseInput, choice: HalfTimeChoiceInput): Promise<GameActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tLive] = await Promise.all([getTranslations("actions.resume"), getTranslations("liveMatch")]);
  const pause = breakSchema.safeParse(at);
  const parsed = halfTimeChoiceSchema.safeParse(choice);
  if (!pause.success || !parsed.success) {
    return { ok: false, message: t("invalid", { max: MAX_SUBSTITUTIONS }) };
  }
  try {
    await advanceLiveMatch(
      id,
      pause.data,
      {
        changes:
          parsed.data === null
            ? null
            : { formation: parsed.data.formation, starters: parsed.data.lineup, substitutions: parsed.data.substitutions },
      },
      "segment",
    );
    revalidatePath(`/saves/${id}`, "layout");
    return { ok: true, message: t("resumed") };
  } catch (error) {
    const refusal = liveRefusal(error, tLive);
    if (refusal !== null) {
      return refusal;
    }
    throw error;
  }
}

/** The manager's decision on a choice event: an option, and for a penalty its taker. */
const decisionSchema = z
  .object({ option: z.enum(CHOICE_OPTIONS), playerKey: z.string().min(1).max(100).optional() })
  .nullable();

export type DecisionInput = z.input<typeof decisionSchema>;

/**
 * Plays on the managed club's match from the pause it waits at between two segments (`at`), with the manager's
 * decision on the choice event open there (null: the assistant's): its next segment ("segment"), or on to its next break
 * ("break", the assistant deciding the events on the way). The page then reads what was played, never further.
 */
export async function continueMatchAction(
  saveId: string,
  at: LivePauseInput,
  decision: DecisionInput,
  until: "segment" | "break",
): Promise<GameActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [t, tLive] = await Promise.all([getTranslations("actions.resume"), getTranslations("liveMatch")]);
  const pause = stepPauseSchema.safeParse(at);
  const parsed = decisionSchema.safeParse(decision);
  const mode = z.enum(["segment", "break"]).safeParse(until);
  if (!pause.success || !parsed.success || !mode.success) {
    return { ok: false, message: tLive("invalidDecision") };
  }
  try {
    await advanceLiveMatch(
      id,
      pause.data,
      { decision: parsed.data === null ? null : { option: parsed.data.option, playerId: parsed.data.playerKey } },
      mode.data,
    );
    revalidatePath(`/saves/${id}`, "layout");
    return { ok: true, message: t("resumed") };
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
