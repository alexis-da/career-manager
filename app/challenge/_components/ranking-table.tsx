import { useTranslations } from "next-intl";
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
  const t = useTranslations("challenge.table");
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow className="border-border hover:bg-transparent">
          <TableHead className={cn(TABLE_HEAD, "w-14")}>{t("rank")}</TableHead>
          <TableHead className={TABLE_HEAD}>{t("player")}</TableHead>
          <TableHead className={cn(TABLE_HEAD, "text-right")} title={t("pointsTitle")}>
            {t("points")}
          </TableHead>
          <TableHead className={cn(TABLE_HEAD, "text-right")} title={t("goalDiffTitle")}>
            {t("goalDiff")}
          </TableHead>
          <TableHead className={cn(TABLE_HEAD, "text-right")} title={t("goalsForTitle")}>
            {t("goalsFor")}
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
            <TableCell className={cn(TABLE_CELL, "whitespace-normal")}>
              {row.rank === null ? t("you") : (row.name ?? t("anonymous"))}
              {/* On a line of its own: on a phone, the scores stay in view. */}
              {row.rank === null && <span className="block pb-1 text-xs not-italic">{t("signInToRank")}</span>}
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
