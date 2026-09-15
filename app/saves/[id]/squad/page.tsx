import type { Metadata } from "next";
import { getSquadView } from "@/src/db/squad";
import { formatMoney } from "@/src/lib/format";
import { SquadTable } from "./_components/squad-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Effectif" };

export default async function SquadPage({ params }: PageProps<"/saves/[id]/squad">) {
  const { id } = await params;
  const squad = await getSquadView(id);
  const goalkeepers = squad.players.filter((player) => player.position === "GK").length;
  const payrollShare = squad.club.wageBudget === 0 ? 0 : Math.min(1, squad.club.payroll / squad.club.wageBudget);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Effectif</h1>
          <p className="text-sm text-muted-foreground">
            Cliquez sur un joueur pour sa fiche.{" "}
            {squad.windowOpen ? "Le mercato est ouvert." : "Le mercato est fermé : prolongations, libérations et ventes attendront."}
          </p>
        </div>
      </div>

      <dl className="grid gap-4 rounded-xl border bg-card p-4 text-sm tabular-nums sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Joueurs sous contrat</dt>
          <dd data-summary="players" className="text-2xl font-semibold">
            {squad.players.length}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gardiens</dt>
          <dd data-summary="goalkeepers" className="text-2xl font-semibold">
            {goalkeepers}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Masse salariale</dt>
          <dd className="space-y-1.5">
            <span className="text-2xl font-semibold">{formatMoney(squad.club.payroll)}</span>
            <span className="text-muted-foreground"> / {formatMoney(squad.club.wageBudget)}</span>
            <span className="block h-1.5 rounded-full bg-muted" aria-hidden>
              <span className="block h-1.5 rounded-full bg-foreground/60" style={{ width: `${payrollShare * 100}%` }} />
            </span>
          </dd>
        </div>
      </dl>

      <SquadTable
        saveId={id}
        players={squad.players}
        currentDate={squad.currentDate}
        startYear={squad.startYear}
        windowOpen={squad.windowOpen}
      />
    </div>
  );
}
