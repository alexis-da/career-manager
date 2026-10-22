import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getSeasonResult } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { rankLabel, recordLabel, seasonCardFileName, seasonCardPath } from "../../_lib/seasons";
import { SeasonCardPanel } from "../_components/season-card-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Saison terminée" };

/** The panel of a completed season: shown right after moving on to the next one, and from the palmarès. */
export default async function SeasonPage({ params }: PageProps<"/saves/[id]/seasons/[seasonId]">) {
  const { id, seasonId } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const result = await getSeasonResult(id, seasonId);
  if (result === null) {
    notFound();
  }
  const { season } = result;
  const label = seasonLabel(season.startYear);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={`/saves/${id}/seasons`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        Palmarès
      </Link>
      <div className="space-y-1">
        <h1 className="font-heading text-4xl font-bold">Saison terminée</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          Saison {label} · {season.competitionName} · {rankLabel(season.rank)} avec {season.points} points (
          {recordLabel(season)})
        </p>
      </div>
      <SeasonCardPanel
        square={{ url: seasonCardPath(id, seasonId, "square"), fileName: seasonCardFileName(season.startYear, "square") }}
        landscape={{ url: seasonCardPath(id, seasonId), fileName: seasonCardFileName(season.startYear, "landscape") }}
        shareTitle={`Ma saison ${label} sur Late Winner`}
      />
    </div>
  );
}
