"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/src/components/ui/button";
import { isNewVersionError, NEW_VERSION_MESSAGE } from "@/app/_lib/new-version";
import { playChallengeAction, type PlayChallengeState } from "../actions";

const INITIAL_STATE: PlayChallengeState = { message: null };

/** The button: busy while the save is created (some seconds for a world of 198 clubs), never sent twice. */
function PlayButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending} aria-busy={pending}>
      {pending && <LoaderCircleIcon data-icon="inline-start" aria-hidden className="animate-spin" />}
      {pending ? "Création de ta partie…" : "Jouer le défi"}
    </Button>
  );
}

/** « Jouer le défi »: the week the page offers goes with it, so that the action refuses a challenge over since. */
export function PlayChallengeForm({ weekKey }: { weekKey: string }) {
  const [state, formAction] = useActionState(async (previous: PlayChallengeState, formData: FormData) => {
    try {
      return await playChallengeAction(previous, formData);
    } catch (error) {
      if (isNewVersionError(error)) {
        return { message: NEW_VERSION_MESSAGE };
      }
      throw error;
    }
  }, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="weekKey" value={weekKey} />
      <PlayButton />
      {state.message !== null && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
