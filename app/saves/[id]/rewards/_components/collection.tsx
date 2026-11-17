"use client";

import { CheckIcon, LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Panel } from "@/src/components/panel";
import { Button } from "@/src/components/ui/button";
import type { CosmeticView } from "@/src/db/rewards-view";
import { COSMETIC_KINDS, type CosmeticId, type CosmeticKind } from "@/src/lib/cosmetics";
import { cn } from "@/src/lib/utils";
import { CosmeticSign } from "../../_components/cosmetic-sign";
import { wearAction } from "../actions";
import { PriceTag } from "./career-shop";
import { PurchaseSheet } from "./purchase-sheet";

// The collection of the Rewards tab (missions v2, docs/design/missions-v2.md § 3): titles, badges and frames, those had
// to wear, those on sale to buy, the others with how they are had. One of each kind is worn.

/** A cosmetic's line: its sign, its name, how it is had while locked, and what can be done with it. */
function CosmeticRow({
  cosmetic,
  shop,
  pending,
  onWear,
  onBuy,
}: {
  cosmetic: CosmeticView;
  shop: boolean;
  pending: boolean;
  onWear: (id: CosmeticId | null) => void;
  onBuy: () => void;
}) {
  const t = useTranslations("rewards");
  const id = cosmetic.id as CosmeticId;
  const locked = !cosmetic.owned;
  // On sale, shown as it is worn: what is bought is seen first.
  const dimmed = locked && !(cosmetic.price !== null && shop);
  return (
    <li
      data-testid="cosmetic"
      data-cosmetic={cosmetic.id}
      data-owned={String(cosmetic.owned)}
      data-worn={String(cosmetic.worn)}
      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
    >
      <CosmeticSign id={cosmetic.id} locked={dimmed} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[0.9375rem] leading-snug font-bold wrap-break-word", locked && "text-muted-foreground")}>
          {t(`cosmetics.${id}.name`)}
        </p>
        {locked && (
          <p className="text-xs leading-snug text-muted-foreground">
            {cosmetic.streakCycle !== null ? t("collection.streakLot", { cycle: cosmetic.streakCycle }) : t(`cosmetics.${id}.how`)}
          </p>
        )}
      </div>
      {cosmetic.worn ? (
        cosmetic.kind === "BADGE" ? (
          <Button variant="ghost" className="h-9 px-3 max-sm:h-11" disabled={pending} onClick={() => onWear(null)} data-testid="cosmetic-take-off">
            {t("collection.takeOff")}
          </Button>
        ) : (
          <span data-testid="cosmetic-worn" className="inline-flex items-center gap-1 text-xs font-semibold text-win">
            <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
            {t("collection.worn")}
          </span>
        )
      ) : cosmetic.owned ? (
        <Button variant="outline" className="h-9 px-3 max-sm:h-11" disabled={pending} onClick={() => onWear(id)} data-testid="cosmetic-wear">
          {t("collection.wear")}
        </Button>
      ) : cosmetic.price !== null && shop ? (
        <div className="flex shrink-0 items-center gap-2">
          <PriceTag price={cosmetic.price} />
          <Button variant="outline" className="h-9 px-3 max-sm:h-11" onClick={onBuy} data-testid="cosmetic-buy">
            {t("shop.buy")}
          </Button>
        </div>
      ) : (
        <LockIcon aria-label={t("collection.locked")} className="size-4 shrink-0 text-muted-foreground" />
      )}
    </li>
  );
}

type CollectionProps = {
  saveId: string;
  cosmetics: readonly CosmeticView[];
  tokens: number;
  shop: boolean; // cosmetics can be bought here: never from a challenge save
  className?: string;
};

/** The collection, kind by kind: wear one of each, buy those on sale. */
export function Collection({ saveId, cosmetics, tokens, shop, className }: CollectionProps) {
  const t = useTranslations("rewards");
  const [kind, setKind] = useState<CosmeticKind>("TITLE");
  const [buying, setBuying] = useState<CosmeticView | null>(null);
  const [pending, startTransition] = useTransition();
  const ofKind = cosmetics.filter((cosmetic) => cosmetic.kind === kind);

  const wear = (id: CosmeticId | null) => {
    startTransition(async () => {
      try {
        const result = await wearAction(saveId, { kind, cosmetic: id });
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error(t("collection.wearRefused"));
      }
    });
  };

  return (
    <Panel aria-labelledby="rewards-collection-title" data-testid="rewards-collection" className={cn("flex flex-col gap-4", className)}>
      <h2 id="rewards-collection-title" className="font-heading text-xl leading-tight">
        {t("collection.title")}
      </h2>
      <div role="tablist" aria-label={t("collection.title")} className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
        {COSMETIC_KINDS.map((candidate) => {
          const all = cosmetics.filter((cosmetic) => cosmetic.kind === candidate);
          const owned = all.filter((cosmetic) => cosmetic.owned).length;
          return (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={kind === candidate}
              onClick={() => setKind(candidate)}
              data-testid={`collection-${candidate.toLowerCase()}`}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center rounded-md px-2 py-1 text-center leading-tight transition-colors",
                kind === candidate ? "bg-primary font-bold text-primary-foreground" : "font-semibold text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-[0.9375rem]">{t(`collection.kinds.${candidate}`)}</span>
              <span className="text-[0.6875rem] font-normal tabular-nums opacity-80">{t("collection.count", { owned, total: all.length })}</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm leading-snug text-muted-foreground">{t(`collection.about.${kind}`)}</p>
      <ul role="tabpanel" data-testid="collection-list" data-kind={kind} className="divide-y divide-border">
        {ofKind.map((cosmetic) => (
          <CosmeticRow
            key={cosmetic.id}
            cosmetic={cosmetic}
            shop={shop}
            pending={pending}
            onWear={wear}
            onBuy={() => setBuying(cosmetic)}
          />
        ))}
      </ul>
      <PurchaseSheet
        saveId={saveId}
        open={buying !== null}
        onOpenChange={(next) => !next && setBuying(null)}
        title={buying === null ? "" : t(`cosmetics.${buying.id as CosmeticId}.name`)}
        description={buying === null ? "" : t(`collection.about.${buying.kind}`)}
        price={buying?.price ?? 0}
        tokens={tokens}
        request={buying === null ? null : { item: "COSMETIC", cosmetic: buying.id }}
      >
        {buying !== null && (
          <div className="flex items-center gap-3">
            <CosmeticSign id={buying.id} className={buying.kind === "FRAME" ? "h-16 w-24" : undefined} />
            <p className="text-sm font-bold">{t(`cosmetics.${buying.id as CosmeticId}.name`)}</p>
          </div>
        )}
      </PurchaseSheet>
    </Panel>
  );
}
