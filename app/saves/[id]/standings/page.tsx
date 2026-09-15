import type { Metadata } from "next";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { getLatestSeasonTables } from "@/src/db/standings";
import { cn } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Classement" };

/** Active tab in the managed club's accent. */
const ACTIVE_TAB =
  "data-active:bg-(--club) data-active:text-(--club-fg) dark:data-active:border-transparent dark:data-active:bg-(--club) dark:data-active:text-(--club-fg)";

const COLUMNS = [
  { key: "played", label: "J", title: "Joués" },
  { key: "won", label: "G", title: "Gagnés" },
  { key: "drawn", label: "N", title: "Nuls" },
  { key: "lost", label: "P", title: "Perdus" },
  { key: "goalsFor", label: "BP", title: "Buts pour" },
  { key: "goalsAgainst", label: "BC", title: "Buts contre" },
  { key: "goalDifference", label: "Diff.", title: "Différence de buts" },
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Classement</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          Saison {defaultTable.startYear}-{String(defaultTable.startYear + 1).slice(2)}
        </p>
      </div>

      <Tabs defaultValue={defaultTable.code}>
        <TabsList className="flex-wrap group-data-horizontal/tabs:h-auto">
          {tables.map((table) => (
            <TabsTrigger key={table.code} value={table.code} className={ACTIVE_TAB}>
              {table.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {tables.map((table) => (
          <TabsContent key={table.code} value={table.code}>
            <Table className="tabular-nums">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right">#</TableHead>
                  <TableHead>Club</TableHead>
                  {COLUMNS.map((column) => (
                    <TableHead key={column.key} className="text-right" title={column.title}>
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
                    className={cn(row.isManaged && "bg-muted/60 font-semibold")}
                  >
                    <TableCell className="text-right text-muted-foreground">{row.rank}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {row.clubName}
                        {row.isManaged && <Badge variant="outline">Votre club</Badge>}
                      </span>
                    </TableCell>
                    {COLUMNS.map((column) => (
                      <TableCell key={column.key} data-column={column.key} className="text-right">
                        {column.key === "goalDifference" && row.goalDifference > 0 ? `+${row.goalDifference}` : row[column.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
