"use client";

import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { MissionTier } from "@/src/lib/missions";
import { cn } from "@/src/lib/utils";
import { changeMissionAction } from "../actions";

/** A way on from the missions' card: 44 px high on a phone, never a full orange. */
const LINK = "text-sm font-semibold max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

/**
 * « Changer de mission », once a day on a mission not started: a first touch asks, the second changes it. A slip of the
 * finger never spends the day's change.
 */
export function ChangeMissionButton({ saveId, tier, mission }: { saveId: string; tier: MissionTier; mission: string }) {
  const t = useTranslations("missions.change");
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  const change = () => {
    startTransition(async () => {
      try {
        const result = await changeMissionAction(saveId, tier);
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error(t("refusals.started"));
      }
      setAsking(false);
    });
  };

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        data-testid="mission-change"
        title={t("about")}
        className={cn(LINK, "inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground")}
      >
        <RefreshCwIcon aria-hidden className="size-3.5" />
        {t("open")}
      </button>
    );
  }
  return (
    <div data-testid="mission-change-confirm" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-sm leading-snug">{t("confirm", { mission })}</p>
      <button
        type="button"
        onClick={change}
        disabled={pending}
        data-testid="mission-change-yes"
        className={cn(LINK, "text-(--club) hover:text-(--club-hover) disabled:opacity-60")}
      >
        {pending ? t("pending") : t("yes")}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        disabled={pending}
        data-testid="mission-change-no"
        className={cn(LINK, "text-muted-foreground hover:text-foreground")}
      >
        {t("no")}
      </button>
    </div>
  );
}
