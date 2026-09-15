"use server";

import { revalidatePath } from "next/cache";
import {
  quoteTransfer,
  releasePlayer,
  releasePlayerSchema,
  renewContract,
  renewContractSchema,
  sellPlayer,
  sellPlayerSchema,
  type PlayerActionInput,
  type RenewContractInput,
} from "@/src/db/transfers";
import { formatDate, formatMoney } from "@/src/lib/format";
import { refusalMessage } from "./_lib/refusal-message";

export type SquadActionResult = {
  ok: boolean;
  message: string;
};

const INVALID_INPUT: SquadActionResult = {
  ok: false,
  message: "Proposition invalide : la durée va de 1 à 5 saisons et le salaire doit être un montant en euros.",
};

export async function renewContractAction(input: RenewContractInput): Promise<SquadActionResult> {
  const parsed = renewContractSchema.safeParse(input);
  if (!parsed.success) {
    return INVALID_INPUT;
  }
  const outcome = await renewContract(parsed.data);
  if (!outcome.ok) {
    const minimumWage =
      outcome.reason === "player_refused" ? (await quoteTransfer(parsed.data)).minimumWage : undefined;
    return { ok: false, message: refusalMessage(outcome.reason, outcome.refusals, minimumWage) };
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  const until = outcome.contractUntil === null ? "" : ` jusqu'au ${formatDate(outcome.contractUntil)}`;
  return { ok: true, message: `Contrat prolongé${until}, pour ${formatMoney(parsed.data.wage)} par saison.` };
}

export async function releasePlayerAction(input: PlayerActionInput): Promise<SquadActionResult> {
  const parsed = releasePlayerSchema.safeParse(input);
  if (!parsed.success) {
    return INVALID_INPUT;
  }
  const outcome = await releasePlayer(parsed.data);
  if (!outcome.ok) {
    return { ok: false, message: refusalMessage(outcome.reason, outcome.refusals) };
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return { ok: true, message: `Joueur libéré. Indemnité versée : ${formatMoney(outcome.fee)}.` };
}

export async function sellPlayerAction(input: PlayerActionInput): Promise<SquadActionResult> {
  const parsed = sellPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return INVALID_INPUT;
  }
  const outcome = await sellPlayer(parsed.data);
  if (!outcome.ok) {
    return { ok: false, message: refusalMessage(outcome.reason, outcome.refusals) };
  }
  revalidatePath(`/saves/${parsed.data.saveId}`, "layout");
  return { ok: true, message: `Joueur vendu pour ${formatMoney(outcome.fee)}.` };
}
