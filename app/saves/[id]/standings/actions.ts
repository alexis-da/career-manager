"use server";

import * as z from "zod";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getManagedClubCalendar, type FixtureWithEvents } from "@/src/db/calendar";
import { getCupBracket, type CupBracket } from "@/src/db/cup-view";
import { fixtureWindow } from "../_lib/fixture-window";

const saveIdSchema = z.string().min(1);

export type SideCardsData = {
  fixtures: FixtureWithEvents[]; // those the calendar's card shows
  bracket: CupBracket | null;
};

/** What the cards beside the table show. */
export async function standingsSideCardsAction(saveId: string): Promise<SideCardsData> {
  const { id } = await requireOwnedSave(saveIdSchema.parse(saveId));
  const [calendar, bracket] = await Promise.all([getManagedClubCalendar(id), getCupBracket(id)]);
  return { fixtures: fixtureWindow(calendar.fixtures), bracket };
}
