import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getCupWinnerName } from "@/src/db/cup-view";
import { getCountryMoves } from "@/src/db/promotion";
import { getSeasonResult } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { cupLabel, moveLabel, rankLabel, recordLabel, seasonCardFileName, seasonCardPath } from "../../_lib/seasons";
import { SeasonCardPanel } from "../_components/season-card-panel";
import { SeasonMovesPanel } from "../_components/season-moves-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Saison terminée" };

/** The panel of a completed season: shown right after moving on to the next one, and from the palmarès. */
export default async function SeasonPage({ params }: PageProps<"/saves/[id]/seasons/[seasonId]">) {
  const { id, seasonId } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [result, moves] = await Promise.all([getSeasonResult(id, seasonId), getCountryMoves(id, seasonId)]);
  if (result === null) {
    notFound();
  }
  const { season } = result;
  const move = moveLabel(season);
  const label = seasonLabel(season.startYear);
  // The cup's line: the managed club's run, and the winner when it is another club.
  const cup = cupLabel(season);
  const cupWinner = cup === null || season.cupWinner ? null : await getCupWinnerName(id, season.startYear);

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
          {recordLabel(season)}){move === null ? "" : ` · ${move}`}
        </p>
        {cup !== null && (
          <p data-season-cup="" className={season.cupWinner ? "text-sm font-semibold text-(--club)" : "text-sm text-muted-foreground"}>
            {cup}
            {cupWinner !== null && ` · vainqueur : ${cupWinner}`}
          </p>
        )}
      </div>
      <SeasonCardPanel
        square={{ url: seasonCardPath(id, seasonId, "square"), fileName: seasonCardFileName(season.startYear, "square") }}
        landscape={{ url: seasonCardPath(id, seasonId), fileName: seasonCardFileName(season.startYear, "landscape") }}
        shareTitle={`Ma saison ${label} sur Late Winner`}
      />
      {moves.length > 0 && <SeasonMovesPanel moves={moves} />}
    </div>
  );
}
