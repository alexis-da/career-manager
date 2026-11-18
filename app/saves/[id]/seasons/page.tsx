import { competitionName } from "@/src/i18n/countries";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "@/src/components/link";
import { requireOwnedSave } from "@/src/auth/current-user";
import { PlayerFace } from "@/src/components/player-face";
import { MANAGED_ROW, TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { getWornCosmetics } from "@/src/db/rewards-view";
import { seasonLabel } from "@/src/engine/world";
import { formatDecimal, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";

import { cupLabel, europeLabel, moveLabel, rankLabel, recordLabel } from "../_lib/seasons";
import { CareerLegends } from "./_components/career-legends";
import { CareerRecords } from "./_components/career-records";
import { CurrentSeasonLine } from "./_components/current-season";
import { HistoryHead } from "./_components/history-head";
import { TrophyRoom } from "./_components/trophy-room";
import { careerCardFileName, careerCardPath } from "./_lib/career";
import { getCareerHistoryCached } from "./_lib/history-cache";

export const dynamic = "force-dynamic";

/**
 * Under lg, a row is a card: the rank in large on the left, the season in the middle with its competition and figures, the
 * link on the right, then the best player across the card. Points and record share the middle's last line: a column as
 * narrow as the points, the rest for the record. The link's pseudo-element covers the card, the whole of it leading to the
 * season. A `tr` takes no border-radius: a clip rounds its background, the card's or the title's.
 */
const ROW =
  "border-b-0 [clip-path:inset(0_round_var(--radius-lg))] max-lg:relative max-lg:grid max-lg:h-auto max-lg:grid-cols-[minmax(4rem,auto)_auto_minmax(0,1fr)_auto] max-lg:items-center max-lg:gap-x-1 max-lg:gap-y-0.5 max-lg:px-3.5 max-lg:py-3";
const PLAIN_ROW = "max-lg:bg-card max-lg:hover:bg-secondary";

/** At 1024 px, the table has 680 px: tighter cells until xl, the competition on its line and the best player on two if need be. */
const TIGHT_CELL = "lg:max-xl:px-1.5";
const CELL = cn(TABLE_CELL, TIGHT_CELL, "py-2 max-lg:p-0");

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("seasons"))("title") };
}

/**
 * The History tab (docs/design/historique.md): the career in a few figures and its card, the trophy room, the records
 * and the legends, then the season in progress and the completed ones, most recent first, each with a link to its card.
 */
export default async function SeasonsPage({ params }: PageProps<"/saves/[id]/seasons">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  const { ownerId } = await requireOwnedSave(id);
  const [t, tWorld, tPositions, tStage, locale] = await Promise.all([
    getTranslations("seasons"),
    getTranslations("world"),
    getTranslations("positions"),
    getTranslations("stage"),
    getLocale(),
  ]);
  const [history, dress] = await Promise.all([getCareerHistoryCached(id), getWornCosmetics(ownerId)]);
  const { clubColors, seasons } = history;
  // The career card from a completed season on, never in a challenge save (its card is its season's).
  const completedSeasons = history.summary.seasons;
  const card =
    history.challenge || completedSeasons === 0
      ? null
      : {
          square: { url: careerCardPath(id, locale, completedSeasons, "square", dress), fileName: careerCardFileName("square", t) },
          landscape: { url: careerCardPath(id, locale, completedSeasons, "landscape", dress), fileName: careerCardFileName("landscape", t) },
        };

  return (
    <div className="space-y-5">
      <h1 data-testid="seasons-title" className="font-heading text-4xl font-bold">
        {t("title")}
      </h1>

      <HistoryHead history={history} card={card} />
      <TrophyRoom room={history.trophyRoom} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <CareerRecords history={history} />
        <CareerLegends history={history} />
      </div>
      {history.current !== null && <CurrentSeasonLine season={history.current} />}

      {seasons.length === 0 ? (
        <Panel>
          <p data-testid="seasons-empty" className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </Panel>
      ) : (
        // Under lg, each season is a card of its own (ROW), on the page's background: same table, same rows, laid out by CSS.
        <Panel className="p-3 max-lg:rounded-none max-lg:bg-transparent max-lg:p-0">
          <Table className="tabular-nums max-lg:block" data-testid="seasons-table">
            <TableHeader className="max-lg:hidden [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(TABLE_HEAD, TIGHT_CELL)}>{t("columns.season")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_CELL)}>{t("columns.competition")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_CELL, "text-right")}>{t("columns.rank")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_CELL, "text-right")} title={t("columns.pointsTitle")}>
                  {t("columns.points")}
                </TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_CELL, "text-right")} title={t("columns.recordTitle")}>
                  {t("columns.record")}
                </TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_CELL)}>{t("columns.bestPlayer")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_CELL)}>
                  <span className="sr-only">{t("columns.card")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="max-lg:block max-lg:space-y-2">
              {seasons.map((season) => {
                const titled = season.champion || season.cupWinner || season.europeWinner;
                const move = moveLabel(season, t);
                const cup = cupLabel(season, tStage);
                const europe = europeLabel(season, tStage);
                return (
                  <TableRow key={season.seasonId} data-season={season.startYear} className={cn(TABLE_ROW, ROW, titled ? MANAGED_ROW : PLAIN_ROW)}>
                    {/* Under lg, without the header, the season, the figures and the best player say what they are. */}
                    <TableCell
                      className={cn(
                        CELL,
                        "font-bold max-lg:col-span-2 max-lg:col-start-2 max-lg:row-start-1 max-lg:text-[0.9375rem] lg:font-heading lg:text-base",
                      )}
                    >
                      <span className="lg:hidden">{t("columns.season")} </span>
                      {seasonLabel(season.startYear)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        CELL,
                        "whitespace-normal lg:max-xl:min-w-40 max-lg:col-span-2 max-lg:col-start-2 max-lg:row-start-2 max-lg:text-[0.8125rem] max-lg:text-muted-foreground",
                      )}
                    >
                      {competitionName(season.competitionCode, tWorld)}
                      {move !== null && (
                        <span
                          data-column="move"
                          className={cn("block text-xs font-semibold", season.promoted ? "text-(--club)" : "text-muted-foreground")}
                        >
                          {move}
                        </span>
                      )}
                      {cup !== null && (
                        <span
                          data-column="cup"
                          className={cn("block text-xs font-semibold", season.cupWinner ? "text-(--club)" : "text-muted-foreground")}
                        >
                          {cup}
                        </span>
                      )}
                      {europe !== null && (
                        <span
                          data-column="europe"
                          className={cn("block text-xs font-semibold", season.europeWinner ? "text-(--club)" : "text-muted-foreground")}
                        >
                          {europe}
                        </span>
                      )}
                      {(season.objectives !== null || season.budget !== null) && (
                        <span data-column="objectives" className="block text-xs text-muted-foreground">
                          {[
                            season.objectives === null ? null : t("history.seasonObjectives", season.objectives),
                            season.budget === null
                              ? null
                              : season.endBudget === null
                                ? t("history.budget", { amount: formatMoney(season.budget, locale) })
                                : t("history.budgetEnd", { start: formatMoney(season.budget, locale), end: formatMoney(season.endBudget, locale) }),
                          ]
                            .filter((part) => part !== null)
                            .join(" · ")}
                        </span>
                      )}
                    </TableCell>
                    {/* « Champion » in the capitals of a title, « 16e » as it is written; too long a word for the card's large figures. */}
                    <TableCell
                      data-column="rank"
                      className={cn(
                        CELL,
                        "text-right font-heading text-xl font-bold max-lg:col-start-1 max-lg:row-span-3 max-lg:row-start-1 max-lg:pr-2 max-lg:text-left",
                        season.champion ? "text-(--club) max-lg:text-[1.375rem]" : "normal-case max-lg:text-3xl",
                      )}
                    >
                      {rankLabel(season.rank, t)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        CELL,
                        "text-right max-lg:col-start-2 max-lg:row-start-3 max-lg:text-left max-lg:text-[0.8125rem] lg:font-heading lg:text-lg lg:font-bold",
                      )}
                    >
                      {season.points}
                      <span className="text-muted-foreground lg:hidden"> {t("columns.points")}</span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        CELL,
                        "text-right max-lg:col-start-3 max-lg:row-start-3 max-lg:text-left max-lg:text-[0.8125rem] max-lg:whitespace-normal max-lg:before:mr-1 max-lg:before:content-['·']",
                      )}
                    >
                      {recordLabel(season)}
                      <span className="text-muted-foreground lg:hidden"> {t("columns.record")}</span>
                    </TableCell>
                    <TableCell className={cn(CELL, "whitespace-normal max-lg:col-span-4 max-lg:row-start-4 max-lg:mt-2.5 max-lg:border-t max-lg:pt-2.5")}>
                      {season.topScorer !== null && (
                        <span data-column="scorer" className="mb-1.5 block text-xs text-muted-foreground">
                          {t("history.topScorer", { name: season.topScorer.name, goals: season.topScorer.goals })}
                          {season.hatTricks > 0 && ` · ${t("history.hatTricks", { count: season.hatTricks })}`}
                        </span>
                      )}
                      {season.bestPlayer === null ? (
                        <span className="text-muted-foreground">
                          <span className="eyebrow lg:hidden">{t("columns.bestPlayer")} </span>—
                        </span>
                      ) : (
                        <span className="flex items-center gap-2.5">
                          <PlayerFace
                            playerKey={season.bestPlayer.playerKey}
                            age={season.bestPlayer.age}
                            clubColors={clubColors}
                            size={36}
                            // The default background is this row's own, once it has a title.
                            background={titled ? "var(--card)" : undefined}
                            className="shrink-0 max-lg:size-10"
                          />
                          <span className="min-w-0 leading-tight">
                            <span className="eyebrow block lg:hidden">{t("columns.bestPlayer")}</span>
                            <span className="block font-semibold wrap-break-word">{season.bestPlayer.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t("bestPlayerStats", {
                                position: tPositions(`short.${season.bestPlayer.position}`),
                                goals: season.bestPlayer.goals,
                                assists: season.bestPlayer.assists,
                                rating: formatDecimal(season.bestPlayer.rating, locale),
                              })}
                            </span>
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cn(CELL, "text-right max-lg:col-start-4 max-lg:row-span-3 max-lg:row-start-1 max-lg:pl-2")}>
                      <Link
                        href={`/saves/${id}/seasons/${season.seasonId}`}
                        aria-label={t("viewCardLabel", { season: seasonLabel(season.startYear) })}
                        data-testid={`seasons-card-link-${season.startYear}`}
                        className="font-semibold whitespace-nowrap text-highlight hover:underline max-lg:inline-flex max-lg:min-h-11 max-lg:min-w-11 max-lg:items-center max-lg:justify-end max-lg:text-[0.8125rem] max-lg:font-bold max-lg:after:absolute max-lg:after:inset-0"
                      >
                        <span className="max-xl:hidden">{t("viewCard")}</span>
                        <span className="xl:hidden">{t("columns.card")}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
