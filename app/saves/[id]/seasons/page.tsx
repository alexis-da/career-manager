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
        <Panel className="p-2 sm:p-3">
          <Table className="tabular-nums" data-testid="seasons-table">
            <TableHeader>
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
            <TableBody>
              {seasons.map((season) => (
                <TableRow
                  key={season.seasonId}
                  data-season={season.startYear}
                  className={cn(TABLE_ROW, (season.champion || season.cupWinner) && MANAGED_ROW)}
                >
                  <TableCell className={cn(TABLE_CELL, "font-heading text-base font-semibold")}>
                    {seasonLabel(season.startYear)}
                  </TableCell>
                  <TableCell className={TABLE_CELL}>
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
                    className={cn(TABLE_CELL, "text-right font-heading text-base font-bold", season.champion && "text-(--club)")}
                  >
                    {rankLabel(season.rank, t)}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{season.points}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{recordLabel(season)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "whitespace-nowrap")}>
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
                  <TableCell className={cn(TABLE_CELL, "text-right")}>
                    <Link
                      href={`/saves/${id}/seasons/${season.seasonId}`}
                      aria-label={t("viewCardLabel", { season: seasonLabel(season.startYear) })}
                      data-testid={`seasons-card-link-${season.startYear}`}
                      className="font-semibold whitespace-nowrap text-(--club) hover:underline"
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
