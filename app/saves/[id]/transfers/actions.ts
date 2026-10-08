"use server";

import { revalidatePath } from "next/cache";
import { requireOwnedSave } from "@/src/auth/current-user";
import { getOfferFacts } from "@/src/db/market";
import {
  makeTransferOffer,
  makeTransferOfferSchema,
  signFreeAgent,
  signFreeAgentSchema,
  type MakeTransferOfferInput,
  type SignFreeAgentInput,
  type TransferOutcome,
} from "@/src/db/transfers";
import { formatDate, formatMoney } from "@/src/lib/format";
import type { ActionResult } from "../_lib/action-result";
import { refusalMessage } from "../_lib/refusal-message";

const INVALID_INPUT: ActionResult = {
  ok: false,
  message: "Proposition invalide : la durée va de 1 à 5 saisons, l'indemnité et le salaire sont des montants entiers en euros.",
};

type Refused = Extract<TransferOutcome, { ok: false }>;

/** The refusal with the figures behind it: budget, wage room, the selling club's price, the player's wage. */
async function explainRefusal(
  outcome: Refused,
  offer: { saveId: string; playerSaveId: string; wage: number; fee?: number },
): Promise<ActionResult> {
  const facts = await getOfferFacts(offer.saveId, offer.playerSaveId);
  return {
    ok: false,
    message: refusalMessage(outcome.reason, outcome.refusals, {
      target: "market",
      fee: offer.fee,
      wage: offer.wage,
      budget: facts.budget,
      wageRoom: facts.wageRoom,
      clubName: facts.clubName ?? undefined,
      askingPrice: facts.quote.askingPrice,
      minimumWage: facts.quote.minimumWage,
      nextWindowOpensOn: facts.nextWindowOpensOn,
    }),
  };
}

const until = (contractUntil: Date | null): string =>
  contractUntil === null ? "" : ` jusqu'au ${formatDate(contractUntil)}`;

export async function signFreeAgentAction(input: SignFreeAgentInput): Promise<ActionResult> {
  const parsed = signFreeAgentSchema.safeParse(input);
  if (!parsed.success) {
    return INVALID_INPUT;
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await signFreeAgent(parsed.data);
  if (!outcome.ok) {
    return explainRefusal(outcome, parsed.data);
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return {
    ok: true,
    message: `Contrat signé${until(outcome.contractUntil)}, pour ${formatMoney(parsed.data.wage)} par saison.`,
  };
}

export async function makeTransferOfferAction(input: MakeTransferOfferInput): Promise<ActionResult> {
  const parsed = makeTransferOfferSchema.safeParse(input);
  if (!parsed.success) {
    return INVALID_INPUT;
  }
  await requireOwnedSave(parsed.data.saveId);
  const outcome = await makeTransferOffer(parsed.data);
  if (!outcome.ok) {
    return explainRefusal(outcome, parsed.data);
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return {
    ok: true,
    message: `Offre acceptée : transfert pour ${formatMoney(outcome.fee)}, contrat${until(outcome.contractUntil)} à ${formatMoney(parsed.data.wage)} par saison.`,
  };
}
