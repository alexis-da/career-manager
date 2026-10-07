"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getManagedClubFixtureOn } from "@/src/db/calendar";
import { playNextMatchday } from "@/src/db/matchday";
import { getOpponentPreview, type OpponentPreview } from "@/src/db/opponent";
import { advanceToNextSeason, SeasonNotFinishedError } from "@/src/db/season";
import {
  getSimulationSummary,
  planSimulation,
  simulateMatchdays as simulateMatchdaysOfSave,
  SIMULATION_MAX_MATCHDAYS,
  type SimulationBatch,
  type SimulationPlan,
  type SimulationSummary,
} from "@/src/db/simulation";
import { seasonLabel } from "@/src/engine/world";
import { formatDate } from "@/src/lib/format";

export type GameActionResult = {
  ok: boolean;
  message: string;
  // Page to open instead of showing the message: the replay of the managed club's match.
  redirectTo?: string;
};

const saveIdSchema = z.string().min(1);

export async function playMatchdayAction(saveId: string): Promise<GameActionResult> {
  const id = saveIdSchema.parse(saveId);
  const matchday = await playNextMatchday(id);
  if (matchday === null) {
    return { ok: false, message: "Tous les matchs de la saison sont joués." };
  }
  const fixture = await getManagedClubFixtureOn(id, matchday.date);
  revalidatePath(`/saves/${id}`, "layout");

  const day = `Journée du ${formatDate(matchday.date)}`;
  if (fixture === null || fixture.homeGoals === null || fixture.awayGoals === null) {
    return { ok: true, message: `${day} : votre club ne jouait pas.` };
  }
  return {
    ok: true,
    message: `${day} : ${fixture.home.name} ${fixture.homeGoals} – ${fixture.awayGoals} ${fixture.away.name}`,
    redirectTo: `/saves/${id}/live`,
  };
}

export async function advanceSeasonAction(saveId: string): Promise<GameActionResult> {
  const id = saveIdSchema.parse(saveId);
  try {
    const transition = await advanceToNextSeason(id);
    revalidatePath(`/saves/${id}`, "layout");
    const season = seasonLabel(transition.startYear);
    return {
      ok: true,
      message: `Saison ${season} lancée : ${transition.retired} retraites, ${transition.preseason.youthPlayers} jeunes arrivés.`,
    };
  } catch (error) {
    if (error instanceof SeasonNotFinishedError) {
      return { ok: false, message: "La saison n'est pas terminée." };
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
  return planSimulation(saveIdSchema.parse(saveId), simulationTargetSchema.parse(target));
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
  return simulateMatchdaysOfSave(
    saveIdSchema.parse(saveId),
    daySchema.parse(untilDate),
    z.number().int().min(1).max(SIMULATION_MAX_MATCHDAYS).parse(maxMatchdays),
  );
}

/** The managed club's rank, injuries and ended contracts since fromDate (« 2026-08-15 »), the date before a simulation. */
export async function simulationSummaryAction(saveId: string, fromDate: string): Promise<SimulationSummary> {
  const id = saveIdSchema.parse(saveId);
  const summary = await getSimulationSummary(id, daySchema.parse(fromDate));
  // The simulation is over: every page of the save shows the new date, results and table.
  revalidatePath(`/saves/${id}`, "layout");
  return summary;
}

/** The opponent of an unplayed fixture of the managed club, for the calendar's « Voir l'adversaire » panel. */
export async function opponentPreviewAction(saveId: string, fixtureId: string): Promise<OpponentPreview | null> {
  return getOpponentPreview(saveIdSchema.parse(saveId), z.string().min(1).parse(fixtureId));
}
