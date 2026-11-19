import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { careerHistoryView, readLiveCareer } from "@/src/db/career-history";
import { prisma } from "@/src/db/client";
import { getCoachHistory } from "@/src/db/national-view";
import { ownedCardDress } from "@/src/db/rewards";
import { isLocale, type Locale } from "@/src/i18n/locale";
import { translatorFor } from "@/src/i18n/messages-translator";
import { frameStyleOf, type CosmeticId } from "@/src/lib/cosmetics";
import type { CardFormat } from "../[seasonId]/card/season-card";
import { CAREER_CARD_VERSION } from "../_lib/career";
import { completedCareer } from "../_lib/history-cache";
import { careerCardData, careerCardResponse } from "./career-card";

export const dynamic = "force-dynamic";

/** How long the server keeps a career card it drew: the career as a completed season left it never changes. */
const CARD_CACHE_SECONDS = 30 * 24 * 60 * 60;

/**
 * A career's card as PNG bytes (base64), drawn once for its save, its count of completed seasons, its format and
 * language, its frame and title, then kept by the server (Next's data cache): 155 ms of CPU square, 95 ms landscape.
 * The completed seasons only: the career as its last completed season left it, the summer tournaments that ended them
 * included. null in a challenge save.
 */
const drawCard = unstable_cache(
  async (saveId: string, completedSeasons: number, format: CardFormat, locale: Locale, frame: CosmeticId, title: CosmeticId | null): Promise<string | null> => {
    void completedSeasons; // the key: the route checked it is the career's count
    const completed = await completedCareer(saveId);
    const live = await readLiveCareer(prisma, saveId, completed.matches);
    if (live.challenge) {
      return null;
    }
    const history = careerHistoryView(completed, { ...live, current: null, matches: [], lines: [], transfers: [] });
    // His titles as a national coach: those of the completed seasons only (careerCardData), the image never changes.
    const coach = await getCoachHistory(saveId);
    const response = await careerCardResponse(careerCardData(history, coach), live.clubColors, format, translatorFor(locale, "careerCard"), locale, {
      frame: frameStyleOf(frame),
      title: title === null ? null : translatorFor(locale, "rewards")(`cosmetics.${title}.name`),
    });
    return Buffer.from(await response.arrayBuffer()).toString("base64");
  },
  ["career-card", String(CAREER_CARD_VERSION)],
  { revalidate: CARD_CACHE_SECONDS },
);

/**
 * The PNG card of a career (docs/design/historique.md § 5): 1200 × 630, or 1080 × 1080 with ?format=square, in the
 * language of ?lang=, for ?n= completed seasons (the career's count, else 404: an address always gives the same image),
 * in the frame of ?frame= and with the title of ?title= when the save's owner has them. 404 for another player's save,
 * checked before any cache, before a completed season, and in a challenge save.
 */
export async function GET(request: Request, { params }: RouteContext<"/saves/[id]/seasons/card">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  const { ownerId } = await requireOwnedSave(id);
  const query = new URL(request.url).searchParams;
  const format: CardFormat = query.get("format") === "square" ? "square" : "landscape";
  const lang = query.get("lang");
  const locale = isLocale(lang) ? lang : await getLocale();
  const completedSeasons = Number(query.get("n"));
  const { seasons } = await completedCareer(id);
  if (!Number.isInteger(completedSeasons) || completedSeasons < 1 || completedSeasons !== seasons.length) {
    notFound();
  }
  const dress = await ownedCardDress(ownerId, query.get("frame"), query.get("title"));
  const png = await drawCard(id, completedSeasons, format, isLocale(locale) ? locale : "en", dress.frame, dress.title);
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
