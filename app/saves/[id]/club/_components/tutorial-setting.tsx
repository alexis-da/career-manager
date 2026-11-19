"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { formatDayMonth } from "@/src/lib/format";
import type { TutorialSettingState } from "@/src/lib/tutorial";
import { cn } from "@/src/lib/utils";
import { resumeTutorialAction } from "../../tutorial/actions";
import { CLUB_CARD_LINK } from "./club-card";
import { SETTINGS_DETAIL as DETAIL, SETTINGS_NAME as NAME, SETTINGS_ROW as ROW } from "./settings-styles";

/**
 * The tutorial's line of the Settings, for the save it follows: « En cours · jour 3 », « Passé le 19/11 » with « Reprendre
 * le tutoriel » while something of it can still come, or « Terminé ». Taken up again, its bubbles come back at their
 * moment; nothing hidden again.
 */
export function TutorialSetting({ saveId, view }: { saveId: string; view: TutorialSettingState }) {
  const t = useTranslations("tutorial.settings");
  const tTutorial = useTranslations("tutorial");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const resume = () =>
    startTransition(async () => {
      if (await resumeTutorialAction(saveId)) {
        toast(tTutorial("resumed"));
      }
    });
  return (
    <div data-testid="settings-tutorial" data-state={view.state} className={ROW}>
      <div className="min-w-0 flex-1">
        <p className={NAME}>{t("title")}</p>
        <p className={cn(DETAIL, "tabular-nums")}>
          {view.state === "running"
            ? t("running", { day: view.day })
            : view.state === "skipped"
              ? t("skipped", { date: formatDayMonth(view.skippedAt, locale) })
              : t("ended")}
        </p>
      </div>
      {view.state === "skipped" && view.canResume && (
        <button type="button" onClick={resume} disabled={pending} data-testid="settings-tutorial-resume" className={CLUB_CARD_LINK}>
          {t("resume")}
        </button>
      )}
    </div>
  );
}
