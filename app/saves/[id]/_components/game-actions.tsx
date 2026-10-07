"use client";

import { CalendarDaysIcon, ChevronDownIcon, FastForwardIcon, PlayIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { advanceSeasonAction, playMatchdayAction, type GameActionResult } from "../actions";
import { useSimulation, type SimulationTarget } from "./simulation";

const SIMULATION_TARGETS: { label: string; target: SimulationTarget }[] = [
  { label: "Prochain match de mon club", target: { kind: "next-match" } },
  { label: "Fin du mois", target: { kind: "month-end" } },
  { label: "Fermeture du mercato", target: { kind: "window-close" } },
  { label: "Fin de saison", target: { kind: "season-end" } },
];

/** « Simuler jusqu'à… » and its targets; the last one lets the manager pick a day in the calendar. */
function SimulateMenu({ disabled }: { disabled: boolean }) {
  const simulation = useSimulation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="h-9 px-3 font-heading text-base font-semibold" />}
        disabled={disabled || simulation.busy}
      >
        <FastForwardIcon data-icon="inline-start" />
        Simuler jusqu&apos;à…
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-60">
        {SIMULATION_TARGETS.map(({ label, target }) => (
          <DropdownMenuItem key={label} onClick={() => simulation.start(target)}>
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={simulation.beginPicking}>
          <CalendarDaysIcon />
          Choisir une date dans le calendrier…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type GameActionsProps = {
  saveId: string;
  seasonFinished: boolean;
};

/** The main button of the navigation bar, in the club accent, with the quick simulation menu during a season. */
export function GameActions({ saveId, seasonFinished }: GameActionsProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (action: (saveId: string) => Promise<GameActionResult>) =>
    startTransition(async () => {
      try {
        const result = await action(saveId);
        if (result.redirectTo !== undefined) {
          router.push(result.redirectTo);
        } else if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("L'action a échoué. Réessayez.");
      }
    });

  const className = "h-9 px-4 font-heading text-base font-semibold";

  return seasonFinished ? (
    <Button variant="club" className={className} disabled={pending} onClick={() => run(advanceSeasonAction)}>
      <FastForwardIcon data-icon="inline-start" className="fill-current" />
      {pending ? "Préparation de la saison…" : "Passer à la saison suivante"}
    </Button>
  ) : (
    <div className="flex items-center gap-2">
      <SimulateMenu disabled={pending} />
      <Button variant="club" className={className} disabled={pending} onClick={() => run(playMatchdayAction)}>
        <PlayIcon data-icon="inline-start" className="fill-current" />
        {pending ? "Simulation…" : "Jouer la journée"}
      </Button>
    </div>
  );
}
