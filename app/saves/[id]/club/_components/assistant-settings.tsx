"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { isNewVersionError } from "@/app/_lib/new-version";
import type { AssistantSettings as Settings } from "@/src/db/assistant-settings";
import { ASSISTANT_POLICIES, type AssistantPolicy } from "@/src/engine/assistant-policy";
import { cn } from "@/src/lib/utils";
import { setAssistantPolicyAction, setAssistantSettingAction, type AssistantSetting } from "../actions";

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
 * « Sa consigne » (docs/design/effectif-adjoint.md § 2.1, § 2.6): « Meilleur onze » or « Lancer les jeunes », each with what
 * it does, chosen at once on the screen as a switch is turned. Greyed, and saying why, while the player keeps both the
 * line-up and the contracts: the policy waits until he hands one of them back.
 */
function PolicyChoice({ saveId, policy, active }: { saveId: string; policy: AssistantPolicy; active: boolean }) {
  const t = useTranslations("assistantSettings.policy");
  const common = useTranslations("common");
  const router = useRouter();
  const [chosen, setChosen] = useOptimistic(policy);
  const [pending, startTransition] = useTransition();
  const inactiveId = "settings-assistant-policy-inactive";

  const choose = (next: AssistantPolicy) => {
    startTransition(async () => {
      setChosen(next);
      try {
        const result = await setAssistantPolicyAction(saveId, next);
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

  // Never disabled while a choice is saved: a keyboard moving through the radios would lose its focus at each one, and
  // a second choice is saved after the first.
  return (
    <fieldset
      disabled={!active}
      aria-busy={pending}
      aria-describedby={active ? undefined : inactiveId}
      data-testid="settings-assistant-policy"
      data-policy={chosen}
      data-active={active}
      className="min-w-0 space-y-1"
    >
      <legend className="eyebrow mb-2 text-highlight">{t("title")}</legend>
      {ASSISTANT_POLICIES.map((value) => {
        const checked = chosen === value;
        return (
          <label
            key={value}
            data-testid={`settings-assistant-policy-${value.toLowerCase()}`}
            className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-1.5", !active && "cursor-default opacity-60")}
          >
            {/* Out of sight, the radio a keyboard moves through with its arrows and a screen reader names. */}
            <input
              type="radio"
              name="assistant-policy"
              value={value}
              checked={checked}
              onChange={() => choose(value)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                checked ? "border-primary" : "border-muted-foreground",
              )}
            >
              <span className={cn("size-2.5 rounded-full", checked && "bg-primary")} />
            </span>
            <span className="min-w-0 space-y-0.5">
              <span className="block text-[0.9375rem] font-semibold">{t(`${value}.label`)}</span>
              <span className="block text-sm text-muted-foreground">{t(`${value}.about`)}</span>
            </span>
          </label>
        );
      })}
      {!active && (
        <p id={inactiveId} data-testid="settings-assistant-policy-inactive" className="text-sm text-muted-foreground">
          {t("inactive")}
        </p>
      )}
    </fieldset>
  );
}

/**
 * « Ton adjoint s'occupe de », first of the settings (docs/design/simplification.md § 6.8): the line-up before each match
 * and the contracts at the season's turn, each with its switch; then his policy in them (« Sa consigne »,
 * docs/design/effectif-adjoint.md § 2.6), beside them where the settings are wide enough, under them otherwise.
 */
export function AssistantSettings({ saveId, settings }: { saveId: string; settings: Settings }) {
  const t = useTranslations("assistantSettings");
  return (
    <section aria-labelledby="settings-assistant-title" data-testid="settings-assistant" className="@container">
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 @2xl:grid-cols-2">
        <div className="space-y-3">
          <h3 id="settings-assistant-title" className="eyebrow text-highlight">
            {t("title")}
          </h3>
          <SettingSwitch saveId={saveId} setting="lineup" byAssistant={settings.lineupByAssistant} />
          <SettingSwitch saveId={saveId} setting="contracts" byAssistant={settings.contractsByAssistant} />
        </div>
        <PolicyChoice
          saveId={saveId}
          policy={settings.policy}
          active={settings.lineupByAssistant || settings.contractsByAssistant}
        />
      </div>
    </section>
  );
}
