import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { getLatestSeasonTables } from "@/src/db/standings";
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

export default async function StandingsPage({ params }: PageProps<"/saves/[id]/standings">) {
  const { id } = await params;
  const tables = await getLatestSeasonTables(id);
  const defaultTable = tables.find((table) => table.hasManagedClub) ?? tables[0];

  if (defaultTable === undefined) {
    return <p className="text-muted-foreground">Aucune saison pour cette partie.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-4xl font-bold">Classement</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          Saison {defaultTable.startYear}-{String(defaultTable.startYear + 1).slice(2)}
        </p>
      </div>

      <Tabs defaultValue={defaultTable.code} className="gap-4">
        <TabsList variant="line" className="h-auto flex-wrap gap-1 group-data-horizontal/tabs:h-auto">
          {tables.map((table) => (
            <TabsTrigger key={table.code} value={table.code} className={ACTIVE_TAB}>
              {table.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {tables.map((table) => (
          <TabsContent key={table.code} value={table.code}>
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
                  {table.rows.map((row) => (
                    <TableRow
                      key={row.club}
                      data-managed={row.isManaged || undefined}
                      className={cn(TABLE_ROW, row.isManaged && MANAGED_ROW)}
                    >
                      <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground")}>{row.rank}</TableCell>
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
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
