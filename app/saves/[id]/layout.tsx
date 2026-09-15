import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSaveSummary } from "@/src/db/saves";
import { contrastText, ensureContrast } from "@/src/lib/color";
import { formatDate } from "@/src/lib/format";
import { SaveNav } from "./_components/save-nav";

export const dynamic = "force-dynamic";

/** The dark theme's --background (oklch(0.145 0 0)) in hex: the surface the club accent must stand out on. */
const DARK_BACKGROUND = "#0A0A0A";

export default async function SaveLayout({ children, params }: LayoutProps<"/saves/[id]">) {
  const { id } = await params;
  const save = await getSaveSummary(id);
  if (save === null) {
    notFound();
  }

  // The accent serves the navigation bar, primary buttons and active states only.
  const club = ensureContrast(save.club.primaryColor, DARK_BACKGROUND);
  const accent = { "--club": club, "--club-fg": contrastText(club) } as CSSProperties;

  return (
    <div style={accent} className="flex min-h-full flex-1 flex-col">
      <header className="bg-(--club) text-(--club-fg)">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <Link href="/" className="text-xs opacity-80 hover:underline hover:opacity-100">
              ← Toutes les parties
            </Link>
            <p className="truncate text-lg font-semibold">{save.club.name}</p>
            <p className="truncate text-xs opacity-80">
              {save.name} · {save.managerName} ·{" "}
              <time dateTime={save.currentDate.toISOString()} className="tabular-nums">
                {formatDate(save.currentDate)}
              </time>
            </p>
          </div>
          <SaveNav saveId={save.id} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
