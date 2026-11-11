import { useTranslations } from "next-intl";
import Link from "@/src/components/link";
import type { Dashboard } from "@/src/db/dashboard";
import { seasonLabel } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";

type DashboardTableProps = {
  saveId: string;
  dashboard: Dashboard;
  className?: string;
};

/** The league around the managed club: rank, club and points. The other columns are in the full table. */
export function DashboardTable({ saveId, dashboard, className }: DashboardTableProps) {
  const t = useTranslations("dashboard");
  const tWorld = useTranslations("world");
  const { competitionCode, startYear, table } = dashboard;
  return (
    <Panel className={cn("space-y-1.5", className)} data-testid="dashboard-table">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {/* On one line in a column of 300 px, whatever the country; narrower, the line never breaks at the season's hyphen. */}
        <h2 className="font-heading text-xl leading-tight">
          {competitionCode === null ? t("table") : competitionName(competitionCode, tWorld)}
          {startYear !== null && (
            <>
              {" · "}
              <span className="whitespace-nowrap">{seasonLabel(startYear)}</span>
            </>
          )}
        </h2>
        <Link
          href={`/saves/${saveId}/standings`}
          data-testid="dashboard-full-table"
          className="text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
        >
          {t("fullTable")}
        </Link>
      </div>
      <ul className="text-[0.9375rem] tabular-nums">
        {table.map((row) => (
          <li
            key={row.club}
            data-managed={row.isManaged || undefined}
            className={cn(
              "grid min-h-9.5 grid-cols-[1.75rem_minmax(0,1fr)_2.5rem] items-center px-2.5 py-1 leading-tight",
              row.isManaged && "rounded-md bg-secondary font-bold",
            )}
          >
            {/* Before a club's first match, its place is only the alphabet's. */}
            <span className={cn(!row.isManaged && "text-muted-foreground")}>{row.played === 0 ? "—" : row.rank}</span>
            <span className="text-balance wrap-break-word">{row.clubName}</span>
            <span className="text-right font-bold">
              <span aria-hidden>{row.points}</span>
              <span className="sr-only">{t("points", { count: row.points })}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
