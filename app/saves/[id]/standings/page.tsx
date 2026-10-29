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

export const metadata: Metadata = { title: "Classement" };

/** Active tab: the club accent at 18 % with an accent underline. */
const ACTIVE_TAB = cn(
  "h-9 flex-none rounded-md px-3 text-sm",
  "data-active:bg-(--club)/18 data-active:font-semibold data-active:text-foreground",
  "dark:data-active:bg-(--club)/18 dark:data-active:border-transparent",
  "group-data-[variant=line]/tabs-list:data-active:bg-(--club)/18 dark:group-data-[variant=line]/tabs-list:data-active:bg-(--club)/18",
  "after:bg-(--club)",
);

const COLUMNS = [
  { key: "played", label: "J", title: "Joués" },
  { key: "won", label: "G", title: "Gagnés" },
  { key: "drawn", label: "N", title: "Nuls" },
  { key: "lost", label: "P", title: "Perdus" },
  { key: "goalsFor", label: "BP", title: "Buts pour" },
  { key: "goalsAgainst", label: "BC", title: "Buts contre" },
  { key: "goalDifference", label: "Diff", title: "Différence de buts" },
  { key: "points", label: "Pts", title: "Points" },
] as const;

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

const ZONE_LABEL: Record<Exclude<Zone, null>, string> = {
  promotion: "place de montée",
  relegation: "place de descente",
};

function StandingsTable({ table, divided }: { table: CompetitionTable; divided: boolean }) {
  return (
    <Panel className="p-2 sm:p-3">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className={cn(TABLE_HEAD, "w-12 text-right")}>#</TableHead>
            <TableHead className={TABLE_HEAD}>Club</TableHead>
            {COLUMNS.map((column) => (
              <TableHead key={column.key} className={cn(TABLE_HEAD, "text-right")} title={column.title}>
                {column.label}
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
                  {zone !== null && <span className="sr-only"> ({ZONE_LABEL[zone]})</span>}
                </TableCell>
                <TableCell className={TABLE_CELL}>
                  {row.clubName}
                  {row.isManaged && <span className="sr-only"> (votre club)</span>}
                </TableCell>
                {COLUMNS.map((column) => (
                  <TableCell
                    key={column.key}
                    data-column={column.key}
                    className={cn(TABLE_CELL, "text-right", column.key === "points" && "font-heading text-base font-bold")}
                  >
                    {column.key === "goalDifference" && row.goalDifference > 0 ? `+${row.goalDifference}` : row[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {divided && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-3 text-xs text-muted-foreground">
          {table.tier === 2 ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-[3px] rounded-full bg-(--club)" /> Montée en Division 1
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-[3px] rounded-full bg-muted-foreground/50" /> Descente en Division 2
            </span>
          )}
        </p>
      )}
    </Panel>
  );
}

export default async function StandingsPage({ params }: PageProps<"/saves/[id]/standings">) {
  const [tWorld, locale] = await Promise.all([getTranslations("world"), getLocale()]);
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const tables = await getLatestSeasonTables(id);
  const defaultTable = tables.find((table) => table.hasManagedClub) ?? tables[0];

  if (defaultTable === undefined) {
    return <p className="text-muted-foreground">Aucune saison pour cette partie.</p>;
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
        <h1 className="font-heading text-4xl font-bold">Classement</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          Saison {seasonLabel(defaultTable.startYear)}
        </p>
      </div>

      {divided ? (
        <Tabs defaultValue={defaultTable.country} className="gap-4">
          <TabsList
            variant="line"
            aria-label="Pays"
            className="h-auto flex-wrap gap-1 group-data-horizontal/tabs:h-auto"
          >
            {countries.map(([country]) => (
              <TabsTrigger key={country} value={country} className={ACTIVE_TAB}>
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
                  <TabsList aria-label={`Division, ${tWorld(`countries.${country}`)}`} className="w-fit">
                    {ordered.map((table) => (
                      <TabsTrigger key={table.code} value={table.code} className="px-4">
                        Division {table.tier}
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
              <TabsTrigger key={table.code} value={table.code} className={ACTIVE_TAB}>
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
