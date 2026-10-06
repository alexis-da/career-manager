import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaveHeader } from "@/src/db/header";
import { seasonLabel } from "@/src/engine/world";
import { contrastText, ensureContrast } from "@/src/lib/color";
import { formatDayDate } from "@/src/lib/format";
import { GameActions } from "./_components/game-actions";
import { SaveNav } from "./_components/save-nav";

export const dynamic = "force-dynamic";

/** The theme's --background in hex: the surface the club accent must stand out on. */
const BACKGROUND = "#0B0D10";

export default async function SaveLayout({ children, params }: LayoutProps<"/saves/[id]">) {
  const { id } = await params;
  const header = await getSaveHeader(id);
  if (header === null) {
    notFound();
  }

  // The accent marks the club name, the main button, active tabs, the club's row in tables and attribute bars.
  const club = ensureContrast(header.club.primaryColor, BACKGROUND);
  const accent = { "--club": club, "--club-fg": contrastText(club) } as CSSProperties;
  const season = seasonLabel(header.startYear);

  return (
    <div style={accent} className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-6 px-4 lg:px-7">
          <Link href="/" title="Toutes les parties" className="flex min-w-0 shrink-0 items-center gap-3">
            <span aria-hidden className="h-8 w-1 shrink-0 rounded-full bg-(--club)" />
            <span className="min-w-0 leading-tight">
              <span className="block max-w-56 truncate font-heading text-lg font-bold tracking-wide uppercase">
                {header.club.name}
              </span>
              <span className="block max-w-56 truncate text-[0.6875rem] text-muted-foreground">
                Manager : {header.managerName} · Saison {season}
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
            <GameActions saveId={header.id} seasonFinished={header.seasonFinished} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-7">{children}</main>
    </div>
  );
}
