import type { TransferRefusal } from "@/src/db/transfers";
import type { OfferRefusal } from "@/src/engine/transfer-ai";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
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

/** The reason an action was refused, as the player of the game should read it, in their language. */
export function refusalMessage(
  reason: TransferRefusal,
  t: Translator<"refusals">,
  locale: Locale,
  refusals: readonly OfferRefusal[] = [],
  context: RefusalContext = {},
): string {
  const money = (euros: number): string => formatMoney(euros, locale);
  switch (reason) {
    case "window_closed":
      return context.nextWindowOpensOn === undefined
        ? t("windowClosed")
        : t("windowClosedUntil", { date: formatDate(context.nextWindowOpensOn, locale) });
    case "not_available":
      return context.target === "market" ? t("notAvailableMarket") : t("notAvailableSquad");
    case "insufficient_budget":
      return context.fee !== undefined && context.budget !== undefined
        ? t("insufficientBudgetFor", { fee: money(context.fee), budget: money(context.budget) })
        : t("insufficientBudget");
    case "wage_budget_exceeded":
      return context.wage !== undefined && context.wageRoom !== undefined
        ? t("wageBudgetExceededBy", { wage: money(context.wage), wageRoom: money(Math.max(0, context.wageRoom)) })
        : t("wageBudgetExceeded");
    case "club_refused": {
      const club = context.clubName ?? t("sellingClub");
      return context.askingPrice === undefined
        ? t("clubRefused", { club })
        : t("clubRefusedAsking", { club, askingPrice: money(context.askingPrice) });
    }
    case "no_offer":
      return t("noOffer");
    case "player_refused":
      if (refusals.includes("club_reputation_too_low")) {
        return t("playerRefusedReputation");
      }
      return context.minimumWage === undefined
        ? t("playerRefused")
        : t("playerRefusedAsking", { minimumWage: money(context.minimumWage) });
  }
}
