/**
 * The hooks of the simplification's measures (docs/design/simplification.md § 11; npm run measure:assistant): what the
 * measures need from the game once the chantier lands, and that today's game does not have. Each hook is defined here
 * under the name the script imports. A stub stands for the game's function until it exists: then replace the stub by an
 * import of the game's function, or by an adapter when its shape differs, and nothing else changes in the script.
 *
 * A stub throws NotAvailableBeforeSimplification when it is called, and the script checks the hooks of the modes it is
 * asked for before playing anything (requireHook): against today's game, a mode of the game after the change is « not
 * available before the simplification »; against the game after it, a mode whose hook is still stubbed here is refused
 * too, so that nothing is ever measured half-way.
 */
import { getSaleProposals } from "../src/db/sale-proposals";
import { sellPlayer } from "../src/db/transfers";
import * as balance from "../src/engine/balance";
import { Prisma } from "../src/generated/prisma/client";

/** A mode or a hook of the game after the simplification, asked of today's game. */
export class NotAvailableBeforeSimplification extends Error {
  constructor(what: string) {
    super(`${what}: not available before the simplification`);
    this.name = "NotAvailableBeforeSimplification";
  }
}

/**
 * Whether the game has the simplification: its squad limit of 30 players in balance.ts (SQUAD_LIMIT, § 1.4), or the
 * career's line-up setting in the schema (Save.lineupByAssistant, § 12). Read at run time, so that this file compiles
 * against the game before the change as after it.
 */
export function simplificationLanded(): boolean {
  return "SQUAD_LIMIT" in balance || "lineupByAssistant" in Prisma.SaveScalarFieldEnum;
}

// The mark of a hook's stub, which threw when called until the game provided the hook. Every hook is now the game's
// own function (24/11): the frozen copy of this file in the baseline's worktree still has its stubs.
const STUB = Symbol("stub");

/** Whether a hook is still its stub here. */
export function isStub(hook: unknown): boolean {
  return typeof hook === "function" && STUB in hook;
}

/**
 * Refuses a mode whose hook is a stub: before the simplification, the mode is not available; after it, the hook has to
 * be wired here to the game's function first.
 */
export function requireHook(hook: unknown, mode: string): void {
  if (typeof hook !== "function" || !(STUB in hook)) {
    return;
  }
  if (!simplificationLanded()) {
    throw new NotAvailableBeforeSimplification(mode);
  }
  throw new Error(
    `${mode}: the game has the simplification, but scripts/simplification-hooks.ts still stubs ${String(hook[STUB])}: ` +
      "wire it to the game's function before measuring",
  );
}

// ------------------------------------------------------------------ Line-up and contracts settings (§ 2.3, § 3.3)

/**
 * HOOK setLineupByAssistant (§ 3.3, Save.lineupByAssistant): who fields the managed club's eleven before each match, its
 * assistant (true, a new career's default after the change) or the player (false: his saved line-up, selectLineup when
 * he saved none). The game's function behind the « Composition » setting of Club → Réglages, without its action's checks.
 */
export { setLineupByAssistant } from "../src/db/assistant-settings";

/**
 * HOOK setContractsByAssistant (§ 2.3, Save.contractsByAssistant): who decides the managed club's contracts ending on
 * 30 June at each transition, its assistant (true, the default after the change) or the player (false: each of them
 * leaves free, as in today's game). The game's function behind the « Contrats » setting, as above.
 */
export { setContractsByAssistant } from "../src/db/assistant-settings";

/** What an assistant did to the managed club's contracts at a transition (§ 2.1): its renewals, releases and signings. */
export type ContractMoves = { renewals: number; releases: number; signings: number };

/**
 * HOOK contractMovesOf (§ 2.1, SeasonBudget.contractMoves): what the game's assistant did to the managed club's contracts
 * at the transition that opened a season, when that transition's preseason does not say it (PreseasonSummary.managed).
 * Null until the game keeps them: today only the measurement option of advanceToNextSeason (assistantContracts) has an
 * assistant, and its preseason says what it did. Wire it to a reader of SeasonBudget.contractMoves once it exists.
 */
export const contractMovesOf: (saveId: string, startYear: number) => Promise<ContractMoves | null> = async () => null;

// ------------------------------------------------------------------ Sales proposed by the assistant (§ 5)

/** A sale the managed club's assistant proposes (§ 5.1): the player, the best offer for him in euros, and its club (ClubSave.id). */
export type ProposedSale = { playerSaveId: string; offer: number; buyerId: string };

/**
 * HOOK saleProposalsOf (§ 5.1): the sales the managed club's assistant proposes at the save's current date, the best
 * offer first, as « Ton adjoint propose » shows them (three at most, a player kept never again before the window's end);
 * none outside a window. The game's reader, getSaleProposals (src/db/sale-proposals.ts).
 */
export async function saleProposalsOf(saveId: string): Promise<ProposedSale[]> {
  return (await getSaleProposals(saveId)).proposals.map((proposal) => ({
    playerSaveId: proposal.id,
    offer: proposal.offer.fee,
    buyerId: proposal.offer.buyerId,
  }));
}

/**
 * HOOK acceptProposedSale (§ 5.2, the sale of acceptSaleProposalAction): sells a proposed player at once, at the offer the
 * proposal shows, or not at all when it changed since it was read (another sale emptied a budget).
 */
export async function acceptProposedSale(saveId: string, sale: ProposedSale): Promise<{ ok: boolean; fee: number }> {
  const outcome = await sellPlayer({ saveId, playerSaveId: sale.playerSaveId, expected: { fee: sale.offer, buyerId: sale.buyerId } });
  return outcome.ok ? { ok: true, fee: outcome.fee } : { ok: false, fee: 0 };
}
