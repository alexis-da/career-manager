import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { ensureCurrentChallenge } from "@/src/db/challenge";
import { getChallengePage } from "@/src/db/challenge-view";
import { getClubFinances, getManagerName } from "@/src/db/club";
import { getMissionStreak } from "@/src/db/missions";
import { getSeasonObjectives } from "@/src/db/objectives";
import { countOwnedSaves } from "@/src/db/saves";
import { getSeasonResults } from "@/src/db/season-results";
import { ClubChallenge } from "./_components/club-challenge";
import { ClubFinancesCard } from "./_components/club-finances";
import { ClubHonours } from "./_components/club-honours";
import { ClubObjectives } from "./_components/club-objectives";
import { ClubSettings } from "./_components/club-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("club"))("title") };
}

/**
 * The entry Club's first screen: the club's money, the week's challenge, the president's objectives for the season, its
 * latest seasons and the player's settings.
 */
export default async function ClubPage({ params }: PageProps<"/saves/[id]/club">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const user = await getCurrentUser();
  // Never here: requireOwnedSave has just found this user's save.
  if (user === null) {
    notFound();
  }
  // Not simulation code: the real week, and the real day of the player's streak.
  const now = new Date();
  const challenge = await ensureCurrentChallenge(now);
  const [t, managerName, finances, view, objectives, { seasons }, ownedSaves, streak] = await Promise.all([
    getTranslations("club"),
    getManagerName(id),
    getClubFinances(id),
    getChallengePage(challenge, { id: user.id, kind: user.kind }),
    getSeasonObjectives(id),
    getSeasonResults(id),
    countOwnedSaves(user.id),
    getMissionStreak(id, now),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 data-testid="club-title" className="font-heading text-4xl font-bold">
          {t("title")}
        </h1>
        {/* A pill on one line; a long name goes to the next ones, never past the screen. */}
        <p data-testid="club-manager" className="max-w-full rounded-[1.25rem] bg-card px-3.5 py-2.5 text-sm font-bold wrap-break-word">
          {t("manager", { manager: managerName, season: seasons.length + 1 })}
        </p>
      </div>

      {/* Each card at its own height: the finances, with their dotation, run longer than the challenge. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <ClubFinancesCard finances={finances} />
        <ClubChallenge saveId={id} view={view} />
      </div>

      {/* Across the page, between the season's money and the past seasons: none in a save from before the objectives. */}
      {objectives !== null && <ClubObjectives saveId={id} view={objectives} />}

      {/* Side by side only from xl: at 1024 px, the content's 704 px are for the card's preview and the seasons. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ClubHonours saveId={id} seasons={seasons} className="xl:col-span-2" />
        <ClubSettings user={user} ownedSaves={ownedSaves} streak={streak} />
      </div>
    </div>
  );
}
