"use client";

import { useTranslations } from "next-intl";
import { useOptimistic } from "react";
import { cn } from "@/src/lib/utils";
import { setNationFriendliesAction } from "../actions";
import { useNationAction } from "./use-nation-action";

/**
 * « L'adjoint joue les amicaux »: on, his assistant plays his nation's friendlies without a stop; off, the game stops
 * before them as before his other matches. Turned at once on the screen, the server's answer then standing.
 */
export function FriendliesSwitch({ saveId, byAssistant }: { saveId: string; byAssistant: boolean }) {
  const t = useTranslations("nationalTeam.friendlies");
  const [checked, setChecked] = useOptimistic(byAssistant);
  const { pending, run } = useNationAction();

  const toggle = () => {
    const next = !checked;
    run(() => {
      setChecked(next);
      return setNationFriendliesAction(saveId, next);
    });
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby="nation-friendlies-explain"
        aria-busy={pending}
        disabled={pending}
        onClick={toggle}
        data-testid="nation-delegate-friendlies"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70"
      >
        <span className="text-[0.9375rem] font-semibold">{t("label")}</span>
        <span aria-hidden className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted")}>
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-5 rounded-full bg-primary-foreground shadow-sm transition-transform",
              checked && "translate-x-5",
            )}
          />
        </span>
      </button>
      <p id="nation-friendlies-explain" className="text-sm text-muted-foreground">
        {t(checked ? "on" : "off")}
      </p>
    </div>
  );
}
