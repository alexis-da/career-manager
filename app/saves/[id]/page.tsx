import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { after } from "next/server";
import { getCurrentUser, requireOwnedSave } from "@/src/auth/current-user";
import { getAssistantSettings } from "@/src/db/assistant-settings";
import { getChallengeBanner } from "@/src/db/challenge-view";
import { prisma } from "@/src/db/client";
import { getManagerName } from "@/src/db/club";
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
import { recordTutorialEvents } from "@/src/db/tutorial";
import { isTournament } from "@/src/engine/tournaments";
import { formatWeekdayDayMonth } from "@/src/lib/format";
import { dashboardStep, dayOnePlace, firstDayCalm, pendingWrites, tutorialReveal } from "@/src/lib/tutorial";
import { InAppNotice } from "@/app/_components/in-app-notice";
import { AccountBanner } from "./_components/account-banner";
import { AssistantNotice } from "./_components/assistant-notice";
import { ChallengeCard } from "./_components/challenge-banner";
import { LastMatchCard } from "./_components/dashboard-last-match";
import { DashboardObjectives } from "./_components/dashboard-objectives";
import { DashboardPills, DashboardTiles } from "./_components/dashboard-summary";
import { DashboardTable } from "./_components/dashboard-table";
import { DashboardTodo } from "./_components/dashboard-todo";
import { DailyMissionsCard } from "./_components/daily-missions";
import { FirstActionsPanel, FirstStepTip, getFirstSteps } from "./_components/first-steps";
import { NextMatchHero, type HeroPlay } from "./_components/next-match-hero";
import { dashboardBubbleOf, laterContextOf } from "./_lib/dashboard-tutorial";
import { showsFirstActions, showsTip } from "./_lib/first-steps";
import { getSaveTutorial } from "./_lib/tutorial";
import { TutorialBubble } from "./_components/tutorial/tutorial-bubble";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

/** Grid cells across the page, whatever its columns. */
const WIDE = "lg:col-span-2 xl:col-span-3";

/** What the tutorial's welcome rings: the hero's « Jouer le match ». */
const WELCOME_TARGET = '[data-testid="dashboard-next-match"] [data-testid="next-match"]';

export default async function DashboardPage({ params }: PageProps<"/saves/[id]">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  const { ownerId } = await requireOwnedSave(id);
  const t = await getTranslations("dashboard");
  const tGame = await getTranslations("gameActions");
  const [tTutorial, tNav, tHero, tTodo, tPositions, tWorld, tLineup, locale] = await Promise.all([
    getTranslations("tutorial"),
    getTranslations("nav"),
    getTranslations("dashboardHero"),
    getTranslations("dashboardTodo"),
    getTranslations("positions"),
    getTranslations("world"),
    getTranslations("lineup"),
    getLocale(),
  ]);
  // Not simulation code: whether the challenge is over, the day of the player's missions and of his tutorial are real time.
  const now = new Date();
  // The first career's tutorial (docs/design/tutoriel.md): the calm of its first day reads neither missions nor objectives.
  const tutorial = await getSaveTutorial(id);
  const calm = tutorial !== null && firstDayCalm(tutorial, now);
  const [dashboard, lineup, opponent, user, challenge, firstSteps, objectives, missions, internationalBreak, coach, coachTodos, assistant] = await Promise.all([
    getDashboard(id),
    getManagedLineup(id),
    getOpponentPreview(id),
    getCurrentUser(),
    getChallengeBanner(id, now),
    getFirstSteps(id),
    calm ? null : getSeasonObjectives(id),
    // The day's missions, proposed the first time they are shown; none in a challenge save, nor drawn on the first day.
    calm ? null : getDailyMissions(id, now),
    // An international break about to be played or just played: who goes, who comes back.
    getManagedBreak(id),
    // The nation the player coaches, if he does (docs/design/selections.md § 5).
    coachesNation(id),
    // A federation's offer, his list before his break or tournament, the end of his mission: lines of « À faire ».
    getCoachTodos(id),
    // What the career leaves to the assistant, and whether it was told (docs/design/simplification.md § 7).
    getAssistantSettings(id),
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
  // Until the club's first match, its last match's card waits; a challenge save has its first actions under the hero in
  // its place, a career its tutorial's welcome. The market's offers and weak spot wait for that match too.
  const firstMatchPlayed = !showsFirstActions(firstSteps);
  // The tutorial's step of the dashboard (docs/design/tutoriel.md): the welcome until the first match; from the second
  // day, the following days' steps (scenario 2), from what the page has read; what it hides until then (everything shows
  // without one).
  const reads = { dashboard, lineup, objectives, internationalBreak };
  const context = { now, matchesPlayed: firstSteps.matches, later: tutorial === null ? undefined : laterContextOf(reads) };
  const step = tutorial === null ? null : dashboardStep(tutorial, context);
  const reveal = tutorialReveal(tutorial, { ...context, step });
  const welcome = step === "welcome" ? await welcomeText(id, dashboard.nextMatch, tTutorial) : null;
  const bubble =
    step === null || step === "welcome"
      ? null
      : dashboardBubbleOf(
          step,
          reads,
          { tutorial: tTutorial, nav: tNav, game: tGame, hero: tHero, todo: tTodo, positions: tPositions, world: tWorld, lineup: tLineup },
          locale,
        );
  // What the tutorial closes by itself (a step shown twice, the welcome of a match played another way, a break gone…), once
  // the page is sent: never in the page's own time.
  if (tutorial !== null && ownerId !== null) {
    const pending = pendingWrites(tutorial, context, { away: true });
    if (pending.closures.length > 0 || pending.ending !== null) {
      after(() => recordTutorialEvents(prisma, { userId: ownerId, saveId: id, events: [], away: true, ...context }));
    }
  }
  // A following day's bubble, by its target from lg: under the hero, or just above the objectives it speaks of.
  const laterBubble =
    bubble === null || step === null ? null : (
      <TutorialBubble
        saveId={id}
        step={step}
        text={bubble.text}
        place={null}
        target={bubble.target}
        gotIt={bubble.gotIt}
        doneOn={bubble.doneOn}
        className={WIDE}
      />
    );
  // No offer outside a transfer window, nor before the club's first match, nor on the tutorial's first day: nothing to read.
  const market = firstMatchPlayed && reveal.market;
  const sales = dashboard.windowOpen && market ? await getMarketSales(id) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-4xl max-lg:sr-only" data-testid="dashboard-title">
          {t("title")}
        </h1>
        {reveal.pills && <DashboardPills dashboard={dashboard} />}
      </div>
      {/* In an app's browser only: an anonymous player's career goes to the phone's browser by its resume link, Google
          (the banner's) not signing in there. */}
      {user?.kind === "ANONYMOUS" && <InAppNotice career />}
      <AccountBanner show={askToSignIn} />
      {reveal.tips && showsTip("simulation", firstSteps) && <FirstStepTip saveId={id} tip="simulation" />}

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
          byAssistant={lineup.byAssistant}
          opponent={opponent}
          internationalBreak={internationalBreak}
          nationalNext={nationalNext}
          play={play}
          className="lg:col-span-2 xl:self-stretch"
        />
        {/* The tutorial's welcome, by the hero's « Jouer le match »: fixed above the navigation under lg. */}
        {welcome !== null && tutorial !== null && (
          <TutorialBubble
            saveId={id}
            step="welcome"
            text={welcome}
            place={dayOnePlace(tutorial, "welcome")}
            target={WELCOME_TARGET}
            className="lg:col-span-2 lg:max-w-2xl"
          />
        )}
        {bubble?.place === "hero" && laterBubble}
        {/* Once in a career from before the simplification, right under the hero: what the assistant now does in it. */}
        {assistant.noticeOpen && <AssistantNotice saveId={id} settings={assistant} className={WIDE} />}
        {/* A challenge save's first actions: a career has the tutorial, or a player who knows the game. */}
        {!firstMatchPlayed && challenge !== null && (
          <FirstActionsPanel
            saveId={id}
            seen={firstSteps.seen}
            button={tGame(dashboard.worldVersion === 2 ? "playMatch" : "playMatchday")}
            className={WIDE}
          />
        )}
        {reveal.missions && missions !== null && <DailyMissionsCard saveId={id} missions={missions} className={WIDE} />}
        {reveal.summary && (
          <DashboardTable
            saveId={id}
            dashboard={dashboard}
            className="max-lg:order-last lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:h-full"
          />
        )}
        {reveal.tips && showsTip("money", firstSteps) && <FirstStepTip saveId={id} tip="money" className={WIDE} />}
        {reveal.summary && (
          <div className={WIDE}>
            <DashboardTiles dashboard={dashboard} />
          </div>
        )}
        {bubble?.place === "objectives" && laterBubble}
        {reveal.objectives && objectives !== null && <DashboardObjectives saveId={id} view={objectives} className={WIDE} />}
        {reveal.todo && (
          <DashboardTodo
            saveId={id}
            dashboard={dashboard}
            lineup={lineup}
            byAssistant={lineup.byAssistant}
            sales={sales}
            firstMatchPlayed={market}
            internationalBreak={internationalBreak}
            coachTodos={coachTodos}
            coachTournament={coachTournament}
          />
        )}
        {firstMatchPlayed && <LastMatchCard saveId={id} dashboard={dashboard} />}
        {/* Without the last match's card, the rest of the list's row. */}
        {reveal.challenge && (
          <ChallengeCard
            view={challenge}
            saveId={id}
            className={firstMatchPlayed ? "lg:col-span-2 xl:col-span-1" : "xl:col-span-2"}
          />
        )}
      </div>
    </div>
  );
}

/** The tutorial's welcome: the manager by his name, his first match by its day and its opponent. Read only when it shows. */
async function welcomeText(
  saveId: string,
  nextMatch: Awaited<ReturnType<typeof getDashboard>>["nextMatch"],
  t: Awaited<ReturnType<typeof getTranslations<"tutorial">>>,
): Promise<string | null> {
  if (nextMatch === null) {
    return null;
  }
  const [manager, locale] = await Promise.all([getManagerName(saveId), getLocale()]);
  const opponent = nextMatch.fixture.home.isManaged ? nextMatch.away.name : nextMatch.home.name;
  return t("steps.welcome", { manager, date: formatWeekdayDayMonth(nextMatch.fixture.scheduledAt, locale), opponent });
}
