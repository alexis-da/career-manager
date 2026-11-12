import { useTranslations } from "next-intl";
import type { AssistantWord } from "@/src/lib/session-end";
import { cn } from "@/src/lib/utils";

/**
 * The assistant's word after a defeat (assistantWordAfter): under the dashboard's last match, and in the « À demain »
 * card after a live match or a simulation. Never after a win or a draw.
 */
export function AssistantWordLine({ word, className }: { word: AssistantWord; className?: string }) {
  const t = useTranslations("assistantWord");
  return (
    <p data-testid="assistant-word" data-word={word} className={cn("rounded-lg bg-background p-3 text-sm leading-snug", className)}>
      <span className="font-semibold">{t("label")}</span> {t(word)}
    </p>
  );
}
