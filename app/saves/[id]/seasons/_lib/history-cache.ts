import { unstable_cache } from "next/cache";
import { careerHistoryView, lastCompletedYear, readCompletedCareer, readLiveCareer, type CareerHistoryView, type CompletedCareer } from "@/src/db/career-history";
import { prisma } from "@/src/db/client";

/** What the cached part holds: bumped when it changes, so that no server keeps an old one. */
export const HISTORY_VERSION = 1;

/** How long the server keeps a career's completed part: it never changes once its seasons are over. */
const CACHE_SECONDS = 30 * 24 * 60 * 60;

/**
 * A career's completed seasons (readCompletedCareer), read once for its last completed year and kept by the server
 * across requests and instances (Next's data cache, as the season card): most of a display's reading, an archive's
 * decoding included (docs/design/historique.md § 8). JSON throughout. Reads no request data.
 */
const cachedCompletedCareer = unstable_cache(
  // The year is the key: a season completed, a new read.
  async (saveId: string, lastYear: number | null): Promise<CompletedCareer> => {
    void lastYear;
    return readCompletedCareer(prisma, saveId);
  },
  ["career-history", String(HISTORY_VERSION)],
  { revalidate: CACHE_SECONDS },
);

/** The completed part of a save's career, from the server's cache. Its owner checked before (requireOwnedSave). */
export async function completedCareer(saveId: string): Promise<CompletedCareer> {
  return cachedCompletedCareer(saveId, await lastCompletedYear(prisma, saveId));
}

/** The managed club's history: its completed part from the server's cache, what moves with the season read now. */
export async function getCareerHistoryCached(saveId: string): Promise<CareerHistoryView> {
  const completed = await completedCareer(saveId);
  return careerHistoryView(completed, await readLiveCareer(prisma, saveId, completed.matches));
}
