import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getClosedObjectives } from "@/src/db/objectives";
import { ownedCardDress } from "@/src/db/rewards";
import { getSeasonResult } from "@/src/db/season-results";
import { isLocale, type Locale } from "@/src/i18n/locale";
import { translatorFor } from "@/src/i18n/messages-translator";
import { frameStyleOf, type CosmeticId } from "@/src/lib/cosmetics";
import { SEASON_CARD_VERSION } from "../../../_lib/seasons";
import { seasonCardResponse, type CardFormat } from "./season-card";

export const dynamic = "force-dynamic";

/** How long the server keeps a card it drew: a completed season's card never changes (SEASON_CARD_VERSION aside). */
const CARD_CACHE_SECONDS = 30 * 24 * 60 * 60;

/**
 * A completed season's card as PNG bytes (base64), drawn once for its save, season, format and language, then kept by
 * the server across requests and instances (Next's data cache): drawing one is some 440 ms of CPU (satori and resvg).
 * null when the season has no result. Reads no request data: its language, frame and title come from its address.
 */
const drawCard = unstable_cache(
  async (
    saveId: string,
    seasonId: string,
    format: CardFormat,
    locale: Locale,
    frame: CosmeticId,
    title: CosmeticId | null,
  ): Promise<string | null> => {
    const [result, objectives] = await Promise.all([getSeasonResult(saveId, seasonId), getClosedObjectives(saveId, seasonId)]);
    if (result === null) {
      return null;
    }
    const response = await seasonCardResponse(
      result.season,
      result.clubColors,
      format,
      {
        positions: translatorFor(locale, "positions"),
        world: translatorFor(locale, "world"),
        seasons: translatorFor(locale, "seasons"),
        seasonCard: translatorFor(locale, "seasonCard"),
        objectives: translatorFor(locale, "objectives"),
        stage: translatorFor(locale, "stage"),
      },
      locale,
      objectives,
      { frame: frameStyleOf(frame), title: title === null ? null : translatorFor(locale, "rewards")(`cosmetics.${title}.name`) },
    );
    return Buffer.from(await response.arrayBuffer()).toString("base64");
  },
  ["season-card", String(SEASON_CARD_VERSION)],
  { revalidate: CARD_CACHE_SECONDS },
);

/**
 * The PNG card of a completed season: 1200 × 630, or 1080 × 1080 with ?format=square, in the language of ?lang= (the
 * player's without it), in the frame of ?frame= and with the title of ?title= when the save's owner has them (missions v2). 404 for another player's save, checked before any cache. An address with its language (the
 * pages build them, seasonCardPath) always gives the same image: the browser keeps it a year, privately (never a shared
 * cache: the card opens to its owner only), and the server draws it once (drawCard).
 */
export async function GET(request: Request, { params }: RouteContext<"/saves/[id]/seasons/[seasonId]/card">) {
  const { id, seasonId } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  const { ownerId } = await requireOwnedSave(id);
  const query = new URL(request.url).searchParams;
  const format: CardFormat = query.get("format") === "square" ? "square" : "landscape";
  const lang = query.get("lang");
  const locale = isLocale(lang) ? lang : await getLocale();
  const dress = await ownedCardDress(ownerId, query.get("frame"), query.get("title"));
  const png = await drawCard(id, seasonId, format, isLocale(locale) ? locale : "en", dress.frame, dress.title);
  if (png === null) {
    notFound();
  }
  return new Response(Buffer.from(png, "base64"), {
    headers: {
      "Content-Type": "image/png",
      // Without its language in the address, the card follows the player's: the browser asks again each time.
      "Cache-Control": isLocale(lang) ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
}
