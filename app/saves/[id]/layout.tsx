import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getSaveHeader } from "@/src/db/header";
import { seasonLabel } from "@/src/engine/world";
import { formatDayDate } from "@/src/lib/format";
import { GameActions } from "./_components/game-actions";
import { SaveNav } from "./_components/save-nav";
import { SimulationProvider } from "./_components/simulation";
import { clubAccentStyle } from "./_lib/club-accent";

export const dynamic = "force-dynamic";

export default async function SaveLayout({ children, params }: LayoutProps<"/saves/[id]">) {
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
          <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-6 px-4 lg:px-7">
            {/* The game's mark, the only one in a save: the rest is in the club's colours. */}
            <Link href="/" title="Late Winner · toutes les parties" className="-mr-3 shrink-0 rounded-md">
              <Image src="/brand/late-winner-icone.svg" alt="Late Winner" width={28} height={28} unoptimized />
            </Link>
            <Link
              href="/"
              title={`Toutes les parties · Manager : ${header.managerName}`}
              className="flex min-w-0 shrink-0 items-center gap-3"
            >
              <span aria-hidden className="h-8 w-1 shrink-0 rounded-full bg-(--club)" />
              <span className="min-w-0 leading-tight">
                <span className="block max-w-56 truncate font-heading text-lg font-bold tracking-wide uppercase">
                  {header.club.name}
                </span>
                {/* The club's competition now: it changes with a promotion or a relegation. */}
                <span data-testid="header-competition" className="block max-w-64 truncate text-[0.6875rem] text-muted-foreground">
                  {header.competitionName} · {season}
                </span>
              </span>
            </Link>

            <SaveNav saveId={header.id} />

            <div className="ml-auto flex shrink-0 items-center gap-4">
              <div className="hidden text-right leading-tight lg:block">
                <p className="font-heading text-base font-semibold tabular-nums first-letter:uppercase">
                  <time dateTime={header.currentDate.toISOString()}>{formatDayDate(header.currentDate)}</time>
                </p>
                <p className="text-[0.6875rem] text-muted-foreground tabular-nums">
                  {header.nextRound === null ? "Saison terminée" : `Journée ${header.nextRound}`} · Mercato{" "}
                  {header.windowOpen ? "ouvert" : "fermé"}
                </p>
              </div>
              <GameActions saveId={header.id} seasonFinished={header.seasonFinished} liveMatch={header.liveMatch} />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-7">{children}</main>
      </div>
    </SimulationProvider>
  );
}
