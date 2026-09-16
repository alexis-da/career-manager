import type { Metadata } from "next";
import { getSquadView } from "@/src/db/squad";
import { formatMillions } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { SquadTable } from "./_components/squad-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Effectif" };

/** From this share of the wage budget, the payroll shows as a warning. */
const PAYROLL_WARNING_SHARE = 0.9;

export default async function SquadPage({ params }: PageProps<"/saves/[id]/squad">) {
  const { id } = await params;
  const squad = await getSquadView(id);
  const players = squad.players.length;
  const goalkeepers = squad.players.filter((player) => player.position === "GK").length;
  const payrollShare = squad.club.wageBudget === 0 ? 0 : squad.club.payroll / squad.club.wageBudget;

  const header = (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-heading text-4xl font-bold">Effectif</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          <span data-summary="players">{players}</span> joueur{players > 1 ? "s" : ""} ·{" "}
          <span data-summary="goalkeepers">{goalkeepers}</span> gardien{goalkeepers > 1 ? "s" : ""} · masse salariale{" "}
          <span className={cn(payrollShare >= PAYROLL_WARNING_SHARE && "text-warning")}>
            {formatMillions(squad.club.payroll)} / {formatMillions(squad.club.wageBudget)} M€
          </span>
        </p>
      </div>
      {!squad.windowOpen && (
        <p className="text-xs text-muted-foreground">
          Mercato fermé : prolongations, libérations et ventes attendront sa réouverture.
        </p>
      )}
    </div>
  );

  return (
    <SquadTable
      saveId={id}
      header={header}
      players={squad.players}
      currentDate={squad.currentDate}
      startYear={squad.startYear}
      windowOpen={squad.windowOpen}
      nextWindowOpensOn={squad.nextWindowOpensOn}
    />
  );
}
