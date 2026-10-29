import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { competitionName } from "@/src/i18n/countries";
import type { Metadata } from "next";
import { requireOwnedSave } from "@/src/auth/current-user";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { getLatestSeasonTables, type CompetitionTable } from "@/src/db/standings";
import { PROMOTION_RELEGATION } from "@/src/engine/balance";
import { countryOf } from "@/src/engine/promotion";
import { seasonLabel } from "@/src/engine/world";
import { cn } from "@/src/lib/utils";
import { Panel } from "../_components/panel";
import { MANAGED_ROW, TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("standings"))("title") };
}

/** Active tab: the club accent at 18 % with an accent underline. */
const ACTIVE_TAB = cn(
  "h-9 flex-none rounded-md px-3 text-sm",
  "data-active:bg-(--club)/18 data-active:font-semibold data-active:text-foreground",
  "dark:data-active:bg-(--club)/18 dark:data-active:border-transparent",
  "group-data-[variant=line]/tabs-list:data-active:bg-(--club)/18 dark:group-data-[variant=line]/tabs-list:data-active:bg-(--club)/18",
  "after:bg-(--club)",
);

/** The table's figures, in order: each has its short label and its full name in the standings messages. */
const COLUMNS = ["played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "goalDifference", "points"] as const;

type Zone = "promotion" | "relegation" | null;

/** Where a rank stands when the country has two divisions: the places going up from the second, down from the first. */
function zoneOf(table: CompetitionTable, rank: number, divided: boolean): Zone {
  const moves = PROMOTION_RELEGATION[countryOf(table.code)];
  if (!divided || moves === undefined) {
    return null;
  }
  if (table.tier === 2 && rank <= moves) {
    return "promotion";
  }
  return table.tier === 1 && rank > table.rows.length - moves ? "relegation" : null;
}

function StandingsTable({ table, divided }: { table: CompetitionTable; divided: boolean }) {
  const t = useTranslations("standings");
  return (
    <Panel className="p-2 sm:p-3">
      <Table className="tabular-nums" data-testid="standings-table">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={cn(TABLE_HEAD, "w-12 text-right")}>#</TableHead>
            <TableHead className={TABLE_HEAD}>{t("club")}</TableHead>
            {COLUMNS.map((column) => (
              <TableHead key={column} className={cn(TABLE_HEAD, "text-right")} title={t(`columnTitles.${column}`)}>
                {t(`columns.${column}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => {
            const zone = zoneOf(table, row.rank, divided);
            return (
              <TableRow
                key={row.club}
                data-managed={row.isManaged || undefined}
                data-zone={zone ?? undefined}
                className={cn(TABLE_ROW, row.isManaged && MANAGED_ROW)}
              >
                <TableCell
                  className={cn(
                    TABLE_CELL,
                    "text-right text-muted-foreground",
                    divided && "border-l-[3px] border-l-transparent",
                    zone === "promotion" && "border-l-(--club)",
                    zone === "relegation" && "border-l-muted-foreground/50",
                  )}
                >
                  {row.rank}
                  {zone !== null && <span className="sr-only"> ({t(`zone.${zone}`)})</span>}
                </TableCell>
                <TableCell className={TABLE_CELL}>
                  {row.clubName}
                  {row.isManaged && <span className="sr-only"> ({t("managed")})</span>}
                </TableCell>
                {COLUMNS.map((column) => (
                  <TableCell
                    key={column}
                    data-column={column}
                    className={cn(TABLE_CELL, "text-right", column === "points" && "font-heading text-base font-bold")}
                  >
                    {column === "goalDifference" && row.goalDifference > 0 ? `+${row.goalDifference}` : row[column]}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {divided && (
        <p data-testid="standings-legend" className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-3 text-xs text-muted-foreground">
          {table.tier === 2 ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-[3px] rounded-full bg-(--club)" /> {t("legend.promotion")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-[3px] rounded-full bg-muted-foreground/50" /> {t("legend.relegation")}
            </span>
          )}
        </p>
      )}
    </Panel>
  );
}

export default async function StandingsPage({ params }: PageProps<"/saves/[id]/standings">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const [t, tWorld, locale] = await Promise.all([getTranslations("standings"), getTranslations("world"), getLocale()]);
  const tables = await getLatestSeasonTables(id);
  const defaultTable = tables.find((table) => table.hasManagedClub) ?? tables[0];

  if (defaultTable === undefined) {
    return (
      <p data-testid="standings-empty" className="text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  // A save with the second divisions: a tab per country, then Division 1 / Division 2; otherwise a tab per competition.
  // By country, sorted by its name in the player's language.
  const countries = [...Map.groupBy(tables, (table) => table.country)].sort(([a], [b]) =>
    tWorld(`countries.${a}`).localeCompare(tWorld(`countries.${b}`), locale),
  );
  const divided = countries.some(([, divisions]) => divisions.length > 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 data-testid="standings-title" className="font-heading text-4xl font-bold">
          {t("title")}
        </h1>
        <p data-testid="standings-season" className="text-sm text-muted-foreground tabular-nums">
          {t("season", { season: seasonLabel(defaultTable.startYear) })}
        </p>
      </div>

      {divided ? (
        <Tabs defaultValue={defaultTable.country} className="gap-4">
          <TabsList
            variant="line"
            aria-label={t("countries")}
            className="h-auto flex-wrap gap-1 group-data-horizontal/tabs:h-auto"
          >
            {countries.map(([country]) => (
              <TabsTrigger key={country} value={country} className={ACTIVE_TAB} data-testid={`standings-country-${country}`}>
                {tWorld(`countries.${country}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {countries.map(([country, divisions]) => {
            const ordered = [...divisions].sort((a, b) => a.tier - b.tier);
            const shown = ordered.find((table) => table.hasManagedClub) ?? ordered[0];
            return (
              <TabsContent key={country} value={country}>
                <Tabs defaultValue={shown.code} className="gap-3">
                  <TabsList aria-label={t("divisions", { country: tWorld(`countries.${country}`) })} className="w-fit">
                    {ordered.map((table) => (
                      <TabsTrigger
                        key={table.code}
                        value={table.code}
                        className="px-4"
                        data-testid={`standings-division-${table.tier}`}
                      >
                        {t("division", { tier: table.tier })}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {ordered.map((table) => (
                    <TabsContent key={table.code} value={table.code}>
                      <StandingsTable table={table} divided />
                    </TabsContent>
                  ))}
                </Tabs>
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <Tabs defaultValue={defaultTable.code} className="gap-4">
          <TabsList variant="line" className="h-auto flex-wrap gap-1 group-data-horizontal/tabs:h-auto">
            {tables.map((table) => (
              <TabsTrigger
                key={table.code}
                value={table.code}
                className={ACTIVE_TAB}
                data-testid={`standings-competition-${table.code}`}
              >
                {competitionName(table.code, tWorld)}
              </TabsTrigger>
            ))}
          </TabsList>
          {tables.map((table) => (
            <TabsContent key={table.code} value={table.code}>
              <StandingsTable table={table} divided={false} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
