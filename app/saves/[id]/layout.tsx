import { competitionName } from "@/src/i18n/countries";
import { getTranslations } from "next-intl/server";
import { TrophyIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getSaveHeader } from "@/src/db/header";
import { seasonLabel } from "@/src/engine/world";
import { formatDayDate } from "@/src/lib/format";
import { GameActions } from "./_components/game-actions";
import { SaveNav } from "./_components/save-nav";
import { SimulationProvider } from "./_components/simulation";
import { clubAccentStyle } from "./_lib/club-accent";
import { stageLabel } from "./_lib/stage";

export const dynamic = "force-dynamic";

// The Server Actions of a save's pages play matchdays: a « Prochain match » or simulation call plays up to
// SIMULATION_MAX_MATCHDAYS dates, each of up to some fifty matches in a worldVersion 2 save.
export const maxDuration = 60;

export default async function SaveLayout({ children, params }: LayoutProps<"/saves/[id]">) {
  const tWorld = await getTranslations("world");
  const tStage = await getTranslations("stage");
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const header = await getSaveHeader(id);
  if (header === null) {
    notFound();
  }

  const accent = clubAccentStyle(header.club.primaryColor);
  const season = seasonLabel(header.startYear);

  return (
    <SimulationProvider saveId={header.id} accent={accent}>
      <div lang="fr" style={accent} className="flex min-h-full flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-4 sm:gap-6 lg:px-7">
            {/* The game's mark, the only one in a save: the rest is in the club's colours. */}
            <Link href="/" title="Late Winner · toutes les parties" className="-mr-1.5 shrink-0 rounded-md sm:-mr-3">
              <Image src="/brand/late-winner-icone.svg" alt="Late Winner" width={28} height={28} unoptimized />
            </Link>
            <Link
              href="/"
              title={`Toutes les parties · Manager : ${header.managerName}`}
              className="flex min-w-0 items-center gap-3"
            >
              <span aria-hidden className="h-8 w-1 shrink-0 rounded-full bg-(--club)" />
              <span className="min-w-0 leading-tight">
                <span className="block max-w-56 truncate font-heading text-lg font-bold tracking-wide uppercase">
                  {header.club.name}
                </span>
                {/* The club's competition now: it changes with a promotion or a relegation. */}
                <span data-testid="header-competition" className="block max-w-64 truncate text-[0.6875rem] text-muted-foreground">
                  {competitionName(header.competitionCode, tWorld)} · Saison {season}
                </span>
              </span>
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
              {/* Not on a phone, where the club's name needs the room: the home page's foot has it. */}
              <LanguageSwitcher className="max-sm:hidden" />
              {/* The weekly challenge, outside the save: next to the game's actions rather than among its tabs. */}
              <Link
                href="/challenge"
                title="Défi de la semaine"
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <TrophyIcon aria-hidden className="size-4" />
                <span className="sr-only">Défi de la semaine</span>
              </Link>
              <div className="hidden text-right leading-tight lg:block">
                <p className="font-heading text-base font-semibold tabular-nums first-letter:uppercase">
                  <time dateTime={header.currentDate.toISOString()}>{formatDayDate(header.currentDate)}</time>
                </p>
                <p className="text-[0.6875rem] text-muted-foreground tabular-nums">
                  {header.nextStage === null ? "Saison terminée" : stageLabel(header.nextStage, tStage)} · Mercato{" "}
                  {header.windowOpen ? "ouvert" : "fermé"}
                </p>
              </div>
              <GameActions
                saveId={header.id}
                seasonFinished={header.seasonFinished}
                liveMatch={header.liveMatch}
                worldVersion={header.worldVersion}
              />
            </div>
          </div>
          {/* The tabs on a row of their own: the header is 56 + 40 px high, which the sticky panels below it allow for. */}
          <SaveNav saveId={header.id} hasCup={header.hasCup} />
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-7">{children}</main>
      </div>
    </SimulationProvider>
  );
}
