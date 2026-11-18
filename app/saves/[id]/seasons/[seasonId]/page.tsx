import { competitionName, europeKey } from "@/src/i18n/countries";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/src/components/link";
import { notFound } from "next/navigation";
import { requireOwnedSave } from "@/src/auth/current-user";
import { buttonVariants } from "@/src/components/ui/button";
import { getCupWinnerName } from "@/src/db/cup-view";
import { getEuropeWinners } from "@/src/db/europe-results";
import { getClosedObjectives } from "@/src/db/objectives";
import { getCountryMoves } from "@/src/db/promotion";
import { getWornCosmetics } from "@/src/db/rewards-view";
import { getSaveSummary } from "@/src/db/saves";
import { getSeasonResult } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { cn } from "@/src/lib/utils";
import {
  cupLabel,
  europeReviewLines,
  isLastCompletedSeason,
  moveLabel,
  rankLabel,
  recordLabel,
  seasonCardFileName,
  seasonCardPath,
} from "../../_lib/seasons";
import { recordsSetIn } from "@/src/engine/career-history";
import { NewRecordsPanel } from "../_components/new-records-panel";
import { SeasonCardPanel } from "../_components/season-card-panel";
import { getCareerHistoryCached } from "../_lib/history-cache";
import { SeasonMovesPanel } from "../_components/season-moves-panel";
import { SeasonObjectivesPanel } from "../_components/season-objectives-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("seasons"))("completed.title") };
}

/** The panel of a completed season: shown right after moving on to the next one, and from the palmarès. */
export default async function SeasonPage({ params }: PageProps<"/saves/[id]/seasons/[seasonId]">) {
  const { id, seasonId } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  const { ownerId } = await requireOwnedSave(id);
  const [t, tWorld, tStage, locale] = await Promise.all([
    getTranslations("seasons"),
    getTranslations("world"),
    getTranslations("stage"),
    getLocale(),
  ]);
  const [result, moves, save, objectives, dress, history] = await Promise.all([
    getSeasonResult(id, seasonId),
    getCountryMoves(id, seasonId),
    getSaveSummary(id),
    getClosedObjectives(id, seasonId),
    // The frame and title the player wears, on the card's address (missions v2).
    getWornCosmetics(ownerId),
    // The career's records, for the ones this season broke.
    getCareerHistoryCached(id),
  ]);
  if (result === null || save === null) {
    notFound();
  }
  const { season } = result;
  const move = moveLabel(season, t);
  const label = seasonLabel(season.startYear);
  // The cup's line: the managed club's run, and the winner when it is another club. The European lines: the managed
  // club's run, then each competition's winner that year.
  const cup = cupLabel(season, tStage);
  const [cupWinner, europeWinners] = await Promise.all([
    cup === null || season.cupWinner ? null : getCupWinnerName(id, season.startYear),
    getEuropeWinners(id, season.startYear),
  ]);
  const europe = europeReviewLines(season, europeWinners, tStage, t);
  // One column, centred under lg; the whole page on a computer, for the objectives and the moves beside the card: a save
  // with one division has no moves, a season from before the objectives no objectives.
  const records = recordsSetIn(history, season.startYear);
  const beside = objectives !== null || moves.length > 0 || records.length > 0;

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
        {europe.map((line) => (
          <p
            key={line.code}
            data-season-europe={line.code}
            data-own={line.own ? "" : undefined}
            data-testid={`season-europe-${europeKey(line.code) ?? line.code}`}
            className={line.won ? "text-sm font-semibold text-(--club)" : "text-sm text-muted-foreground"}
          >
            {line.text}
          </p>
        ))}
      </div>
      <div className={cn("grid grid-cols-1 items-start gap-5", beside && "lg:grid-cols-2 xl:grid-cols-[28rem_minmax(0,1fr)]")}>
        <SeasonCardPanel
          square={{ url: seasonCardPath(id, seasonId, locale, "square", dress), fileName: seasonCardFileName(season.startYear, "square", t) }}
          landscape={{ url: seasonCardPath(id, seasonId, locale, "landscape", dress), fileName: seasonCardFileName(season.startYear, "landscape", t) }}
          shareTitle={t("completed.shareTitle", { season: label })}
        />
        <div className="space-y-5 empty:hidden">
          {records.length > 0 && <NewRecordsPanel records={records} />}
          {objectives !== null && <SeasonObjectivesPanel objectives={objectives} />}
          {moves.length > 0 && <SeasonMovesPanel moves={moves} />}
          {/* The next season has begun: the way on to its start screen, in the blue, the screen's orange being the card's. */}
          {isLastCompletedSeason(season.startYear, save.currentDate) && (
            <Link
              href={`/saves/${id}/season-start`}
              data-testid="season-next"
              className={cn(buttonVariants(), "h-14 w-full text-[1.0625rem] font-bold")}
            >
              {t("completed.next", { season: seasonLabel(season.startYear + 1) })}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
