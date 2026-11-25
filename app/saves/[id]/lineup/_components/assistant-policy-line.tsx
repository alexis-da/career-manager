import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "@/src/components/link";
import type { AssistantPolicy } from "@/src/engine/assistant-policy";

/**
 * The reminder of the assistant's policy on his card of the line-up (docs/design/effectif-adjoint.md § 2.1, § 1.11):
 * « Consigne : Meilleur onze · Changer », the way to it in Club → Réglages. Nothing without one: a nation's editor.
 */
export function AssistantPolicyLine({ saveId, policy }: { saveId: string; policy: AssistantPolicy | undefined }) {
  const t = useTranslations("lineup.assistant.policy");
  const tPolicy = useTranslations("assistantSettings.policy");
  if (policy === undefined) {
    return null;
  }
  return (
    <p data-testid="lineup-assistant-policy" data-policy={policy} className="flex flex-wrap items-center gap-x-1.5 text-sm">
      <span>{t("label", { policy: tPolicy(`${policy}.label`) })}</span>
      <span aria-hidden>·</span>
      <Link
        href={`/saves/${saveId}/club#reglages`}
        data-testid="lineup-assistant-policy-change"
        className="inline-flex items-center font-semibold text-highlight hover:underline max-sm:min-h-11"
      >
        {t("change")}
        <ChevronRightIcon aria-hidden className="size-4" />
      </Link>
    </p>
  );
}
