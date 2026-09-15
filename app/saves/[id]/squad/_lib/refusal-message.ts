import type { TransferRefusal } from "@/src/db/transfers";
import type { OfferRefusal } from "@/src/engine/transfer-ai";
import { formatMoney } from "@/src/lib/format";

/** The reason an action was refused, as the player of the game should read it. */
export function refusalMessage(
  reason: TransferRefusal,
  refusals: readonly OfferRefusal[] = [],
  minimumWage?: number,
): string {
  switch (reason) {
    case "window_closed":
      return "Le mercato est fermé : contrats et transferts se traitent du 1er juillet au 31 août, puis en janvier.";
    case "not_available":
      return "Ce joueur ne fait plus partie de votre effectif.";
    case "insufficient_budget":
      return "Votre budget transferts ne couvre pas cette opération.";
    case "wage_budget_exceeded":
      return "Ce salaire ferait dépasser votre budget salarial.";
    case "club_refused":
      return "Le club vendeur refuse : l'indemnité proposée est inférieure à son prix.";
    case "no_offer":
      return "Aucun club ne peut acheter ce joueur pour le moment : réputation, budget ou masse salariale insuffisants.";
    case "player_refused":
      if (refusals.includes("club_reputation_too_low")) {
        return "Le joueur refuse : la réputation du club est trop faible à ses yeux.";
      }
      return minimumWage === undefined
        ? "Le joueur refuse : le salaire proposé est trop bas."
        : `Le joueur refuse : il demande au moins ${formatMoney(minimumWage)} par saison.`;
  }
}
