"use client";

import { FastForwardIcon, PlayIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { advanceSeasonAction, playMatchdayAction, type GameActionResult } from "../actions";

type GameActionsProps = {
  saveId: string;
  seasonFinished: boolean;
};

/** The main button of the navigation bar, in the club accent. */
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
    <Button variant="club" className={className} disabled={pending} onClick={() => run(playMatchdayAction)}>
      <PlayIcon data-icon="inline-start" className="fill-current" />
      {pending ? "Simulation…" : "Jouer la journée"}
    </Button>
  );
}
