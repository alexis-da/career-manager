"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { isNewVersionError } from "@/app/_lib/new-version";
import { Button } from "@/src/components/ui/button";
import type { SaleProposal, SaleProposals } from "@/src/db/sale-proposals";
import { formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { acceptSaleProposalAction, keepSaleProposalAction } from "../sale-proposal-actions";
import { OfferSentence } from "./offer-sentence";

/** The sale of a card that is not the screen's main action: the orange outline of « Vendre » elsewhere on the tab. */
const OUTLINED_SALE =
  "border-(--club) font-bold text-(--club) hover:text-(--club-hover) dark:border-(--club) dark:bg-transparent dark:hover:bg-(--club)/10";

type Period = Exclude<SaleProposals["period"], null>;

/**
 * A player the assistant proposes to sell (docs/design/simplification.md § 5.2): who he is, why (his starts and minutes
 * over the period, and that the assistant needs him neither in his eleven nor on his bench), the best offer, and the two
 * gestures. « Vendre » sells at once at that offer, without a dialog: the card has said everything.
 */
function SaleProposalCard({ saveId, proposal, period, primary }: { saveId: string; proposal: SaleProposal; period: Period; primary: boolean }) {
  const t = useTranslations("marketSell.proposals");
  const tPositions = useTranslations("positions");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const name = `${proposal.firstName} ${proposal.lastName}`;
  const fee = formatMoney(proposal.offer.fee, locale);

  const run = (action: () => Promise<{ ok: boolean; message: string }>) => {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(result.message);
          return;
        }
        // An offer that changed: the action read the page again, the card shows the offer now.
        toast.error(result.message);
        router.refresh();
      } catch (error) {
        toast.error(common(isNewVersionError(error) ? "newVersion" : "wakingUp"));
      }
    });
  };

  const played = proposal.starts > 0 || proposal.minutes > 0;
  return (
    <li
      aria-label={name}
      data-testid="market-sale-proposal"
      data-player-id={proposal.id}
      aria-busy={pending}
      className="flex flex-col gap-2.5 rounded-card bg-card p-4"
    >
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
        <span className="text-center font-heading text-[1.625rem] leading-none tabular-nums">{proposal.overall}</span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-[0.9375rem] leading-tight font-bold wrap-break-word">{name}</p>
          <p className="text-[0.8125rem] text-muted-foreground">
            {t("details", { position: tPositions(`short.${proposal.position}`), age: proposal.age })}
          </p>
        </div>
      </div>
      <p className="text-[0.8125rem] leading-snug text-muted-foreground" data-testid="sale-proposal-why">
        {played ? t("played", { starts: proposal.starts, minutes: proposal.minutes, period }) : t("none", { period })}
        {" · "}
        {t("unneeded")}
      </p>
      <p className="text-[0.9375rem] leading-snug">
        <OfferSentence
          text={t("offer", { club: proposal.offer.buyerName, fee, value: formatMoney(proposal.marketValue, locale) })}
          amount={fee}
        />
      </p>
      <div className="flex gap-2">
        <Button
          variant={primary ? "club" : "outline"}
          disabled={pending}
          onClick={() =>
            run(() =>
              acceptSaleProposalAction({ saveId, playerSaveId: proposal.id, fee: proposal.offer.fee, buyerId: proposal.offer.buyerId }),
            )
          }
          className={cn("h-11 min-w-0 flex-1 text-[0.9375rem]", primary ? "font-bold" : OUTLINED_SALE)}
          data-testid="sale-proposal-accept"
        >
          {pending ? t("selling") : t("sell", { fee })}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => keepSaleProposalAction({ saveId, playerSaveId: proposal.id }))}
          className="h-11 px-5 text-[0.9375rem]"
          data-testid="sale-proposal-keep"
        >
          {t("keep")}
        </Button>
      </div>
    </li>
  );
}

/**
 * « Ton adjoint propose », at the head of « Vendre »: the players who never play, the best offer first, the first card's
 * « Vendre » the screen's orange. Nothing without a proposal.
 */
export function SaleProposalsSection({ saveId, proposals }: { saveId: string; proposals: SaleProposals }): ReactNode {
  const t = useTranslations("marketSell.proposals");
  if (proposals.period === null || proposals.proposals.length === 0) {
    return null;
  }
  const { period } = proposals;
  return (
    <section aria-labelledby="market-sale-proposals-title" data-testid="market-sale-proposals" className="space-y-2">
      <h2 id="market-sale-proposals-title" className="font-heading text-xl">
        {t("title")}
      </h2>
      <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {proposals.proposals.map((proposal, index) => (
          <SaleProposalCard key={proposal.id} saveId={saveId} proposal={proposal} period={period} primary={index === 0} />
        ))}
      </ul>
    </section>
  );
}
