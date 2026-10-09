import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/src/auth/current-user";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { prisma } from "@/src/db/client";
import { getAdminStats, STATS_DAYS } from "@/src/db/stats";
import { cn } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Statistiques", robots: { index: false } };

const MB = 1024 * 1024;
const megabytes = (bytes: number): string => `${(bytes / MB).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
const share = (part: number | null, whole: number): string =>
  part === null ? "—" : whole === 0 ? "0" : `${part} (${Math.round((part / whole) * 100)} %)`;
/** « 2026-10-09 » as « 09/10 ». */
const shortDay = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

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

  return (
    <main lang="fr" className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
        <h1 className="font-heading text-3xl font-bold">Statistiques</h1>

        <section className="grid gap-3 sm:grid-cols-4">
          <Figure label="Utilisateurs" value={users} />
          <Figure label="Anonymes" value={stats.usersByKind.anonymous} />
          <Figure label="Comptes Google" value={stats.usersByKind.registered} />
          <Figure label="Parties" value={stats.saves} />
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="eyebrow">Nouveaux utilisateurs et rétention, {STATS_DAYS} derniers jours (UTC)</h2>
          <p className="text-xs text-muted-foreground">
            Par jour de création : revenus le lendemain (J+1) et une semaine après (J+7). « — » : inconnu, tant que le
            jour de retour n&apos;est pas terminé, ou pour un jour antérieur au premier enregistrement des visites (UserDay).
          </p>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={TABLE_HEAD}>Jour</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>Nouveaux</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>J+1</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>J+7</TableHead>
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
          <h2 className="eyebrow">Base de données : {megabytes(stats.databaseBytes)}</h2>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={TABLE_HEAD}>Table</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>Données</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>Index</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>Total</TableHead>
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
