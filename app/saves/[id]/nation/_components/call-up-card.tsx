import { TriangleAlertIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Panel } from "@/src/components/panel";
import type { NationalTeamView } from "@/src/db/national-view";
import { INTL_LOCALES } from "@/src/i18n/locale";
import { cn } from "@/src/lib/utils";
import { CallUpActions } from "./call-up-actions";
import type { CallUpSheetData } from "./call-up-sheet";

type CallUpCardProps = {
  saveId: string;
  view: NationalTeamView;
  sheet: CallUpSheetData | null; // his list's candidates, while it may still change
};

/**
 * His list for his next break or tournament (docs/design/selections.md § 5.2, 5.4, 9.7): whose it is, where its 23 come
 * from, and the conflict of interest made plain, his own club's players in it, who come back tired for its next Saturday
 * (after a tournament, rested by the summer); then what he can do with it, until the break or tournament starts.
 */
export function CallUpCard({ saveId, view, sheet }: CallUpCardProps) {
  const t = useTranslations("nationalTeam.callUp");
  const locale = useLocale();
  const { callUp } = view;
  const summer = view.session?.kind === "tournament";
  const own = callUp?.ownClub ?? [];
  return (
    <Panel aria-labelledby="nation-call-up-title" data-testid="nation-call-up" data-by={callUp?.by} className="space-y-3">
      <h2 id="nation-call-up-title" className="font-heading text-[1.75rem] leading-none">
        {t("title")}
        {callUp !== null && <span className="text-highlight"> · {t(`by.${callUp.by}`)}</span>}
      </h2>

      {callUp === null ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <>
          <p data-testid="nation-call-up-count" className="text-sm font-semibold">
            {t("count", { total: callUp.league + callUp.reserve, league: callUp.league, reserve: callUp.reserve })}
          </p>
          {own.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noneOfYours")}</p>
          ) : (
            <div data-testid="nation-call-up-own-club" data-count={own.length} className="space-y-1">
              <p className="text-sm font-semibold wrap-break-word">
                {t("ownClub", {
                  count: own.length,
                  names: new Intl.ListFormat(INTL_LOCALES[locale], { type: "conjunction" }).format(own.map((player) => player.name)),
                })}
              </p>
              <p className={cn("flex items-start gap-2 text-sm leading-snug", summer ? "text-muted-foreground" : "text-warning")}>
                {!summer && <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />}
                {t(summer ? "ownClubSummer" : "ownClubTired", { count: own.length })}
              </p>
            </div>
          )}
          {callUp.locked ? (
            <p data-testid="nation-call-up-locked" className="text-sm text-muted-foreground">
              {t(`locked.${summer ? "tournament" : "break"}`)}
            </p>
          ) : (
            <>
              {callUp.by === "assistant" && <p className="text-sm text-muted-foreground">{t("assistantGoes")}</p>}
              {sheet !== null && <CallUpActions saveId={saveId} byAssistant={callUp.by === "assistant"} sheet={sheet} />}
            </>
          )}
        </>
      )}
    </Panel>
  );
}
