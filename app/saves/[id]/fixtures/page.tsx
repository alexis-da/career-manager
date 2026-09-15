import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { getManagedClubCalendar } from "@/src/db/calendar";
import { formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../_components/panel";
import { ResultPill } from "../_components/result-pill";
import { resultFor } from "../_lib/results";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { MatchSheetDialog } from "./_components/match-sheet-dialog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Calendrier" };

export default async function FixturesPage({ params }: PageProps<"/saves/[id]/fixtures">) {
  const { id } = await params;
  const calendar = await getManagedClubCalendar(id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-4xl font-bold">Calendrier</h1>
        {calendar.startYear !== null && (
          <p className="text-sm text-muted-foreground tabular-nums">
            Saison {calendar.startYear}-{String(calendar.startYear + 1).slice(2)} · cliquez sur un score pour la feuille de
            match
          </p>
        )}
      </div>

      <Panel className="p-2 sm:p-3">
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className={cn(TABLE_HEAD, "w-14 text-right")}>J.</TableHead>
              <TableHead className={TABLE_HEAD}>Date</TableHead>
              <TableHead className={TABLE_HEAD}>Adversaire</TableHead>
              <TableHead className={TABLE_HEAD}>Lieu</TableHead>
              <TableHead className={cn(TABLE_HEAD, "text-center")}>Score</TableHead>
              <TableHead className={cn(TABLE_HEAD, "w-14 text-center")}>
                <span className="sr-only">Résultat</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calendar.fixtures.map((fixture) => {
              const opponent = fixture.home.isManaged ? fixture.away : fixture.home;
              const result =
                fixture.played && fixture.homeGoals !== null && fixture.awayGoals !== null
                  ? resultFor(fixture.homeGoals, fixture.awayGoals, fixture.home.isManaged)
                  : null;
              return (
                <TableRow key={fixture.id} className={TABLE_ROW}>
                  <TableCell className={cn(TABLE_CELL, "text-right text-muted-foreground")}>{fixture.round}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "first-letter:uppercase")}>{formatShortDate(fixture.scheduledAt)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "font-medium")}>{opponent.name}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-muted-foreground")}>
                    {fixture.home.isManaged ? "Domicile" : "Extérieur"}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-center")}>
                    {fixture.played ? <MatchSheetDialog fixture={fixture} /> : <span className="text-muted-foreground">–</span>}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-center")}>{result !== null && <ResultPill result={result} />}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
