"use client";

import { CoinsIcon, DumbbellIcon, HeartPulseIcon, ShieldPlusIcon, SproutIcon, WalletIcon, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Panel } from "@/src/components/panel";
import { Button } from "@/src/components/ui/button";
import type { CareerItemView, ShopView } from "@/src/db/shop";
import { ITEM_PRICES, type CareerItem, type PurchaseRefusal, type YouthLine } from "@/src/engine/shop";
import { seasonLabel } from "@/src/engine/world";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { PurchaseSheet, type PurchaseRequest } from "./purchase-sheet";

// The career's shop of the Rewards tab (missions v2, docs/design/missions-v2.md § 2.3): its four items, their prices and
// limits, and why one cannot be bought now; then the player's own, the streak shield. « Acheter » opens the confirmation,
// with its choice: which injured player, which line for the promising youth.

const ICONS: Readonly<Record<CareerItem | "STREAK_SHIELD", LucideIcon>> = {
  FITNESS_CAMP: DumbbellIcon,
  EXPRESS_CARE: HeartPulseIcon,
  BUDGET_TOP_UP: WalletIcon,
  PROMISING_YOUTH: SproutIcon,
  STREAK_SHIELD: ShieldPlusIcon,
};

/** A choice in the sheet: a card with its radio, 44 px high at least. */
const CHOICE =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 has-checked:border-highlight has-checked:bg-secondary has-disabled:cursor-not-allowed has-disabled:opacity-50";

/** The price of an item, by the coins. */
export function PriceTag({ price }: { price: number }) {
  const t = useTranslations("rewards.shop");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-heading text-lg leading-none normal-case tabular-nums">
      <CoinsIcon aria-hidden className="size-4 text-warning" />
      <span aria-hidden>{price}</span>
      <span className="sr-only">{t("price", { price })}</span>
    </span>
  );
}

/** Why an item cannot be bought now, in words. */
function refusalText(refusal: PurchaseRefusal, price: number, shop: ShopView, t: Translator<"rewards.shop">, locale: Locale): string {
  switch (refusal) {
    case "tokens":
      return t("refusals.tokens", { missing: price - shop.tokens });
    case "wage_budget":
      return t("refusals.wageBudgetAny", { wageRoom: formatMoney(Math.max(0, shop.wageRoom), locale) });
    default:
      return t(`refusals.${refusal}`);
  }
}

/** What an item does, its figures included. */
function aboutText(item: CareerItem, shop: ShopView, t: Translator<"rewards.shop">, locale: Locale): string {
  switch (item) {
    case "BUDGET_TOP_UP":
      return t("items.BUDGET_TOP_UP.about", { amount: formatMoney(shop.topUp, locale) });
    case "PROMISING_YOUTH":
      return t("items.PROMISING_YOUTH.about", { overall: shop.youth[0]?.overall ?? 0 });
    default:
      return t(`items.${item}.about`);
  }
}

/** A career item's line: its sign, name and price, what it does, its limits, and « Acheter » or why not. */
function ShopItem({
  item,
  shop,
  refusal,
  onBuy,
}: {
  item: CareerItemView;
  shop: ShopView;
  refusal: PurchaseRefusal | null;
  onBuy: () => void;
}) {
  const t = useTranslations("rewards.shop");
  const locale = useLocale();
  const Icon = ICONS[item.item];
  return (
    <li data-testid="shop-item" data-item={item.item} data-refusal={refusal ?? ""} className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-highlight">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.9375rem] leading-snug font-bold">{t(`items.${item.item}.name`)}</p>
          <PriceTag price={item.price} />
        </div>
        <p className="text-sm leading-snug text-muted-foreground">{aboutText(item.item, shop, t, locale)}</p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p data-testid="shop-item-limits" className="text-xs text-muted-foreground tabular-nums">
            {t("seasonLeft", { left: item.season.limit - item.season.bought, limit: item.season.limit })}
            {item.career !== null && ` · ${t("careerLeft", { left: item.career.limit - item.career.bought, limit: item.career.limit })}`}
          </p>
          <Button variant="outline" className="ml-auto h-9 px-4 max-sm:h-11" disabled={refusal !== null} onClick={onBuy} data-testid="shop-buy">
            {t("buy")}
          </Button>
        </div>
        {refusal !== null && refusal !== "live" && (
          <p data-testid="shop-refusal" className="text-xs leading-snug text-muted-foreground">
            {refusalText(refusal, item.price, shop, t, locale)}
          </p>
        )}
      </div>
    </li>
  );
}

type CareerShopProps = {
  saveId: string;
  shop: ShopView;
  opening?: { item: CareerItem; playerSaveId?: string } | null; // a shortcut's: the sheet opens on it
  className?: string;
};

/** The career's shop and the player's streak shield, with their confirmation. */
export function CareerShop({ saveId, shop, opening = null, className }: CareerShopProps) {
  const t = useTranslations("rewards.shop");
  const tRewards = useTranslations("rewards");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  const openable = opening !== null && shop.items.some(({ item, refusal }) => item === opening.item && refusal === null);
  const [open, setOpen] = useState<CareerItem | "STREAK_SHIELD" | null>(openable ? opening.item : null);
  const [player, setPlayer] = useState<string | null>(
    opening?.playerSaveId !== undefined && shop.care.some(({ id }) => id === opening.playerSaveId) ? opening.playerSaveId : (shop.care[0]?.id ?? null),
  );
  const [line, setLine] = useState<YouthLine | null>(shop.youth.find(({ fits }) => fits)?.line ?? null);

  const refusalOf = (item: CareerItemView): PurchaseRefusal | null => item.refusal ?? (shop.tokens < item.price ? "tokens" : null);
  const shieldRefusal: PurchaseRefusal | null = shop.shield ? "shield_held" : shop.tokens < ITEM_PRICES.STREAK_SHIELD ? "tokens" : null;

  const request: PurchaseRequest | null =
    open === "EXPRESS_CARE"
      ? player === null
        ? null
        : { item: "EXPRESS_CARE", playerSaveId: player }
      : open === "PROMISING_YOUTH"
        ? line === null
          ? null
          : { item: "PROMISING_YOUTH", line }
        : open === null
          ? null
          : { item: open };
  const youth = shop.youth.find((candidate) => candidate.line === line) ?? null;

  return (
    <>
      <Panel aria-labelledby="rewards-shop-title" data-testid="rewards-shop" className={cn("flex flex-col gap-4", className)}>
        <div className="space-y-1">
          <h2 id="rewards-shop-title" className="font-heading text-xl leading-tight">
            {t("title", { season: seasonLabel(shop.startYear) })}
          </h2>
          <p className="text-sm text-muted-foreground">{t("about")}</p>
        </div>
        {shop.live && (
          <p data-testid="shop-live" className="rounded-xl bg-secondary px-3 py-2 text-sm leading-snug">
            {t("live")}
          </p>
        )}
        <ul className="divide-y divide-border">
          {shop.items.map((item) => (
            <ShopItem key={item.item} item={item} shop={shop} refusal={refusalOf(item)} onBuy={() => setOpen(item.item)} />
          ))}
        </ul>
      </Panel>

      <Panel aria-labelledby="rewards-player-shop-title" data-testid="rewards-player-shop" className="flex flex-col gap-4">
        <div className="space-y-1">
          <h2 id="rewards-player-shop-title" className="font-heading text-xl leading-tight">
            {t("playerTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("playerAbout")}</p>
        </div>
        <div data-testid="shop-item" data-item="STREAK_SHIELD" data-refusal={shieldRefusal ?? ""} className="flex gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-highlight">
            <ShieldPlusIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[0.9375rem] leading-snug font-bold">{t("items.STREAK_SHIELD.name")}</p>
              <PriceTag price={ITEM_PRICES.STREAK_SHIELD} />
            </div>
            <p className="text-sm leading-snug text-muted-foreground">{t("items.STREAK_SHIELD.about")}</p>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-xs text-muted-foreground">{shop.shield ? tRewards("streak.shield") : tRewards("streak.noShield")}</p>
              <Button
                variant="outline"
                className="ml-auto h-9 px-4 max-sm:h-11"
                disabled={shieldRefusal !== null}
                onClick={() => setOpen("STREAK_SHIELD")}
                data-testid="shop-buy"
              >
                {t("buy")}
              </Button>
            </div>
            {shieldRefusal === "tokens" && (
              <p data-testid="shop-refusal" className="text-xs text-muted-foreground">
                {t("refusals.tokens", { missing: ITEM_PRICES.STREAK_SHIELD - shop.tokens })}
              </p>
            )}
          </div>
        </div>
      </Panel>

      <PurchaseSheet
        saveId={saveId}
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        title={open === null ? "" : t(`items.${open}.name`)}
        description={open === null ? "" : open === "STREAK_SHIELD" ? t("items.STREAK_SHIELD.about") : aboutText(open, shop, t, locale)}
        price={open === null ? 0 : ITEM_PRICES[open]}
        tokens={shop.tokens}
        request={request}
      >
        {open === "FITNESS_CAMP" && <p className="text-sm">{t("confirm.campPlayers", { count: shop.belowFull })}</p>}
        {open === "BUDGET_TOP_UP" && <p className="text-sm">{t("confirm.topUp", { budget: formatMoney(shop.budget + shop.topUp, locale) })}</p>}
        {open === "EXPRESS_CARE" && (
          <fieldset className="space-y-2">
            <legend className="mb-2 eyebrow">{t("confirm.choosePlayer")}</legend>
            {shop.care.map((candidate) => (
              <label key={candidate.id} className={CHOICE} data-testid="care-choice">
                <input
                  type="radio"
                  name="care"
                  className="mt-1 accent-(--highlight)"
                  checked={player === candidate.id}
                  onChange={() => setPlayer(candidate.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold wrap-break-word">
                    {candidate.name} · {tPositions(`short.${candidate.position}`)} {candidate.overall}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {t("confirm.careDays", { days: candidate.daysLeft, after: candidate.daysAfter })}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {open === "PROMISING_YOUTH" && (
          <fieldset className="space-y-2">
            <legend className="mb-2 eyebrow">{t("confirm.chooseLine")}</legend>
            {shop.youth.map((candidate) => (
              <label key={candidate.line} className={CHOICE} data-testid="youth-choice" data-line={candidate.line}>
                <input
                  type="radio"
                  name="line"
                  className="mt-1 accent-(--highlight)"
                  checked={line === candidate.line}
                  disabled={!candidate.fits}
                  onChange={() => setLine(candidate.line)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">
                    {t(`confirm.lines.${candidate.line}`)} · {tPositions(`short.${candidate.position}`)}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {t("confirm.youth", {
                      name: `${candidate.firstName} ${candidate.lastName}`,
                      overall: candidate.overall,
                      potential: candidate.potential,
                    })}
                  </span>
                  <span className={cn("block text-xs tabular-nums", candidate.fits ? "text-muted-foreground" : "text-loss")}>
                    {formatMoney(candidate.wage, locale)}
                    {!candidate.fits && ` · ${t("confirm.tooExpensive")}`}
                  </span>
                </span>
              </label>
            ))}
            {youth !== null && <p className="text-xs leading-snug text-muted-foreground">{t("confirm.youthWage", { wage: formatMoney(youth.wage, locale) })}</p>}
            <p className="text-xs text-muted-foreground tabular-nums">{t("confirm.youthRoom", { wageRoom: formatMoney(Math.max(0, shop.wageRoom), locale) })}</p>
          </fieldset>
        )}
      </PurchaseSheet>
    </>
  );
}
