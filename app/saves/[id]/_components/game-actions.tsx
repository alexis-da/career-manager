"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { advanceSeasonAction, playMatchdayAction, type GameActionResult } from "../actions";

type GameActionsProps = {
  saveId: string;
  seasonFinished: boolean;
};

export function GameActions({ saveId, seasonFinished }: GameActionsProps) {
  const [pending, startTransition] = useTransition();

  const run = (action: (saveId: string) => Promise<GameActionResult>) =>
    startTransition(async () => {
      try {
        const result = await action(saveId);
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("L'action a échoué. Réessayez.");
      }
    });

  return seasonFinished ? (
    <Button variant="club" size="lg" disabled={pending} onClick={() => run(advanceSeasonAction)}>
      {pending ? "Préparation de la saison…" : "Passer à la saison suivante"}
    </Button>
  ) : (
    <Button variant="club" size="lg" disabled={pending} onClick={() => run(playMatchdayAction)}>
      {pending ? "Simulation…" : "Jouer la journée"}
    </Button>
  );
}
