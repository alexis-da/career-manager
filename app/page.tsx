import Link from "next/link";
import { getCurrentUser } from "@/src/auth/current-user";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { listClubsByCompetition } from "@/src/db/clubs";
import { listSaves } from "@/src/db/saves";
import { seasonLabel, WORLD_START_DATE, WORLD_START_YEAR } from "@/src/engine/world";
import { formatDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { BrandHeader } from "./_components/brand-header";
import { CreateSaveForm } from "./_components/create-save-form";
import { DeleteSaveDialog } from "./_components/delete-save-dialog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // The player's saves and the inherited ones; without the lw_uid cookie, the inherited ones only.
  const user = await getCurrentUser();
  const [saves, competitions] = await Promise.all([listSaves(user), listClubsByCompetition()]);

  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <BrandHeader logoHeight={80} />

        <p lang="fr" className="text-muted-foreground">
          Reprenez une carrière ou commencez-en une nouvelle.
        </p>
        <div lang="fr" className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
          <section className="space-y-3 rounded-lg border bg-card p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="eyebrow">Parties</h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                {saves.length === 0 ? "Aucune partie pour l'instant." : `${saves.length} partie${saves.length > 1 ? "s" : ""}`}
              </p>
            </div>
            {saves.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className={TABLE_HEAD}>Nom</TableHead>
                    <TableHead className={TABLE_HEAD}>Manager</TableHead>
                    <TableHead className={TABLE_HEAD}>Club</TableHead>
                    <TableHead className={TABLE_HEAD}>Date en jeu</TableHead>
                    <TableHead className={cn(TABLE_HEAD, "text-right")}>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saves.map((save) => (
                    <TableRow key={save.id} data-save-name={save.name} className={TABLE_ROW}>
                      <TableCell className={cn(TABLE_CELL, "font-semibold")}>
                        <Link href={`/saves/${save.id}`} className="hover:underline">
                          {save.name}
                        </Link>
                      </TableCell>
                      <TableCell className={TABLE_CELL}>{save.managerName}</TableCell>
                      <TableCell className={TABLE_CELL}>
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-4 w-1 shrink-0 rounded-full"
                            style={{ background: save.club.primaryColor }}
                          />
                          {save.club.name}
                        </span>
                      </TableCell>
                      <TableCell className={cn(TABLE_CELL, "tabular-nums")}>{formatDate(save.currentDate)}</TableCell>
                      <TableCell className={cn(TABLE_CELL, "text-right")}>
                        <DeleteSaveDialog saveId={save.id} saveName={save.name} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="space-y-4 rounded-lg border bg-card p-5">
            <div className="space-y-1">
              <h2 className="eyebrow">Nouvelle partie</h2>
              <p className="text-xs text-muted-foreground">La saison {seasonLabel(WORLD_START_YEAR)} commence le {formatDate(WORLD_START_DATE)}.</p>
            </div>
            <CreateSaveForm competitions={competitions} />
          </section>
        </div>
      </div>
    </main>
  );
}
