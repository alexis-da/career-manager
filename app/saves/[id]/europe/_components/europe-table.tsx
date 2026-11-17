import { useTranslations } from "next-intl";
import { Panel } from "@/src/components/panel";
import { MANAGED_ROW, TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import type { EuropeCompetitionView } from "@/src/db/europe-view";
import { countryName } from "@/src/i18n/countries";
import { formatGoalDifference } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { rankTone, type RankTone } from "../_lib/europe";

/** The columns after the club, in order: each has its short label and its full name in the europe messages. */
const COLUMNS = ["played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "goalDifference", "points"] as const;

/**
 * Each column's width. On a phone, the rank, the club, the matches played, the goal difference and the points, narrow
 * enough to hold at 360 px with the club on two lines; won, drawn and lost from md, the goals from lg.
 */
const COLUMN_CLASSES: Record<(typeof COLUMNS)[number], string> = {
  played: "w-11 max-sm:w-8",
  won: "hidden w-10 md:table-cell",
  drawn: "hidden w-10 md:table-cell",
  lost: "hidden w-10 md:table-cell",
  goalsFor: "hidden w-10 lg:table-cell",
  goalsAgainst: "hidden w-10 lg:table-cell",
  goalDifference: "w-13 max-sm:w-10",
  points: "w-13 max-sm:w-10",
};

const CELL = "px-2 max-sm:px-1";

const RANK_COLUMN = "w-11 max-sm:w-8";

/** A `tr` takes no border-radius: a clip rounds its background, the managed club's or the one under the pointer. */
const ROW = "border-b-0 [clip-path:inset(0_round_var(--radius-md))]";

/** The blue of the quarter-finals for the first four, a neutral pill for the play-offs; none below, out. */
const TONE_CLASSES: Record<RankTone, string> = {
  direct: "bg-primary text-primary-foreground",
  playoff: "bg-background",
};

const LEGEND: readonly RankTone[] = ["direct", "playoff"];

/** A European competition's league phase table: one table for all its clubs, each with its country. */
export function EuropeTable({ competition, className }: { competition: EuropeCompetitionView; className?: string }) {
  const t = useTranslations("europe");
  const tWorld = useTranslations("world");
  return (
    <Panel aria-labelledby="europe-table-title" className={cn("min-w-0 space-y-3 p-3 sm:p-5", className)}>
      <h3 id="europe-table-title" className="font-heading text-2xl leading-tight sm:text-[1.75rem]">
        {t("table.title")}
      </h3>
      <Table data-testid="europe-table" className="tabular-nums max-sm:text-[0.8125rem] lg:text-[0.9375rem]">
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(TABLE_HEAD, CELL, RANK_COLUMN)}>#</TableHead>
            <TableHead className={cn(TABLE_HEAD, CELL)}>{t("table.club")}</TableHead>
            {COLUMNS.map((column) => (
              <TableHead
                key={column}
                title={t(`table.columnTitles.${column}`)}
                className={cn(TABLE_HEAD, CELL, "text-right", COLUMN_CLASSES[column])}
              >
                {t(`table.columns.${column}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {competition.table.map((row) => {
            const tone = rankTone(row.rank);
            return (
              <TableRow
                key={row.clubSaveId}
                data-testid="europe-table-row"
                data-rank={row.rank}
                data-managed={row.isManaged || undefined}
                data-zone={tone ?? undefined}
                className={cn(TABLE_ROW, ROW, row.isManaged && MANAGED_ROW)}
              >
                <TableCell className={cn(TABLE_CELL, CELL, RANK_COLUMN)}>
                  <span
                    className={cn(
                      "grid size-6.5 place-items-center rounded-sm text-[0.8125rem] leading-none font-bold max-sm:size-5.5",
                      tone === null ? "text-muted-foreground" : TONE_CLASSES[tone],
                    )}
                  >
                    {row.rank}
                  </span>
                  {tone !== null && <span className="sr-only"> ({t(`table.zone.${tone}`)})</span>}
                </TableCell>
                {/* Never cut: on two lines if need be, its country under it. */}
                <TableCell
                  className={cn(TABLE_CELL, CELL, "py-1.5 leading-tight wrap-break-word whitespace-normal", !row.isManaged && "font-medium")}
                >
                  {row.name}
                  {row.isManaged && <span className="sr-only"> ({t("table.managed")})</span>}
                  <span data-country={row.country} className="block text-xs font-normal text-muted-foreground">
                    {countryName(row.country, tWorld)}
                  </span>
                </TableCell>
                {COLUMNS.map((column) => (
                  <TableCell
                    key={column}
                    data-column={column}
                    className={cn(
                      TABLE_CELL,
                      CELL,
                      "text-right",
                      COLUMN_CLASSES[column],
                      column === "points" ? "font-heading text-base font-bold lg:text-xl" : "text-muted-foreground",
                    )}
                  >
                    {column === "goalDifference" ? formatGoalDifference(row.goalDifference) : row[column]}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p data-testid="europe-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
        {LEGEND.map((tone) => (
          <span key={tone} className="inline-flex items-center gap-2">
            <span aria-hidden className={cn("size-3 rounded-xs", TONE_CLASSES[tone])} />
            {t(`table.legend.${tone}`)}
          </span>
        ))}
      </p>
    </Panel>
  );
}
