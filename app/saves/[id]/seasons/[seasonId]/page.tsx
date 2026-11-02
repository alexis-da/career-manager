import { competitionName } from "@/src/i18n/countries";
import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { buttonVariants } from "@/src/components/ui/button";
import { getCupWinnerName } from "@/src/db/cup-view";
import { getCountryMoves } from "@/src/db/promotion";
import { getSaveSummary } from "@/src/db/saves";
import { getSeasonResult } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { cn } from "@/src/lib/utils";
import {
  cupLabel,
  isLastCompletedSeason,
  moveLabel,
  rankLabel,
  recordLabel,
  seasonCardFileName,
  seasonCardPath,
} from "../../_lib/seasons";
import { SeasonCardPanel } from "../_components/season-card-panel";
import { SeasonMovesPanel } from "../_components/season-moves-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("seasons"))("completed.title") };
}

/** The panel of a completed season: shown right after moving on to the next one, and from the palmarès. */
export default async function SeasonPage({ params }: PageProps<"/saves/[id]/seasons/[seasonId]">) {
  const { id, seasonId } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tWorld, tStage] = await Promise.all([
    getTranslations("seasons"),
    getTranslations("world"),
    getTranslations("stage"),
  ]);
  const [result, moves, save] = await Promise.all([getSeasonResult(id, seasonId), getCountryMoves(id, seasonId), getSaveSummary(id)]);
  if (result === null || save === null) {
    notFound();
  }
  const { season } = result;
  const move = moveLabel(season, t);
  const label = seasonLabel(season.startYear);
  // The cup's line: the managed club's run, and the winner when it is another club.
  const cup = cupLabel(season, tStage);
  const cupWinner = cup === null || season.cupWinner ? null : await getCupWinnerName(id, season.startYear);
  // One column, centred under lg; the whole page on a computer, for the moves beside the card: a save with one division has none.
  const beside = moves.length > 0;

  return (
    <div className={cn("mx-auto max-w-xl space-y-5 lg:mx-0 lg:max-w-md", beside && "lg:max-w-none")}>
      <div className="space-y-1">
        <Link
          href={`/saves/${id}/seasons`}
          data-testid="season-back"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-sm:min-h-11"
        >
          <ChevronLeftIcon className="size-4" />
          {t("title")}
        </Link>
        <p className="text-xs font-bold tracking-wider text-highlight uppercase">{t("completed.season", { season: label })}</p>
        <h1 data-testid="season-title" className="font-heading text-[2.5rem] leading-[0.95] font-bold">
          {t("completed.title")}
        </h1>
        <p data-testid="season-summary" className="pt-1 text-sm text-muted-foreground tabular-nums">
          {t("completed.summary", {
            competition: competitionName(season.competitionCode, tWorld),
            rank: rankLabel(season.rank, t),
            points: season.points,
            record: recordLabel(season),
          })}
          {move === null ? "" : ` · ${move}`}
        </p>
        {cup !== null && (
          <p
            data-season-cup=""
            data-testid="season-cup"
            className={season.cupWinner ? "text-sm font-semibold text-(--club)" : "text-sm text-muted-foreground"}
          >
            {cupWinner === null ? cup : t("completed.cupWinner", { cup, club: cupWinner })}
          </p>
        )}
      </div>
      <div className={cn("grid grid-cols-1 items-start gap-5", beside && "lg:grid-cols-2 xl:grid-cols-[28rem_minmax(0,1fr)]")}>
        <SeasonCardPanel
          square={{ url: seasonCardPath(id, seasonId, "square"), fileName: seasonCardFileName(season.startYear, "square", t) }}
          landscape={{ url: seasonCardPath(id, seasonId), fileName: seasonCardFileName(season.startYear, "landscape", t) }}
          shareTitle={t("completed.shareTitle", { season: label })}
        />
        <div className="space-y-5 empty:hidden">
          {beside && <SeasonMovesPanel moves={moves} />}
          {/* The next season has already begun: this is the way back to it, in the blue, the screen's orange being the card's. */}
          {isLastCompletedSeason(season.startYear, save.currentDate) && (
            <Link href={`/saves/${id}`} data-testid="season-next" className={cn(buttonVariants(), "h-14 w-full text-[1.0625rem] font-bold")}>
              {t("completed.next", { season: seasonLabel(season.startYear + 1) })}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
