"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/src/components/ui/button";
import { isNewVersionError } from "@/app/_lib/new-version";
import { playChallengeAction, type PlayChallengeState } from "../actions";

const INITIAL_STATE: PlayChallengeState = { message: null };

/**
 * The button, the screen's main action: busy while the save is created (some seconds for a world of 198 clubs), never
 * sent twice.
 */
function PlayButton() {
  const t = useTranslations("challenge");
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="club"
      size="lg"
      className="h-11 w-full px-4.5 text-[0.9375rem] font-bold sm:w-auto"
      disabled={pending}
      aria-busy={pending}
      data-testid="challenge-play"
    >
      {pending && <LoaderCircleIcon data-icon="inline-start" aria-hidden className="animate-spin" />}
      {pending ? t("creating") : t("play")}
    </Button>
  );
}

/** « Jouer le défi »: the week the page offers goes with it, so that the action refuses a challenge over since. */
export function PlayChallengeForm({ weekKey }: { weekKey: string }) {
  const common = useTranslations("common");
  const [state, formAction] = useActionState(async (previous: PlayChallengeState, formData: FormData) => {
    try {
      return await playChallengeAction(previous, formData);
    } catch (error) {
      if (isNewVersionError(error)) {
        return { message: common("newVersion") };
      }
      throw error;
    }
  }, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="weekKey" value={weekKey} />
      <PlayButton />
      {state.message !== null && (
        <p role="alert" className="text-sm text-destructive" data-testid="challenge-message">
          {state.message}
        </p>
      )}
    </form>
  );
}
