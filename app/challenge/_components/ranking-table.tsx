import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import type { ChallengeRankingRow } from "@/src/db/challenge-view";
import { formatGoalDifference } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

/**
 * A week's ranking: rank, first name, points, goal difference, goals scored. The viewer's line stands out; an anonymous
 * viewer's own line, outside the ranking, is greyed, with what puts it in.
 */
export function RankingTable({ rows, empty, label }: { rows: ChallengeRankingRow[]; empty: string; label: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow className="border-border hover:bg-transparent">
          <TableHead className={cn(TABLE_HEAD, "w-14")}>Rang</TableHead>
          <TableHead className={TABLE_HEAD}>Joueur</TableHead>
          <TableHead className={cn(TABLE_HEAD, "text-right")} title="Points">
            Pts
          </TableHead>
          <TableHead className={cn(TABLE_HEAD, "text-right")} title="Différence de buts">
            Diff.
          </TableHead>
          <TableHead className={cn(TABLE_HEAD, "text-right")} title="Buts marqués">
            Buts
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={`${row.rank ?? "own"}-${index}`}
            data-ranking-row={row.rank === null ? "own" : row.rank}
            className={cn(TABLE_ROW, row.isViewer && "font-semibold", row.rank === null && "text-muted-foreground italic")}
          >
            <TableCell className={cn(TABLE_CELL, "tabular-nums")}>{row.rank ?? "—"}</TableCell>
            <TableCell className={TABLE_CELL}>
              {row.name}
              {row.rank === null && <span className="ml-2 text-xs not-italic">Connecte-toi pour apparaître au classement</span>}
            </TableCell>
            <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{row.points}</TableCell>
            <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{formatGoalDifference(row.goalDiff)}</TableCell>
            <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{row.goalsFor}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
