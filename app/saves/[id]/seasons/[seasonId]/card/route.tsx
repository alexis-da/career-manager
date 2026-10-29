import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getSeasonResult } from "@/src/db/season-results";
import { seasonCardResponse } from "./season-card";

export const dynamic = "force-dynamic";

/**
 * The PNG card of a completed season, in the player's language: 1200 × 630, or 1080 × 1080 with ?format=square. 404 for
 * another player's save.
 */
export async function GET(request: Request, { params }: RouteContext<"/saves/[id]/seasons/[seasonId]/card">) {
  const { id, seasonId } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const result = await getSeasonResult(id, seasonId);
  if (result === null) {
    notFound();
  }
  const format = new URL(request.url).searchParams.get("format") === "square" ? "square" : "landscape";
  const [positions, world, seasons, seasonCard, locale] = await Promise.all([
    getTranslations("positions"),
    getTranslations("world"),
    getTranslations("seasons"),
    getTranslations("seasonCard"),
    getLocale(),
  ]);
  return seasonCardResponse(result.season, result.clubColors, format, { positions, world, seasons, seasonCard }, locale);
}
