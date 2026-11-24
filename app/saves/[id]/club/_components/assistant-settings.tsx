"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { isNewVersionError } from "@/app/_lib/new-version";
import type { AssistantSettings as Settings } from "@/src/db/assistant-settings";
import { cn } from "@/src/lib/utils";
import { setAssistantSettingAction, type AssistantSetting } from "../actions";

/** One of the assistant's two settings: its name, a switch turned at once on the screen, and what it means now. */
function SettingSwitch({ saveId, setting, byAssistant }: { saveId: string; setting: AssistantSetting; byAssistant: boolean }) {
  const t = useTranslations("assistantSettings");
  const common = useTranslations("common");
  const router = useRouter();
  const [checked, setChecked] = useOptimistic(byAssistant);
  const [pending, startTransition] = useTransition();
  const explainId = `settings-assistant-${setting}-explain`;

  const toggle = () => {
    const next = !checked;
    startTransition(async () => {
      setChecked(next);
      try {
        const result = await setAssistantSettingAction(saveId, setting, next);
        if (result.ok) {
          toast.success(result.message);
          return;
        }
        toast.error(result.message);
        router.refresh();
      } catch (error) {
        toast.error(common(isNewVersionError(error) ? "newVersion" : "wakingUp"));
      }
    });
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={explainId}
        aria-busy={pending}
        disabled={pending}
        onClick={toggle}
        data-testid={`settings-assistant-${setting}`}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70"
      >
        <span className="text-[0.9375rem] font-semibold">{t(`${setting}.label`)}</span>
        <span aria-hidden className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted")}>
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-5 rounded-full bg-primary-foreground shadow-sm transition-transform",
              checked && "translate-x-5",
            )}
          />
        </span>
      </button>
      <p id={explainId} className="text-sm text-muted-foreground">
        {t(`${setting}.${checked ? "on" : "off"}`)}
      </p>
    </div>
  );
}

/**
 * « Ton adjoint s'occupe de », first of the settings (docs/design/simplification.md § 6.8): the line-up before each match
 * and the contracts at the season's turn, each with its switch.
 */
export function AssistantSettings({ saveId, settings }: { saveId: string; settings: Settings }) {
  const t = useTranslations("assistantSettings");
  return (
    <section aria-labelledby="settings-assistant-title" data-testid="settings-assistant" className="space-y-3">
      <h3 id="settings-assistant-title" className="eyebrow text-highlight">
        {t("title")}
      </h3>
      <SettingSwitch saveId={saveId} setting="lineup" byAssistant={settings.lineupByAssistant} />
      <SettingSwitch saveId={saveId} setting="contracts" byAssistant={settings.contractsByAssistant} />
    </section>
  );
}
