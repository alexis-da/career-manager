"use client";

// A client component for its weight, not its clicks: the page holds every table of the save and shows one, and a closed tab
// never renders a client child. From the server, the cells of all ten would reach the browser, a megabyte, for one on screen.

import { useTranslations } from "next-intl";
import { MANAGED_ROW, TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import type { CompetitionTable } from "@/src/db/standings";
import { PROMOTION_RELEGATION } from "@/src/engine/balance";
import { countryOf } from "@/src/engine/promotion";
import { cn } from "@/src/lib/utils";
import { FormLetters } from "./form-letters";
import { FullTableToggle } from "./full-table";

/** The columns after the club, in order: each has its short label and its full name in the standings messages. */
const COLUMNS = ["played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "goalDifference", "form", "points"] as const;

/** A column of the full table only: always rendered, one DOM for the two tables, and hidden from the compact one. */
const FULL_ONLY = "hidden w-10 group-data-full/standings:table-cell";

/** Each column's width. On a phone, narrow enough for the compact table to hold at 360 px, the club on two lines. */
const COLUMN_CLASSES: Record<(typeof COLUMNS)[number], string> = {
  played: "w-11 max-sm:w-7",
  won: FULL_ONLY,
  drawn: FULL_ONLY,
  lost: FULL_ONLY,
  goalsFor: FULL_ONLY,
  goalsAgainst: FULL_ONLY,
  goalDifference: "w-13 max-sm:w-10",
  form: "w-20 max-sm:w-15",
  points: "w-13 max-sm:w-9",
};

const CELL = "px-2 max-sm:px-1";

/** The rank's width is exact on a phone: the club's cell sticks right after it. */
const RANK_COLUMN = "w-11 max-sm:left-0 max-sm:w-8 max-sm:min-w-8";

/**
 * Too wide for a phone's frame, the full table gives each column its narrowest width; this one stays wide enough to keep a
 * name on two lines.
 */
const CLUB_COLUMN = "max-sm:left-8 max-sm:group-data-full/standings:min-w-29";

/** A `tr` takes no border-radius: a clip rounds its background, the managed club's or the one under the pointer. */
const ROW = "h-10.5 border-b-0 [clip-path:inset(0_round_var(--radius-md))] max-sm:h-9";

/**
 * On a phone, the full table scrolls sideways in its frame, the only one to: its rank and club stay at the left, its
 * points at the right, the other columns scroll between them. Opaque, those cells hide what passes under them; the
 * managed club's keep its tint.
 */
const PHONE_STICKY = "max-sm:group-data-full/standings:sticky max-sm:group-data-full/standings:z-10 max-sm:group-data-full/standings:bg-card";
const PHONE_STICKY_MANAGED = "max-sm:group-data-full/standings:bg-secondary";

type Zone = "title" | "promotion" | "relegation";

const ZONE_COLORS: Record<Zone, string> = {
  title: "bg-primary text-primary-foreground",
  promotion: "bg-primary text-primary-foreground",
  relegation: "bg-(--club) text-(--club-fg)",
};

/**
 * Where a rank stands when the country has two divisions: the champion and the places going down in the first, the
 * places going up in the second.
 */
function zoneOf(table: CompetitionTable, rank: number, divided: boolean): Zone | null {
  const moves = PROMOTION_RELEGATION[countryOf(table.code)];
  if (!divided || moves === undefined) {
    return null;
  }
  if (table.tier === 2) {
    return rank <= moves ? "promotion" : null;
  }
  return rank === 1 ? "title" : rank > table.rows.length - moves ? "relegation" : null;
}

const legendZones = (tier: number): Zone[] => (tier === 2 ? ["promotion"] : ["title", "relegation"]);

/** A league's table, compact or full (FullTableFrame), with its legend and the way from one to the other. */
export function StandingsTable({ table, divided }: { table: CompetitionTable; divided: boolean }) {
  const t = useTranslations("standings");
  return (
    <div className="space-y-2">
      <Table className="tabular-nums max-sm:text-[0.8125rem] lg:text-[0.9375rem]" data-testid="standings-table">
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(TABLE_HEAD, CELL, RANK_COLUMN, PHONE_STICKY)}>#</TableHead>
            <TableHead className={cn(TABLE_HEAD, CELL, CLUB_COLUMN, PHONE_STICKY)}>{t("club")}</TableHead>
            {COLUMNS.map((column) => (
              <TableHead
                key={column}
                className={cn(TABLE_HEAD, CELL, "text-right", COLUMN_CLASSES[column], column === "points" && cn(PHONE_STICKY, "max-sm:right-0"))}
                title={t(`columnTitles.${column}`)}
              >
                {t(`columns.${column}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => {
            const zone = zoneOf(table, row.rank, divided);
            const sticky = cn(PHONE_STICKY, row.isManaged && PHONE_STICKY_MANAGED);
            return (
              <TableRow
                key={row.club}
                data-managed={row.isManaged || undefined}
                data-zone={zone ?? undefined}
                className={cn(TABLE_ROW, ROW, row.isManaged && MANAGED_ROW)}
              >
                <TableCell className={cn(TABLE_CELL, CELL, RANK_COLUMN, sticky)}>
                  <span
                    className={cn(
                      "grid size-6.5 place-items-center rounded-sm text-[0.8125rem] leading-none font-bold max-sm:size-5.5",
                      zone === null ? "bg-background" : ZONE_COLORS[zone],
                    )}
                  >
                    {row.rank}
                  </span>
                  {zone !== null && <span className="sr-only"> ({t(`zone.${zone}`)})</span>}
                </TableCell>
                {/* Never cut: on two lines if need be, the only column to give way on a phone. */}
                <TableCell
                  className={cn(
                    TABLE_CELL,
                    CELL,
                    CLUB_COLUMN,
                    "leading-tight text-balance wrap-break-word whitespace-normal",
                    !row.isManaged && "font-medium",
                    sticky,
                  )}
                >
                  {row.clubName}
                  {row.isManaged && <span className="sr-only"> ({t("managed")})</span>}
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
                      column === "points" ? cn("font-heading text-base font-bold lg:text-xl", sticky, "max-sm:right-0") : "text-muted-foreground",
                    )}
                  >
                    {column === "form" ? (
                      <FormLetters form={row.form} />
                    ) : column === "goalDifference" && row.goalDifference > 0 ? (
                      `+${row.goalDifference}`
                    ) : (
                      row[column]
                    )}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {divided && (
          <p data-testid="standings-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
            {legendZones(table.tier).map((zone) => (
              <span key={zone} className="inline-flex items-center gap-2">
                <span aria-hidden className={cn("size-3 rounded-xs", ZONE_COLORS[zone])} />
                {t(`legend.${zone}`)}
              </span>
            ))}
          </p>
        )}
        <FullTableToggle />
      </div>
    </div>
  );
}
