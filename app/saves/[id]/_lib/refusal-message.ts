import type { TransferRefusal } from "@/src/db/transfers";
import type { OfferRefusal } from "@/src/engine/transfer-ai";
import { formatDate, formatMoney } from "@/src/lib/format";

/** Figures that make a refusal precise. All optional: without them, the message stays general. */
export type RefusalContext = {
  target?: "squad" | "market"; // a player of the managed club, or one it wants to sign
  fee?: number; // euros offered
  wage?: number; // euros per season offered
  budget?: number; // euros the managed club can spend
  wageRoom?: number; // euros per season left under its wage budget
  clubName?: string; // the selling club
  askingPrice?: number; // euros it asks
  minimumWage?: number; // euros per season the player asks
  nextWindowOpensOn?: Date;
};

/** The reason an action was refused, as the player of the game should read it. */
export function refusalMessage(
  reason: TransferRefusal,
  refusals: readonly OfferRefusal[] = [],
  context: RefusalContext = {},
): string {
  switch (reason) {
    case "window_closed":
      return context.nextWindowOpensOn === undefined
        ? "Le mercato est fermé : contrats et transferts se traitent du 1er juillet au 31 août, puis en janvier."
        : `Mercato fermé : la prochaine fenêtre ouvre le ${formatDate(context.nextWindowOpensOn)}.`;
    case "not_available":
      return context.target === "market"
        ? "Ce joueur n'est plus disponible : il a changé de club ou quitté le monde."
        : "Ce joueur ne fait plus partie de votre effectif.";
    case "insufficient_budget":
      return context.fee !== undefined && context.budget !== undefined
        ? `Budget insuffisant : l'indemnité de ${formatMoney(context.fee)} dépasse votre budget transferts de ${formatMoney(context.budget)}.`
        : "Budget insuffisant : votre budget transferts ne couvre pas cette opération.";
    case "wage_budget_exceeded":
      return context.wage !== undefined && context.wageRoom !== undefined
        ? `Masse salariale dépassée : ${formatMoney(context.wage)} par saison, pour une marge restante de ${formatMoney(Math.max(0, context.wageRoom))}.`
        : "Masse salariale dépassée : ce salaire ferait dépasser votre budget salarial.";
    case "club_refused": {
      const club = context.clubName ?? "Le club vendeur";
      return context.askingPrice === undefined
        ? `${club} refuse : l'indemnité proposée est inférieure à son prix.`
        : `${club} refuse : il demande au moins ${formatMoney(context.askingPrice)}.`;
    }
    case "no_offer":
      return "Aucun club ne peut acheter ce joueur pour le moment : réputation, budget ou masse salariale insuffisants.";
    case "player_refused":
      if (refusals.includes("club_reputation_too_low")) {
        return "Le joueur refuse : la réputation du club est trop faible à ses yeux.";
      }
      return context.minimumWage === undefined
        ? "Le joueur refuse : le salaire proposé est trop bas."
        : `Le joueur refuse : il demande au moins ${formatMoney(context.minimumWage)} par saison.`;
  }
}
