import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { getChallengeBanner } from "@/src/db/challenge-view";
import { getDashboard } from "@/src/db/dashboard";
import { getSaveHeader } from "@/src/db/header";
import { getManagedLineup } from "@/src/db/lineup";
import { getDailyMissions } from "@/src/db/missions";
import { getMarketSales } from "@/src/db/market-sales";
import { coachesNation, getCoachTodos } from "@/src/db/national-view";
import { getManagedBreak } from "@/src/db/nations-view";
import { getSeasonObjectives } from "@/src/db/objectives";
import { getOpponentPreview } from "@/src/db/opponent";
import { hasPlayedMatch } from "@/src/db/saves";
import { isTournament } from "@/src/engine/tournaments";
import { InAppNotice } from "@/app/_components/in-app-notice";
import { AccountBanner } from "./_components/account-banner";
import { ChallengeCard } from "./_components/challenge-banner";
import { LastMatchCard } from "./_components/dashboard-last-match";
import { DashboardObjectives } from "./_components/dashboard-objectives";
import { DashboardPills, DashboardTiles } from "./_components/dashboard-summary";
import { DashboardTable } from "./_components/dashboard-table";
import { DashboardTodo } from "./_components/dashboard-todo";
import { DailyMissionsCard } from "./_components/daily-missions";
import { FirstActionsPanel, FirstStepTip, getFirstSteps } from "./_components/first-steps";
import { NextMatchHero, type HeroPlay } from "./_components/next-match-hero";
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
  // Not simulation code: whether the challenge is over, and the day of the player's missions, are real time.
  const now = new Date();
  const [dashboard, lineup, opponent, user, challenge, firstSteps, objectives, missions, internationalBreak, coach, coachTodos] = await Promise.all([
    getDashboard(id),
    getManagedLineup(id),
    getOpponentPreview(id),
    getCurrentUser(),
    getChallengeBanner(id, now),
    getFirstSteps(id),
    getSeasonObjectives(id),
    // The day's missions, proposed the first time they are shown; none in a challenge save.
    getDailyMissions(id, now),
    // An international break about to be played or just played: who goes, who comes back.
    getManagedBreak(id),
    // The nation the player coaches, if he does (docs/design/selections.md § 5).
    coachesNation(id),
    // A federation's offer, his list before his break or tournament, the end of his mission: lines of « À faire ».
    getCoachTodos(id),
  ]);
  // A national coach's game also goes through his breaks and his summer tournament: the hero follows it as the sidebar's
  // card does (getSaveHeader), his next match at stake first, his match waiting live (« /live/nation »), his tournament
  // keeping the season going. Anyone else's is the dashboard's own, without reading the header twice.
  const header = coach === null ? null : await getSaveHeader(id);
  const nationalNext = header?.nationalNext ?? null;
  const play: HeroPlay =
    header === null
      ? {
          liveMatch: dashboard.liveMatch,
          liveHref: "/live",
          seasonFinished: dashboard.seasonFinished,
          nextBreak: internationalBreak?.state === "upcoming",
        }
      : {
          liveMatch: header.liveMatch,
          liveHref: header.liveHref,
          seasonFinished: header.seasonFinished,
          nextBreak: header.nextBreak !== null,
        };
  // His list's line in « À faire » names his summer tournament: the competition of his next match at stake.
  const coachTournament = nationalNext !== null && isTournament(nationalNext.competition) ? nationalNext.competition : null;
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
          until the club's first match; its last match's card from then on. The day's missions right after them, across
          the page: none in a challenge save. The season's objectives under the tiles, across the page: none in a save from
          before them. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <NextMatchHero
          saveId={id}
          dashboard={dashboard}
          formation={lineup.formation}
          opponent={opponent}
          internationalBreak={internationalBreak}
          nationalNext={nationalNext}
          play={play}
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
        {missions !== null && <DailyMissionsCard saveId={id} missions={missions} className={WIDE} />}
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
          internationalBreak={internationalBreak}
          coachTodos={coachTodos}
          coachTournament={coachTournament}
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
