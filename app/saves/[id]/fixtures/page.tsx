import type { Metadata } from "next";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { getManagedClubCalendar, type FixtureWithEvents } from "@/src/db/calendar";
import { formatShortDate } from "@/src/lib/format";
import { MatchSheetDialog } from "./_components/match-sheet-dialog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Calendrier" };

type Outcome = { label: string; variant: "secondary" | "outline" | "destructive" };

function outcomeOf(fixture: FixtureWithEvents): Outcome | null {
  if (!fixture.played || fixture.homeGoals === null || fixture.awayGoals === null) {
    return null;
  }
  const [scored, conceded] = fixture.home.isManaged
    ? [fixture.homeGoals, fixture.awayGoals]
    : [fixture.awayGoals, fixture.homeGoals];
  if (scored > conceded) {
    return { label: "V", variant: "secondary" };
  }
  return scored === conceded ? { label: "N", variant: "outline" } : { label: "D", variant: "destructive" };
}

export default async function FixturesPage({ params }: PageProps<"/saves/[id]/fixtures">) {
  const { id } = await params;
  const calendar = await getManagedClubCalendar(id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendrier</h1>
        {calendar.startYear !== null && (
          <p className="text-sm text-muted-foreground tabular-nums">
            Saison {calendar.startYear}-{String(calendar.startYear + 1).slice(2)} · cliquez sur un score pour la feuille
            de match
          </p>
        )}
      </div>

      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">J.</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Adversaire</TableHead>
            <TableHead>Lieu</TableHead>
            <TableHead className="text-center">Score</TableHead>
            <TableHead className="w-12 text-center">
              <span className="sr-only">Résultat</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calendar.fixtures.map((fixture) => {
            const opponent = fixture.home.isManaged ? fixture.away : fixture.home;
            const outcome = outcomeOf(fixture);
            return (
              <TableRow key={fixture.id}>
                <TableCell className="text-right text-muted-foreground">{fixture.round}</TableCell>
                <TableCell>{formatShortDate(fixture.scheduledAt)}</TableCell>
                <TableCell className="font-medium">{opponent.name}</TableCell>
                <TableCell className="text-muted-foreground">{fixture.home.isManaged ? "Domicile" : "Extérieur"}</TableCell>
                <TableCell className="text-center">
                  {fixture.played ? <MatchSheetDialog fixture={fixture} /> : <span className="text-muted-foreground">–</span>}
                </TableCell>
                <TableCell className="text-center">
                  {outcome !== null && <Badge variant={outcome.variant}>{outcome.label}</Badge>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
