import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { getChallengeBanner } from "@/src/db/challenge-view";
import { getDashboard } from "@/src/db/dashboard";
import { getManagedLineup } from "@/src/db/lineup";
import { getDailyMission } from "@/src/db/missions";
import { getMarketSales } from "@/src/db/market-sales";
import { getSeasonObjectives } from "@/src/db/objectives";
import { getOpponentPreview } from "@/src/db/opponent";
import { hasPlayedMatch } from "@/src/db/saves";
import { InAppNotice } from "@/app/_components/in-app-notice";
import { AccountBanner } from "./_components/account-banner";
import { ChallengeCard } from "./_components/challenge-banner";
import { LastMatchCard } from "./_components/dashboard-last-match";
import { DashboardObjectives } from "./_components/dashboard-objectives";
import { DashboardPills, DashboardTiles } from "./_components/dashboard-summary";
import { DashboardTable } from "./_components/dashboard-table";
import { DashboardTodo } from "./_components/dashboard-todo";
import { DailyMissionCard } from "./_components/daily-mission";
import { FirstActionsPanel, FirstStepTip, getFirstSteps } from "./_components/first-steps";
import { NextMatchHero } from "./_components/next-match-hero";
import { showsFirstActions, showsTip } from "./_lib/first-steps";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

/** Grid cells across the page, whatever its columns. */
const WIDE = "lg:col-span-2 xl:col-span-3";

export default async function DashboardPage({ params }: PageProps<"/saves/[id]">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const t = await getTranslations("dashboard");
  const tGame = await getTranslations("gameActions");
  // Not simulation code: whether the challenge is over, and the day of the player's mission, are real time.
  const now = new Date();
  const [dashboard, lineup, opponent, user, challenge, firstSteps, objectives, mission] = await Promise.all([
    getDashboard(id),
    getManagedLineup(id),
    getOpponentPreview(id),
    getCurrentUser(),
    getChallengeBanner(id, now),
    getFirstSteps(id),
    getSeasonObjectives(id),
    // The day's mission, proposed the first time it is shown; none in a challenge save.
    getDailyMission(id, now),
  ]);
  // Only an anonymous player's save is at risk: it lives in this browser's cookie.
  const askToSignIn = user?.kind === "ANONYMOUS" && (await hasPlayedMatch(id));
  // Until the club's first match, its first actions under the hero, in place of the last match's card: the market's
  // offers and weak spot wait for it too.
  const firstMatchPlayed = !showsFirstActions(firstSteps);
  // No offer outside a transfer window, nor before the club's first match: nothing to read.
  const sales = dashboard.windowOpen && firstMatchPlayed ? await getMarketSales(id) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-4xl max-lg:sr-only" data-testid="dashboard-title">
          {t("title")}
        </h1>
        <DashboardPills dashboard={dashboard} />
      </div>
      {/* In an app's browser only: an anonymous player's career goes to the phone's browser by its resume link, Google
          (the banner's) not signing in there. */}
      {user?.kind === "ANONYMOUS" && <InAppNotice career />}
      <AccountBanner show={askToSignIn} />
      {showsTip("simulation", firstSteps) && <FirstStepTip saveId={id} tip="simulation" />}

      {/* One column the screen's width under lg (minmax(0, 1fr)): never as wide as its widest content. The small table last
          on a phone, beside the hero from xl, in the first row's last cell whatever comes between them in the page,
          the sidebar leaving no room for it before. A new save's first actions right under the hero, at every width,
          until the club's first match; its last match's card from then on. The day's mission right after them, across
          the page: none in a challenge save. The season's objectives under the tiles, across the page: none in a save from
          before them. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <NextMatchHero
          saveId={id}
          dashboard={dashboard}
          formation={lineup.formation}
          opponent={opponent}
          className="lg:col-span-2 xl:self-stretch"
        />
        {!firstMatchPlayed && (
          <FirstActionsPanel
            saveId={id}
            seen={firstSteps.seen}
            button={tGame(dashboard.worldVersion === 2 ? "playMatch" : "playMatchday")}
            className={WIDE}
          />
        )}
        {mission !== null && <DailyMissionCard saveId={id} mission={mission} className={WIDE} />}
        <DashboardTable
          saveId={id}
          dashboard={dashboard}
          className="max-lg:order-last lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:h-full"
        />
        {showsTip("money", firstSteps) && <FirstStepTip saveId={id} tip="money" className={WIDE} />}
        <div className={WIDE}>
          <DashboardTiles dashboard={dashboard} />
        </div>
        {objectives !== null && <DashboardObjectives saveId={id} view={objectives} className={WIDE} />}
        <DashboardTodo
          saveId={id}
          dashboard={dashboard}
          lineup={lineup}
          sales={sales}
          firstMatchPlayed={firstMatchPlayed}
        />
        {firstMatchPlayed && <LastMatchCard saveId={id} dashboard={dashboard} />}
        {/* Without the last match's card, the rest of the list's row. */}
        <ChallengeCard
          view={challenge}
          saveId={id}
          className={firstMatchPlayed ? "lg:col-span-2 xl:col-span-1" : "xl:col-span-2"}
        />
      </div>
    </div>
  );
}
