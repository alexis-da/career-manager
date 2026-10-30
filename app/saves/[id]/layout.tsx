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
import { formatDayDate } from "@/src/lib/format";
import { GameActions } from "./_components/game-actions";
import { SaveNav } from "./_components/save-nav";
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

  return (
    <SimulationProvider saveId={header.id}>
      <div className="flex min-h-full flex-1 flex-col">
        {/* Opaque on a phone, without the blur: a blur would hold the action bar, fixed to the screen, in the header. */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur max-sm:bg-background max-sm:backdrop-filter-none">
          <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-4 sm:gap-6 lg:px-7">
            {/* The game's mark, the only one in a save: the rest is in the club's colours. 44 px to the touch on a phone. */}
            <Link
              href="/"
              title={t("home")}
              data-testid="header-home"
              className="-mr-1.5 shrink-0 rounded-md sm:-mr-3 max-sm:-mx-2 max-sm:grid max-sm:size-11 max-sm:place-items-center"
            >
              <Image src="/brand/late-winner-icone.svg" alt="Late Winner" width={28} height={28} unoptimized />
            </Link>
            <Link
              href="/"
              title={t("saves", { manager: header.managerName })}
              data-testid="header-club"
              className="flex min-w-0 items-center gap-3 max-sm:min-h-11"
            >
              <ClubInitials name={header.club.name} className="size-9 text-base" />
              <span className="min-w-0 leading-tight">
                {/* On a phone, two lines if need be rather than cut: the game's actions have left this row. */}
                <span className="block max-w-56 truncate font-heading text-lg font-bold tracking-wide uppercase max-sm:line-clamp-2 max-sm:max-w-none max-sm:text-base max-sm:leading-tight max-sm:whitespace-normal">
                  {header.club.name}
                </span>
                {/* The club's competition now: it changes with a promotion or a relegation. */}
                <span
                  data-testid="header-competition"
                  className="block max-w-64 truncate text-[0.6875rem] text-muted-foreground max-sm:max-w-none"
                >
                  {competitionName(header.competitionCode, tWorld)} · {t("season", { season })}
                </span>
              </span>
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
              {/* Not on a phone, where the club's name needs the room: the home page's foot has it. */}
              <LanguageSwitcher className="max-sm:hidden" />
              {/* The weekly challenge, outside the save: next to the game's actions rather than among its tabs. */}
              <Link
                href="/challenge"
                title={t("challenge")}
                data-testid="header-challenge"
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-sm:size-11"
              >
                <TrophyIcon aria-hidden className="size-4" />
                <span className="sr-only">{t("challenge")}</span>
              </Link>
              <div className="hidden text-right leading-tight lg:block">
                <p data-testid="header-date" className="font-heading text-base font-semibold tabular-nums first-letter:uppercase">
                  <time dateTime={header.currentDate.toISOString()}>{formatDayDate(header.currentDate, locale)}</time>
                </p>
                <p data-testid="header-status" className="text-[0.6875rem] text-muted-foreground tabular-nums">
                  {header.nextStage === null ? t("seasonFinished") : stageLabel(header.nextStage, tStage)} ·{" "}
                  {t(header.windowOpen ? "windowOpen" : "windowClosed")}
                </p>
              </div>
              {/* On a phone, the game's actions leave this row for a bar fixed to the foot of the screen, under the thumb;
                  no bar at all when there is no action, on the live page of a paused match. */}
              <div className="contents max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:flex max-sm:border-t max-sm:bg-background max-sm:px-4 max-sm:py-2 max-sm:*:flex-1 max-sm:empty:hidden">
                <GameActions
                  saveId={header.id}
                  seasonFinished={header.seasonFinished}
                  liveMatch={header.liveMatch}
                  worldVersion={header.worldVersion}
                />
              </div>
            </div>
          </div>
          {/* The tabs on a row of their own: the header is 56 + 40 px high (56 + 48 on a phone, for tabs of 44 px), which
              the sticky panels below it allow for. */}
          <SaveNav saveId={header.id} hasCup={header.hasCup} />
        </header>
        {/* On a phone, room at the foot for the action bar. */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-7 max-sm:pb-24">{children}</main>
      </div>
    </SimulationProvider>
  );
}
