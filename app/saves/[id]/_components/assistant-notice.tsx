import { useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { Button } from "@/src/components/ui/button";
import type { AssistantSettings } from "@/src/db/assistant-settings";
import { cn } from "@/src/lib/utils";
import { closeAssistantNoticeAction } from "../club/actions";

/**
 * The announcement of the simplification (docs/design/simplification.md § 7), once in each career from before it: what
 * the assistant now does in this one (a line-up the player saved stays his), and the way to his settings. « Compris »
 * closes it for good, a form that works before the page's script has run; the settings' link leaves it open.
 */
export function AssistantNotice({ saveId, settings, className }: { saveId: string; settings: AssistantSettings; className?: string }) {
  const t = useTranslations("assistantNotice");
  return (
    <section
      aria-labelledby="assistant-notice-title"
      data-testid="assistant-notice"
      className={cn("space-y-3 rounded-card border bg-card p-5", className)}
    >
      <p className="eyebrow text-highlight">{t("label")}</p>
      <h2 id="assistant-notice-title" className="font-heading text-xl">
        {t("title")}
      </h2>
      <p className="text-[0.9375rem]">{t("money")}</p>
      <ul className="list-disc space-y-1 pl-5 text-[0.9375rem]">
        <li data-testid="assistant-notice-lineup">{t(settings.lineupByAssistant ? "lineupAssistant" : "lineupPlayer")}</li>
        <li data-testid="assistant-notice-contracts">{t(settings.contractsByAssistant ? "contractsAssistant" : "contractsPlayer")}</li>
        <li>{t("sales")}</li>
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <form action={closeAssistantNoticeAction.bind(null, saveId)}>
          <Button type="submit" variant="outline" data-testid="assistant-notice-close" className="max-sm:min-h-11">
            {t("close")}
          </Button>
        </form>
        <Link
          href={`/saves/${saveId}/club#reglages`}
          data-testid="assistant-notice-settings"
          className="text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
        >
          {t("settings")}
        </Link>
      </div>
    </section>
  );
}
