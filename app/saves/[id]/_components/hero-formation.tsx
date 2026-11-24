import { useTranslations } from "next-intl";
import type { FormationName } from "@/src/engine/formations";

/**
 * The hero's line on the club's eleven (docs/design/simplification.md § 3.4): « Onze de l'adjoint · 4-3-3 sentinelle »
 * while its assistant makes it, « Onze en 4-3-3 sentinelle » once the player makes his own.
 */
export function HeroFormation({ formation, byAssistant }: { formation: FormationName; byAssistant: boolean }) {
  const t = useTranslations("dashboardHero");
  const tFormations = useTranslations("formations");
  return (
    <p data-testid="hero-formation" data-by-assistant={byAssistant}>
      {t(byAssistant ? "assistantFormation" : "formation", { formation: tFormations(`label.${formation}`) })}
    </p>
  );
}
