import { useTranslations } from "next-intl";
import { TABLE_HEAD } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import type { ChallengeRankingRow } from "@/src/db/challenge-view";
import { formatGoalDifference } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

/** The five columns hold at 360 px: less room around them on a phone, the name going to the line. */
const HEAD = cn(TABLE_HEAD, "h-7 max-sm:px-2");
const CELL = "px-3 py-1 max-sm:px-2";

/**
 * A week's ranking: rank, first name, points, goal difference, goals scored. Each line is a strip, drawn by its cells: a
 * row has no corners. The viewer's stands out in blue; an anonymous viewer's own line, outside the ranking, stays greyed,
 * with what puts it in. The name's column takes the room the others leave, whatever the width.
 */
export function RankingTable({ rows, empty, label }: { rows: ChallengeRankingRow[]; empty: string; label: string }) {
  const t = useTranslations("challenge.table");
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <Table aria-label={label} className="border-separate border-spacing-y-1.5 text-[0.9375rem]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(HEAD, "w-14")}>{t("rank")}</TableHead>
          <TableHead className={cn(HEAD, "w-full")}>{t("player")}</TableHead>
          <TableHead className={cn(HEAD, "text-right")} title={t("pointsTitle")}>
            {t("points")}
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")} title={t("goalDiffTitle")}>
            {t("goalDiff")}
          </TableHead>
          <TableHead className={cn(HEAD, "text-right")} title={t("goalsForTitle")}>
            {t("goalsFor")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => {
          const outside = row.rank === null;
          const figures = cn(CELL, "text-right tabular-nums", !row.isViewer && "text-muted-foreground");
          return (
            <TableRow
              key={`${row.rank ?? "own"}-${index}`}
              data-ranking-row={row.rank === null ? "own" : row.rank}
              className={cn(
                "h-11.5 hover:bg-transparent *:first:rounded-l-lg *:last:rounded-r-lg",
                outside && "text-muted-foreground italic",
                row.isViewer && !outside ? "font-bold text-primary-foreground *:bg-primary" : "*:bg-card",
              )}
            >
              <TableCell className={cn(CELL, "font-heading text-xl leading-none tabular-nums", !row.isViewer && "text-highlight")}>
                {row.rank ?? "—"}
              </TableCell>
              <TableCell className={cn(CELL, "whitespace-normal wrap-anywhere")}>
                {outside ? t("you") : (row.name ?? t("anonymous"))}
                {/* On a line of its own: on a phone, the scores stay in view. */}
                {outside && <span className="block text-xs not-italic">{t("signInToRank")}</span>}
              </TableCell>
              <TableCell className={cn(CELL, "text-right font-bold tabular-nums")}>{row.points}</TableCell>
              <TableCell className={figures}>{formatGoalDifference(row.goalDiff)}</TableCell>
              <TableCell className={figures}>{row.goalsFor}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
