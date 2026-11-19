import { competitionName } from "@/src/i18n/countries";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "@/src/components/link";
import { notFound } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { ClubInitials } from "@/src/components/club-initials";
import { getSaveHeader } from "@/src/db/header";
import { playerLocale } from "@/src/i18n/player-locale";
import { seasonLabel } from "@/src/engine/world";
import { publicPath } from "@/src/i18n/public-pages";
import { formatDayDate, formatShortDate } from "@/src/lib/format";
import { tutorialReveal } from "@/src/lib/tutorial";
import { LocaleGuard } from "../../_components/locale-guard";
import { SaveBarActions } from "./_components/game-actions";
import { SaveNav } from "./_components/save-nav";
import { SectionTabs } from "./_components/section-tabs";
import { SimulationProvider } from "./_components/simulation";
import { stageLabel } from "./_lib/stage";
import { getSaveTutorial } from "./_lib/tutorial";

export const dynamic = "force-dynamic";

// The Server Actions of a save's pages play matchdays: a « Prochain match » or simulation call plays up to
// SIMULATION_MAX_MATCHDAYS dates, each of up to some fifty matches in a worldVersion 2 save.
export const maxDuration = 60;

export default async function SaveLayout({ children, params }: LayoutProps<"/saves/[id]">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [header, tutorial] = await Promise.all([getSaveHeader(id), getSaveTutorial(id)]);
  if (header === null) {
    notFound();
  }
  // The tabs the tutorial's first day hides: they come with their own moment. Not simulation code: its day is real time.
  const { hiddenTabs } = tutorialReveal(tutorial, { now: new Date(), matchesPlayed: 0 });
  const t = await getTranslations("header");
  const tWorld = await getTranslations("world");
  const tStage = await getTranslations("stage");
  const [locale, player] = await Promise.all([getLocale(), playerLocale()]);

  const season = seasonLabel(header.startYear);
  const stage = header.nextStage === null ? t("seasonFinished") : stageLabel(header.nextStage, tStage);

  return (
    <SimulationProvider saveId={header.id}>
      {/* A save is in the player's language: reached from a public page in the other one (a career created from the English
          home page by a French player, rendered by the creation's own request), it loads again in full, in theirs. */}
      <LocaleGuard locale={player} />
      <div data-save-shell className="group/shell flex min-h-full flex-1 flex-col lg:pl-64">
        {/* One header at every width: a column fixed to the left of the screen on a computer; under lg, the club's line at
            the top of the page, its navigation fixed to the foot of the screen. Under lg, the match live has the whole
            screen, with its own way out and its own bar. */}
        <header className="flex items-center gap-3 px-4 pt-3 max-lg:flex-wrap max-lg:group-has-[[data-live-page]]/shell:hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-64 lg:flex-col lg:items-stretch lg:gap-4 lg:overflow-y-auto lg:border-r lg:border-sidebar-border lg:bg-sidebar lg:p-4">
          {/* The game's mark, the only one in a save. */}
          <Link href={publicPath("home", locale)} title={t("home")} data-testid="header-home" className="flex items-center gap-2.5 px-2 max-lg:hidden">
            <Image src="/brand/late-winner-icone.svg" alt="" width={34} height={34} unoptimized />
            <span className="font-heading text-[1.375rem] leading-none">Late Winner</span>
          </Link>
          <Link
            href={publicPath("home", locale)}
            title={t("saves", { manager: header.managerName })}
            data-testid="header-club"
            className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none lg:rounded-card lg:bg-card lg:p-3"
          >
            <ClubInitials name={header.club.name} />
            {/* On two lines if need be, never cut. */}
            <span className="min-w-0 leading-tight">
              <span className="block text-[1.0625rem] font-bold wrap-break-word lg:text-[0.9375rem]">{header.club.name}</span>
              {/* The club's competition now: it changes with a promotion or a relegation. */}
              <span data-testid="header-competition" className="block text-xs text-muted-foreground">
                {competitionName(header.competitionCode, tWorld)} · {t("season", { season })}
              </span>
              <span className="block text-xs text-muted-foreground max-lg:hidden">{stage}</span>
            </span>
          </Link>
          <SaveNav saveId={header.id} />

          {/* The next match on a computer, with the game's actions but on the dashboard: nothing there once the season is
              over, whose hero has the way on. Under lg, only those, on the Match screens, under the club's line. */}
          <div
            data-testid="header-next-match"
            className="lg:mt-auto lg:space-y-2.5 lg:rounded-card lg:bg-primary lg:p-3.5 lg:empty:hidden max-lg:contents"
          >
            {header.nationalNext !== null ? (
              <div className="leading-tight max-lg:hidden" data-testid="header-national-next">
                <p className="text-xs font-bold tracking-wider text-on-blue uppercase">
                  {formatShortDate(header.nationalNext.date, locale)} · {t("nationalTeam")}
                </p>
                <p className="mt-1 text-[0.9375rem] font-bold">
                  {tWorld(`nationalities.${header.nationalNext.home}`)} – {tWorld(`nationalities.${header.nationalNext.away}`)}
                </p>
              </div>
            ) : header.nextMatch !== null && (
              <div className="leading-tight max-lg:hidden">
                <p className="text-xs font-bold tracking-wider text-on-blue uppercase">
                  {formatShortDate(header.nextMatch.date, locale)} · {t(header.nextMatch.atHome ? "venue.home" : "venue.away")}
                </p>
                <p className="mt-1 text-[0.9375rem] font-bold">{t("versus", { club: header.nextMatch.opponent })}</p>
              </div>
            )}
            <SaveBarActions
              saveId={header.id}
              seasonFinished={header.seasonFinished}
              liveMatch={header.liveMatch}
              liveHref={header.liveHref}
              worldVersion={header.worldVersion}
              nextBreak={header.nextBreak !== null}
            />
          </div>
        </header>
        {/* Under lg, room at the foot for the navigation. */}
        <main className="mx-auto w-full max-w-296 flex-1 px-4 py-6 lg:p-8 max-lg:pb-[calc(var(--save-nav-height)+1.5rem)]">
          {/* The day and what comes next, on a computer: the sidebar's column has no room for them. */}
          <div className="mb-5 flex flex-wrap gap-x-1.5 text-sm text-muted-foreground tabular-nums max-lg:hidden">
            <p data-testid="header-date" className="first-letter:uppercase">
              <time dateTime={header.currentDate.toISOString()}>{formatDayDate(header.currentDate, locale)}</time>
            </p>
            <span aria-hidden>·</span>
            <p data-testid="header-status">
              {stage} · {t(header.windowOpen ? "windowOpen" : "windowClosed")}
            </p>
          </div>
          <SectionTabs
            saveId={header.id}
            hasCup={header.hasCup}
            hasEurope={header.hasEurope}
            hasNations={header.hasNations}
            coach={header.coach !== null}
            hidden={hiddenTabs}
          />
          {children}
        </main>
      </div>
    </SimulationProvider>
  );
}
