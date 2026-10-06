"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getManagedClubFixtureOn } from "@/src/db/calendar";
import { playNextMatchday } from "@/src/db/matchday";
import { advanceToNextSeason, SeasonNotFinishedError } from "@/src/db/season";
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
