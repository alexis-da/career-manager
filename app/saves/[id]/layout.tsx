import { competitionName } from "@/src/i18n/countries";
import { getLocale, getTranslations } from "next-intl/server";
import { TrophyIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { requireOwnedSave } from "@/src/auth/current-user";
import { ClubInitials } from "@/src/components/club-initials";
import { getSaveHeader } from "@/src/db/header";
import { seasonLabel } from "@/src/engine/world";
import { formatDayDate, formatShortDate } from "@/src/lib/format";
import { GameActions } from "./_components/game-actions";
import { SaveNav } from "./_components/save-nav";
import { SectionTabs } from "./_components/section-tabs";
import { SimulationProvider } from "./_components/simulation";
import { stageLabel } from "./_lib/stage";

export const dynamic = "force-dynamic";

// The Server Actions of a save's pages play matchdays: a « Prochain match » or simulation call plays up to
// SIMULATION_MAX_MATCHDAYS dates, each of up to some fifty matches in a worldVersion 2 save.
export const maxDuration = 60;

export default async function SaveLayout({ children, params }: LayoutProps<"/saves/[id]">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const header = await getSaveHeader(id);
  if (header === null) {
    notFound();
  }
  const t = await getTranslations("header");
  const tWorld = await getTranslations("world");
  const tStage = await getTranslations("stage");
  const locale = await getLocale();

  const season = seasonLabel(header.startYear);
  const stage = header.nextStage === null ? t("seasonFinished") : stageLabel(header.nextStage, tStage);

  return (
    <SimulationProvider saveId={header.id}>
      <div data-save-shell className="flex min-h-full flex-1 flex-col lg:pl-64">
        {/* One header at every width: a column fixed to the left of the screen on a computer; under lg, the club's line at
            the top of the page, its navigation and actions fixed to the foot of the screen. */}
        <header className="flex items-center gap-3 px-4 pt-3 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-64 lg:flex-col lg:items-stretch lg:gap-4 lg:overflow-y-auto lg:border-r lg:border-sidebar-border lg:bg-sidebar lg:p-4">
          {/* The game's mark, the only one in a save. */}
          <Link href="/" title={t("home")} data-testid="header-home" className="flex items-center gap-2.5 px-2 max-lg:hidden">
            <Image src="/brand/late-winner-icone.svg" alt="" width={34} height={34} unoptimized />
            <span className="font-heading text-[1.375rem] leading-none">Late Winner</span>
          </Link>
          <Link
            href="/"
            title={t("saves", { manager: header.managerName })}
            data-testid="header-club"
            className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none lg:rounded-2xl lg:bg-card lg:p-3"
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

          {/* The next match on a computer, with the game's actions. Under lg, those alone, in a bar above the navigation,
              under the thumb; no bar at all when there is no action, on the live page of a paused match. */}
          <div className="lg:mt-auto lg:space-y-2.5 lg:rounded-2xl lg:bg-primary lg:p-3.5 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-(--save-nav-height) max-lg:z-40 max-lg:flex max-lg:border-t max-lg:border-sidebar-border max-lg:bg-sidebar max-lg:px-4 max-lg:py-2 max-lg:*:flex-1 max-lg:[&:not(:has(a,button))]:hidden">
            {header.nextMatch !== null && (
              <div className="leading-tight max-lg:hidden">
                <p className="text-xs font-bold tracking-wider text-on-blue uppercase">
                  {formatShortDate(header.nextMatch.date, locale)} · {t(header.nextMatch.atHome ? "venue.home" : "venue.away")}
                </p>
                <p className="mt-1 text-[0.9375rem] font-bold">{t("versus", { club: header.nextMatch.opponent })}</p>
              </div>
            )}
            <GameActions
              saveId={header.id}
              seasonFinished={header.seasonFinished}
              liveMatch={header.liveMatch}
              worldVersion={header.worldVersion}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:justify-between lg:px-1">
            {/* Not on a phone, where the club's name needs the room: the home page's foot has it. */}
            <LanguageSwitcher className="max-sm:hidden" />
            {/* The weekly challenge, outside the save, among neither its entries nor their tabs. */}
            <Link
              href="/challenge"
              title={t("challenge")}
              data-testid="header-challenge"
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-sm:size-11"
            >
              <TrophyIcon aria-hidden className="size-4" />
              <span className="sr-only">{t("challenge")}</span>
            </Link>
          </div>
        </header>
        {/* Under lg, room at the foot for the two bars. */}
        <main className="mx-auto w-full max-w-296 flex-1 px-4 py-6 lg:p-8 max-lg:pb-[calc(var(--save-nav-height)+var(--save-actions-height)+1.5rem)]">
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
          <SectionTabs saveId={header.id} hasCup={header.hasCup} />
          {children}
        </main>
      </div>
    </SimulationProvider>
  );
}
