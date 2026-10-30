import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser, isAdmin } from "@/src/auth/current-user";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { prisma } from "@/src/db/client";
import { getAdminStats, STATS_DAYS } from "@/src/db/stats";
import { INTL_LOCALES } from "@/src/i18n/locale";
import { cn } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("adminStats"))("title"), robots: { index: false } };
}

const MB = 1024 * 1024;
/** « 2026-10-09 » as « 09/10 », day first in both languages. */
const shortDay = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
/** The first steps' table on a phone: narrower gutters, so that it holds in its frame at 360 px, in both languages. */
const TIGHT_ON_PHONE = "max-sm:px-1.5";

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="eyebrow">{label}</p>
      <p className="font-heading text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** The administrator's figures (ADMIN_EMAIL): 404 for anyone else, signed out included, as a page that does not exist. */
export default async function AdminStatsPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    notFound();
  }
  // Not simulation code: the figures are about real days.
  const stats = await getAdminStats(prisma, new Date());
  const users = stats.usersByKind.anonymous + stats.usersByKind.registered;
  const [t, locale] = await Promise.all([getTranslations("adminStats"), getLocale()]);
  const size = new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 1 });
  const megabytes = (bytes: number): string => t("megabytes", { size: size.format(bytes / MB) });
  const share = (part: number | null, whole: number): string =>
    part === null ? "—" : whole === 0 ? "0" : t("share", { part, percent: Math.round((part / whole) * 100) });
  const newSaves = stats.firstSteps.reduce((sum, cohort) => sum + cohort.saves, 0);
  const firstMatches = stats.firstSteps.reduce((sum, cohort) => sum + cohort.firstMatches, 0);

  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
        <h1 className="font-heading text-3xl font-bold" data-testid="admin-stats-title">
          {t("title")}
        </h1>

        <section className="grid gap-3 sm:grid-cols-4">
          <Figure label={t("figures.users")} value={users} />
          <Figure label={t("figures.anonymous")} value={stats.usersByKind.anonymous} />
          <Figure label={t("figures.registered")} value={stats.usersByKind.registered} />
          <Figure label={t("figures.saves")} value={stats.saves} />
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="eyebrow">{t("retention", { days: STATS_DAYS })}</h2>
          <p className="text-xs text-muted-foreground">{t("retentionNote")}</p>
          <Table data-testid="admin-stats-cohorts">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={TABLE_HEAD}>{t("cohortColumns.day")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>{t("cohortColumns.users")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>{t("cohortColumns.day1")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>{t("cohortColumns.day7")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.cohorts.toReversed().map((cohort) => (
                <TableRow key={cohort.day} data-day={cohort.day} className={TABLE_ROW}>
                  <TableCell className={cn(TABLE_CELL, "tabular-nums")}>{shortDay(cohort.day)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{cohort.users}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{share(cohort.day1, cohort.users)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{share(cohort.day7, cohort.users)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="eyebrow">{t("firstSteps", { days: STATS_DAYS })}</h2>
          <p className="text-xs text-muted-foreground">{t("firstStepsNote")}</p>
          <p className="font-semibold tabular-nums" data-testid="admin-stats-first-steps-summary">
            {t("firstStepsSummary", { days: STATS_DAYS, saves: newSaves, share: share(firstMatches, newSaves) })}
          </p>
          {/* On a phone, without the lineups: five columns do not hold at 390 px. */}
          <Table data-testid="admin-stats-first-steps">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={cn(TABLE_HEAD, TIGHT_ON_PHONE)}>{t("firstStepsColumns.day")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_ON_PHONE, "text-right")}>{t("firstStepsColumns.saves")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right max-sm:hidden")}>{t("firstStepsColumns.lineups")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_ON_PHONE, "text-right")}>{t("firstStepsColumns.firstMatches")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, TIGHT_ON_PHONE, "text-right")}>{t("firstStepsColumns.tenMatches")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.firstSteps.toReversed().map((cohort) => (
                <TableRow key={cohort.day} data-day={cohort.day} className={TABLE_ROW}>
                  <TableCell className={cn(TABLE_CELL, TIGHT_ON_PHONE, "tabular-nums")}>{shortDay(cohort.day)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_ON_PHONE, "text-right tabular-nums")}>{cohort.saves}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right tabular-nums max-sm:hidden")}>{share(cohort.lineups, cohort.saves)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_ON_PHONE, "text-right tabular-nums")}>{share(cohort.firstMatches, cohort.saves)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, TIGHT_ON_PHONE, "text-right tabular-nums")}>{share(cohort.tenMatches, cohort.saves)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="eyebrow">{t("database", { size: megabytes(stats.databaseBytes) })}</h2>
          <Table data-testid="admin-stats-tables">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={TABLE_HEAD}>{t("tableColumns.table")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>{t("tableColumns.data")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>{t("tableColumns.indexes")}</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>{t("tableColumns.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.largestTables.map((table) => (
                <TableRow key={table.table} className={TABLE_ROW}>
                  <TableCell className={TABLE_CELL}>{table.table}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{megabytes(table.data)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{megabytes(table.indexes)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right tabular-nums")}>{megabytes(table.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
  );
}
