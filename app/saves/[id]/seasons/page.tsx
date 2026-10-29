import { competitionName } from "@/src/i18n/countries";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { requireOwnedSave } from "@/src/auth/current-user";
import { PlayerFace } from "@/src/components/player-face";
import { MANAGED_ROW, TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { getSeasonResults } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { formatDecimal } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../_components/panel";

import { cupLabel, moveLabel, rankLabel, recordLabel } from "../_lib/seasons";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("seasons"))("title") };
}

/** The managed club's completed seasons, most recent first, each with a link to its card. */
export default async function SeasonsPage({ params }: PageProps<"/saves/[id]/seasons">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tWorld, tPositions, tStage, locale] = await Promise.all([
    getTranslations("seasons"),
    getTranslations("world"),
    getTranslations("positions"),
    getTranslations("stage"),
    getLocale(),
  ]);
  const { clubColors, seasons } = await getSeasonResults(id);

  return (
    <div className="space-y-5">
      <h1 data-testid="seasons-title" className="font-heading text-4xl font-bold">
        {t("title")}
      </h1>

      {seasons.length === 0 ? (
        <Panel>
          <p data-testid="seasons-empty" className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </Panel>
      ) : (
        // On a phone, each season is a card: its season and competition, its rank, points and record on the right,
        // then its best player and the way to its card. Same rows, laid out by CSS.
        <Panel className="p-2 sm:p-3">
          <Table className="tabular-nums max-sm:block" data-testid="seasons-table">
            <TableHeader className="max-sm:hidden">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={TABLE_HEAD}>{t("columns.season")}</TableHead>
                <TableHead className={TABLE_HEAD}>{t("columns.competition")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>{t("columns.rank")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")} title={t("columns.pointsTitle")}>
                  {t("columns.points")}
                </TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")} title={t("columns.recordTitle")}>
                  {t("columns.record")}
                </TableHead>
                <TableHead className={TABLE_HEAD}>{t("columns.bestPlayer")}</TableHead>
                <TableHead className={TABLE_HEAD}>
                  <span className="sr-only">{t("columns.card")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="max-sm:block">
              {seasons.map((season) => (
                <TableRow
                  key={season.seasonId}
                  data-season={season.startYear}
                  className={cn(
                    TABLE_ROW,
                    "max-sm:grid max-sm:h-auto max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-start max-sm:gap-x-3 max-sm:px-2 max-sm:py-2",
                    (season.champion || season.cupWinner) && MANAGED_ROW,
                  )}
                >
                  <TableCell className={cn(TABLE_CELL, "font-heading text-base font-semibold max-sm:col-start-1 max-sm:row-start-1 max-sm:px-0")}>
                    {seasonLabel(season.startYear)}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "max-sm:col-start-1 max-sm:row-start-2 max-sm:row-span-2 max-sm:px-0 max-sm:whitespace-normal")}>
                    {competitionName(season.competitionCode, tWorld)}
                    {moveLabel(season, t) !== null && (
                      <span
                        data-column="move"
                        className={cn("block text-xs font-semibold", season.promoted ? "text-(--club)" : "text-muted-foreground")}
                      >
                        {moveLabel(season, t)}
                      </span>
                    )}
                    {cupLabel(season, tStage) !== null && (
                      <span
                        data-column="cup"
                        className={cn("block text-xs font-semibold", season.cupWinner ? "text-(--club)" : "text-muted-foreground")}
                      >
                        {cupLabel(season, tStage)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    data-column="rank"
                    className={cn(
                      TABLE_CELL,
                      "text-right font-heading text-base font-bold max-sm:col-start-2 max-sm:row-start-1 max-sm:px-0",
                      season.champion && "text-(--club)",
                    )}
                  >
                    {rankLabel(season.rank, t)}
                  </TableCell>
                  {/* On a phone, without the header, each figure says what it is. */}
                  <TableCell className={cn(TABLE_CELL, "text-right max-sm:col-start-2 max-sm:row-start-2 max-sm:px-0")}>
                    {season.points}
                    <span className="text-xs text-muted-foreground sm:hidden"> {t("columns.points")}</span>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right max-sm:col-start-2 max-sm:row-start-3 max-sm:px-0")}>
                    {recordLabel(season)}
                    <span className="text-xs text-muted-foreground sm:hidden"> {t("columns.record")}</span>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "whitespace-nowrap max-sm:col-span-2 max-sm:row-start-4 max-sm:px-0 max-sm:pt-1.5 max-sm:whitespace-normal")}>
                    {season.bestPlayer === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <PlayerFace
                          playerKey={season.bestPlayer.playerKey}
                          age={season.bestPlayer.age}
                          clubColors={clubColors}
                          size={28}
                          className="mr-2 inline-block align-middle"
                        />
                        <span className="font-semibold">{season.bestPlayer.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("bestPlayerStats", {
                            position: tPositions(`short.${season.bestPlayer.position}`),
                            goals: season.bestPlayer.goals,
                            assists: season.bestPlayer.assists,
                            rating: formatDecimal(season.bestPlayer.rating, locale),
                          })}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right max-sm:col-span-2 max-sm:row-start-5 max-sm:px-0")}>
                    <Link
                      href={`/saves/${id}/seasons/${season.seasonId}`}
                      aria-label={t("viewCardLabel", { season: seasonLabel(season.startYear) })}
                      data-testid={`seasons-card-link-${season.startYear}`}
                      className="font-semibold whitespace-nowrap text-(--club) hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
                    >
                      {t("viewCard")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
