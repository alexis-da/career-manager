"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { requireOwnedSave } from "@/src/auth/current-user";
import {
  acceptSaleProposal,
  acceptSaleProposalSchema,
  keepSaleProposal,
  keepSaleProposalSchema,
  type AcceptSaleProposalInput,
} from "@/src/db/sale-proposals";
import { formatMoney } from "@/src/lib/format";
import type { ActionResult } from "../_lib/action-result";
import { refusalMessage } from "../_lib/refusal-message";

// The two gestures of a sale the assistant proposes (docs/design/simplification.md § 5.2), apart from the market's other
// actions: « Vendre · 3,4 M€ », sold at once at the offer its card shows, and « Garder ».

/**
 * Sells a proposed player at the offer his card shows. When that offer changed (another sale emptied a budget), nothing
 * is sold: the refusal gives the offer now, and the page, read again, shows it on the card.
 */
export async function acceptSaleProposalAction(input: AcceptSaleProposalInput): Promise<ActionResult> {
  const [t, tRefusals, locale] = await Promise.all([getTranslations("actions.saleProposals"), getTranslations("refusals"), getLocale()]);
  const parsed = acceptSaleProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const sale = await acceptSaleProposal(parsed.data);
  if (!sale.ok) {
    if (sale.reason === "offer_changed") {
      revalidatePath(`/saves/${parsed.data.saveId}/transfers`);
    }
    return {
      ok: false,
      message: refusalMessage(sale.reason, tRefusals, locale, sale.refusals, { target: "squad", changedOffer: sale.changedOffer }),
    };
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return { ok: true, message: t("sold", { player: sale.player, club: sale.club, fee: formatMoney(sale.fee, locale) }) };
}

/** « Garder »: the player stays, and is not proposed again before the window closes. */
export async function keepSaleProposalAction(input: { saveId: string; playerSaveId: string }): Promise<ActionResult> {
  const t = await getTranslations("actions.saleProposals");
  const parsed = keepSaleProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: t("invalid") };
  }
  await requireOwnedSave(parsed.data.saveId);
  const player = await keepSaleProposal(parsed.data.saveId, parsed.data.playerSaveId);
  if (player === null) {
    return { ok: false, message: t("keepRefused") };
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return { ok: true, message: t("kept", { player }) };
}
