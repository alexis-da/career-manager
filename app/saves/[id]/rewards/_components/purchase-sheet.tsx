"use client";

import { CoinsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { cn } from "@/src/lib/utils";
import { buyAction, type PurchaseInput } from "../actions";

/** An Omit that keeps a union's members apart. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A purchase as the sheet sends it: its request's id is the sheet's. */
export type PurchaseRequest = DistributiveOmit<PurchaseInput, "requestId">;

/** A new request's id: a purchase sent twice with it is bought once. Not simulation code. */
const newRequestId = (): string => crypto.randomUUID();

type PurchaseSheetProps = {
  saveId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  price: number;
  tokens: number; // the player's balance
  request: PurchaseRequest | null; // null: a choice is still to make (a player, a line)
  children?: ReactNode; // the choice, and what the purchase does in figures
};

/**
 * The confirmation of a purchase, a sheet from the foot of the screen under 1024 px, beside the page above: what it is
 * and does, the choice it needs, the price and the balance after, and « Confirmer · 350 », the only orange of the
 * screen. Its request's id is made when it opens: a second touch, or a retry, never buys twice.
 */
export function PurchaseSheet({ saveId, open, onOpenChange, title, description, price, tokens, request, children }: PurchaseSheetProps) {
  const t = useTranslations("rewards.shop");
  const computer = useMediaQuery(COMPUTER_QUERY);
  const [requestId, setRequestId] = useState(newRequestId);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const after = tokens - price;

  const changeOpen = (next: boolean) => {
    if (next) {
      setRefusal(null);
      setRequestId(newRequestId());
    }
    onOpenChange(next);
  };

  const pay = () => {
    if (request === null) {
      return;
    }
    setRefusal(null);
    startTransition(async () => {
      try {
        const result = await buyAction(saveId, { ...request, requestId });
        if (result.ok) {
          toast.success(result.message);
          onOpenChange(false);
        } else {
          setRefusal(result.message);
        }
      } catch {
        setRefusal(t("refusals.failed"));
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent
        side={computer ? "right" : "bottom"}
        data-testid="purchase-sheet"
        className="gap-0 overflow-hidden border-secondary bg-card data-[side=bottom]:max-h-[calc(100dvh-2.5rem)] data-[side=bottom]:rounded-t-card data-[side=right]:w-full lg:data-[side=right]:w-110 lg:data-[side=right]:max-w-none"
      >
        <div className="px-4 pt-4 pr-14 pb-3 sm:px-6">
          <SheetTitle className="text-2xl leading-none font-bold">{title}</SheetTitle>
          <SheetDescription className="mt-1.5 leading-snug">{description}</SheetDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {children}
          <p data-testid="purchase-balance" className="flex items-center gap-2 text-sm">
            <CoinsIcon aria-hidden className="size-4 shrink-0 text-warning" />
            {after >= 0 ? t("confirm.balance", { balance: after }) : t("refusals.tokens", { missing: price - tokens })}
          </p>
          {refusal !== null && (
            <p role="alert" data-testid="purchase-refusal" className="text-sm leading-snug text-loss">
              {refusal}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" onClick={() => changeOpen(false)} data-testid="purchase-cancel">
              {t("confirm.cancel")}
            </Button>
            <Button
              variant="club"
              className={cn("h-11 font-heading text-lg")}
              disabled={after < 0 || request === null || pending}
              onClick={pay}
              data-testid="purchase-confirm"
            >
              {pending ? t("confirm.paying") : t("confirm.pay", { price })}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
