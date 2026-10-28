import Link from "next/link";
import { getCurrentUser } from "@/src/auth/current-user";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { listClubsByCompetition } from "@/src/db/clubs";
import { countOwnedSaves, listSaves } from "@/src/db/saves";
import { seasonLabel, WORLD_START_DATE, WORLD_START_YEAR } from "@/src/engine/world";
import { formatDate } from "@/src/lib/format";
import { canCreateSave } from "@/src/lib/limits";
import { cn } from "@/src/lib/utils";
import { AccountPanel } from "./_components/account-panel";
import { BrandFooter } from "./_components/brand-footer";
import { BrandHeader } from "./_components/brand-header";
import { ChallengeTeaser } from "./_components/challenge-teaser";
import { CreateSaveForm } from "./_components/create-save-form";
import { DeleteAccountDialog } from "./_components/delete-account-dialog";
import { DeleteSaveDialog } from "./_components/delete-save-dialog";
import { SaveLimitNotice } from "./_components/save-limit-notice";
import { ACCOUNT_DELETED_PARAM } from "./_lib/account";

export const dynamic = "force-dynamic";

// The Server Actions of this page include the creation of a save (createSave), several thousand rows in one
// transaction: up to 60 s, as the purge route.
export const maxDuration = 60;

/** The season a new save starts, above the creation form. */
function NewSaveIntro() {
  return (
    <div className="space-y-1">
      <h2 className="eyebrow">Nouvelle partie</h2>
      <p className="text-xs text-muted-foreground">La saison {seasonLabel(WORLD_START_YEAR)} commence le {formatDate(WORLD_START_DATE)}.</p>
    </div>
  );
}

/**
 * A first visit, without a cookie or a session: play in one click. The logo and the catchphrase, the creation form
 * at once (the first save creates the anonymous player), and Google second, for a player coming back on another device.
 */
async function WelcomePage({ accountDeleted }: { accountDeleted: boolean }) {
  const competitions = await listClubsByCompetition();
  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-md space-y-8 px-4 py-10">
        <BrandHeader logoHeight={80} />
        {accountDeleted && (
          <p role="status" lang="fr" className="rounded-lg border bg-card px-4 py-3 text-sm">
            Ton compte et tes parties ont été supprimés.
          </p>
        )}
        <section lang="fr" className="space-y-4 rounded-lg border bg-card p-5">
          <NewSaveIntro />
          <CreateSaveForm competitions={competitions} />
        </section>
        <ChallengeTeaser />
        <section lang="fr" className="space-y-3">
          <p className="text-sm text-muted-foreground">Déjà une carrière sur un autre appareil ?</p>
          <AccountPanel user={null} />
        </section>
        <BrandFooter />
      </div>
    </main>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  if (user === null) {
    return <WelcomePage accountDeleted={(await searchParams)[ACCOUNT_DELETED_PARAM] === "1"} />;
  }
  const [saves, competitions, ownedSaves] = await Promise.all([
    listSaves(user),
    listClubsByCompetition(),
    countOwnedSaves(user.id),
  ]);
  const atLimit = !canCreateSave(user.kind, ownedSaves);

  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <BrandHeader logoHeight={80} />
          <AccountPanel user={user} />
        </div>

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

          <div className="space-y-5">
            <section className="space-y-4 rounded-lg border bg-card p-5">
              <NewSaveIntro />
              {atLimit ? <SaveLimitNotice user={user} /> : <CreateSaveForm competitions={competitions} />}
            </section>
            <ChallengeTeaser />
          </div>
        </div>

        <BrandFooter>{user.kind === "REGISTERED" && <DeleteAccountDialog />}</BrandFooter>
      </div>
    </main>
  );
}
