"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getManagedClubFixtureOn } from "@/src/db/calendar";
import { NoMatchInProgressError, resumeLiveMatch } from "@/src/db/live-match";
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
import { MAX_SUBSTITUTIONS } from "@/src/engine/balance";
import { HalfTimeChoiceError } from "@/src/engine/match";
import { seasonLabel } from "@/src/engine/world";
import { formatDate } from "@/src/lib/format";
import { halfTimeRefusalMessage, MATCH_IN_PROGRESS_MESSAGE, NO_MATCH_IN_PROGRESS_MESSAGE } from "./_lib/live-match";

export type GameActionResult = {
  ok: boolean;
  message: string;
  // Page to open instead of showing the message: the replay of the managed club's match, or the season just closed.
  redirectTo?: string;
  announce?: boolean; // show the message as well as opening redirectTo
};

const saveIdSchema = z.string().min(1);

export async function playMatchdayAction(saveId: string): Promise<GameActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  let matchday;
  try {
    // The managed club's match stops at half-time, for the manager's changes on the replay page.
    matchday = await playNextMatchday(id, { pauseManagedMatch: true });
  } catch (error) {
    if (error instanceof MatchInProgressError) {
      return { ok: false, message: MATCH_IN_PROGRESS_MESSAGE };
    }
    throw error;
  }
  if (matchday === null) {
    return { ok: false, message: "Tous les matchs de la saison sont joués." };
  }
  const fixture = await getManagedClubFixtureOn(id, matchday.date);
  revalidatePath(`/saves/${id}`, "layout");

  const day = `Journée du ${formatDate(matchday.date)}`;
  if (matchday.managed?.halfTime === true && fixture !== null) {
    return {
      ok: true,
      message: `${day} : mi-temps, ${fixture.home.name} ${fixture.homeHalfTimeGoals ?? 0} – ${fixture.awayHalfTimeGoals ?? 0} ${fixture.away.name}`,
      redirectTo: `/saves/${id}/live?rejouer=1`,
    };
  }
  if (fixture === null || fixture.homeGoals === null || fixture.awayGoals === null) {
    return { ok: true, message: `${day} : votre club ne jouait pas.` };
  }
  return {
    ok: true,
    message: `${day} : ${fixture.home.name} ${fixture.homeGoals} – ${fixture.awayGoals} ${fixture.away.name}`,
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
  try {
    const transition = await advanceToNextSeason(id);
    revalidatePath(`/saves/${id}`, "layout");
    const season = seasonLabel(transition.startYear);
    return {
      ok: true,
      message: `Saison ${season} lancée : ${transition.retired} retraites, ${transition.preseason.youthPlayers} jeunes arrivés.`,
      // The season just closed, with its card.
      ...(transition.completedSeasonId === null
        ? {}
        : { redirectTo: `/saves/${id}/seasons/${transition.completedSeasonId}`, announce: true }),
    };
  } catch (error) {
    if (error instanceof MatchInProgressError) {
      return { ok: false, message: MATCH_IN_PROGRESS_MESSAGE };
    }
    if (error instanceof SeasonNotFinishedError) {
      return { ok: false, message: "La saison n'est pas terminée." };
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
      .max(MAX_SUBSTITUTIONS),
  })
  .nullable();

export type HalfTimeChoiceInput = z.input<typeof halfTimeChoiceSchema>;

/** Plays the second half of the managed club's match paused at half-time, with the manager's changes. */
export async function resumeMatch(saveId: string, choice: HalfTimeChoiceInput): Promise<GameActionResult> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const parsed = halfTimeChoiceSchema.safeParse(choice);
  if (!parsed.success) {
    return { ok: false, message: `Changements invalides : ${MAX_SUBSTITUTIONS} remplacements au maximum, 11 postes.` };
  }
  try {
    const { result } = await resumeLiveMatch(
      id,
      parsed.data === null
        ? null
        : { formation: parsed.data.formation, starters: parsed.data.lineup, substitutions: parsed.data.substitutions },
    );
    revalidatePath(`/saves/${id}`, "layout");
    return { ok: true, message: `Score final : ${result.homeGoals} – ${result.awayGoals}`, redirectTo: `/saves/${id}/live?reprise=1` };
  } catch (error) {
    if (error instanceof HalfTimeChoiceError) {
      return { ok: false, message: halfTimeRefusalMessage(error.issue) };
    }
    if (error instanceof NoMatchInProgressError) {
      return { ok: false, message: NO_MATCH_IN_PROGRESS_MESSAGE };
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
