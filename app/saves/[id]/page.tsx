import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { getChallengeBanner } from "@/src/db/challenge-view";
import { getDashboard } from "@/src/db/dashboard";
import { getManagedLineup } from "@/src/db/lineup";
import { getMarketSales } from "@/src/db/market-sales";
import { getOpponentPreview } from "@/src/db/opponent";
import { hasPlayedMatch } from "@/src/db/saves";
import { AccountBanner } from "./_components/account-banner";
import { ChallengeCard } from "./_components/challenge-banner";
import { LastMatchCard } from "./_components/dashboard-last-match";
import { DashboardPills, DashboardTiles } from "./_components/dashboard-summary";
import { DashboardTable } from "./_components/dashboard-table";
import { DashboardTodo } from "./_components/dashboard-todo";
import { FirstActions, FirstStepTip, getFirstSteps } from "./_components/first-steps";
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
  const [dashboard, lineup, opponent, user, challenge, firstSteps] = await Promise.all([
    getDashboard(id),
    getManagedLineup(id),
    getOpponentPreview(id),
    getCurrentUser(),
    // Not simulation code: whether the challenge is over is real time.
    getChallengeBanner(id, new Date()),
    getFirstSteps(id),
  ]);
  // Only an anonymous player's save is at risk: it lives in this browser's cookie.
  const askToSignIn = user?.kind === "ANONYMOUS" && (await hasPlayedMatch(id));
  // No offer outside a transfer window: nothing to read.
  const sales = dashboard.windowOpen ? await getMarketSales(id) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-4xl max-lg:sr-only" data-testid="dashboard-title">
          {t("title")}
        </h1>
        <DashboardPills dashboard={dashboard} />
      </div>
      <AccountBanner show={askToSignIn} />
      {showsTip("simulation", firstSteps) && <FirstStepTip saveId={id} tip="simulation" />}

      {/* One column the screen's width under lg (minmax(0, 1fr)): never as wide as its widest content. The small table last
          on a phone, beside the hero from xl, the sidebar leaving no room for it before. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <NextMatchHero
          saveId={id}
          dashboard={dashboard}
          formation={lineup.formation}
          opponent={opponent}
          className="lg:col-span-2 xl:self-stretch"
        />
        <DashboardTable saveId={id} dashboard={dashboard} className="max-lg:order-last lg:col-span-2 xl:col-span-1 xl:h-full" />
        {showsTip("money", firstSteps) && <FirstStepTip saveId={id} tip="money" className={WIDE} />}
        <div className={WIDE}>
          <DashboardTiles dashboard={dashboard} />
        </div>
        <DashboardTodo saveId={id} dashboard={dashboard} lineup={lineup} sales={sales} />
        <LastMatchCard
          saveId={id}
          dashboard={dashboard}
          firstActions={
            showsFirstActions(firstSteps) && (
              <FirstActions
                saveId={id}
                seen={firstSteps.seen}
                button={tGame(dashboard.worldVersion === 2 ? "playMatch" : "playMatchday")}
              />
            )
          }
        />
        <ChallengeCard view={challenge} className="lg:col-span-2 xl:col-span-1" />
      </div>
    </div>
  );
}
