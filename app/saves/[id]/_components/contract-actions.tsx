"use client";

import { HeartPulseIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import Link from "@/src/components/link";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import type { PlayerProfile } from "@/src/db/players";
import type { ShopShortcuts } from "@/src/db/shop";
import type { ContractTerms } from "@/src/db/transfers";
import { EXPRESS_CARE_MIN_DAYS, daysLeft } from "@/src/engine/shop";
import { formatDate, formatMoney } from "@/src/lib/format";
import { refusalMessage } from "../_lib/refusal-message";
import { releasePlayerAction, renewContractAction, sellPlayerAction } from "../squad/actions";
import {
  ClosedWindowNote,
  DEFAULT_CONTRACT_LENGTH,
  DurationField,
  MoneyField,
  RefusalAlert,
  usePlayerAction,
} from "./contract-fields";

const fullName = (player: Pick<PlayerProfile, "firstName" | "lastName">): string => `${player.firstName} ${player.lastName}`;

type ActionProps = {
  saveId: string;
  player: PlayerProfile;
  terms: ContractTerms;
  disabled?: boolean;
  triggerClassName?: string;
};

export function RenewContractDialog({
  saveId,
  player,
  terms,
  currentDate,
  disabled = false,
  primary = true,
  triggerClassName,
}: ActionProps & { currentDate: Date; primary?: boolean }) {
  const t = useTranslations("contract");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number>(DEFAULT_CONTRACT_LENGTH);
  const [wage, setWage] = useState(String(terms.renewalMinimumWage));
  const { pending, refusal, clearRefusal, run } = usePlayerAction();
  const name = fullName(player);
  const minimumWage = formatMoney(terms.renewalMinimumWage, locale);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setYears(DEFAULT_CONTRACT_LENGTH);
      setWage(String(terms.renewalMinimumWage));
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The main action on a player of the managed club: in orange, unless the screen's orange is another action. */}
      <DialogTrigger
        disabled={disabled}
        render={<Button variant={primary ? "club" : "outline"} className={triggerClassName} />}
        data-testid="renew-contract"
      >
        {t("renew")}
      </DialogTrigger>
      <DialogContent data-testid="renew-dialog">
        <DialogHeader>
          <DialogTitle>{t("renewTitle", { name })}</DialogTitle>
          <DialogDescription>
            {player.contractUntil === null
              ? t("renewDescriptionNoContract", { wage: minimumWage })
              : t("renewDescription", { wage: minimumWage, date: formatDate(player.contractUntil, locale) })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <DurationField years={years} onChange={setYears} currentDate={currentDate} />
          <MoneyField
            id={`renewal-wage-${player.id}`}
            label={t("offeredWage")}
            value={wage}
            onChange={setWage}
            step={10_000}
            min={1}
            testId="renewal-wage"
          />
          <RefusalAlert message={refusal} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} data-testid="renew-cancel">
            {tCommon("cancel")}
          </DialogClose>
          <Button
            variant="club"
            disabled={pending}
            onClick={() =>
              run(
                name,
                () => renewContractAction({ saveId, playerSaveId: player.id, wage: Number(wage), years }),
                () => setOpen(false),
              )
            }
            data-testid="renew-confirm"
          >
            {pending ? t("negotiating") : t("confirmRenewal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReleasePlayerDialog({ saveId, player, terms, disabled = false, triggerClassName }: ActionProps) {
  const t = useTranslations("contract");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { pending, refusal, clearRefusal, run } = usePlayerAction();
  const name = fullName(player);

  const onOpenChange = (next: boolean) => {
    if (next) {
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        disabled={disabled}
        render={<Button variant="outline" className={triggerClassName} />}
        data-testid="release-player"
      >
        {t("release")}
      </DialogTrigger>
      <DialogContent data-testid="release-dialog">
        <DialogHeader>
          <DialogTitle>{t("releaseTitle", { name })}</DialogTitle>
          <DialogDescription>{t("releaseDescription", { cost: formatMoney(terms.releaseCost, locale) })}</DialogDescription>
        </DialogHeader>
        <RefusalAlert message={refusal} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} data-testid="release-cancel">
            {tCommon("cancel")}
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => run(name, () => releasePlayerAction({ saveId, playerSaveId: player.id }), () => setOpen(false))}
            data-testid="release-confirm"
          >
            {pending ? t("releasing") : t("confirmRelease")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SellPlayerDialogProps = Omit<ActionProps, "player"> & {
  player: Pick<PlayerProfile, "id" | "firstName" | "lastName">;
  primary?: boolean; // the main action of its screen, in orange
};

export function SellPlayerDialog({ saveId, player, terms, disabled = false, primary = false, triggerClassName }: SellPlayerDialogProps) {
  const t = useTranslations("contract");
  const tCommon = useTranslations("common");
  const tRefusals = useTranslations("refusals");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { pending, refusal, clearRefusal, run } = usePlayerAction();
  const name = fullName(player);
  const { sale } = terms;

  const onOpenChange = (next: boolean) => {
    if (next) {
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        disabled={disabled}
        render={<Button variant={primary ? "club" : "outline"} className={triggerClassName} />}
        data-testid="sell-player"
      >
        {t("sell")}
      </DialogTrigger>
      <DialogContent data-testid="sell-dialog">
        <DialogHeader>
          <DialogTitle>{t("sellTitle", { name })}</DialogTitle>
          <DialogDescription>
            {sale.ok
              ? t("bestOffer", {
                  buyer: sale.buyerName,
                  fee: formatMoney(sale.fee, locale),
                  wage: formatMoney(sale.wage, locale),
                  years: sale.years,
                })
              : refusalMessage(sale.reason, tRefusals, locale)}
          </DialogDescription>
        </DialogHeader>
        <RefusalAlert message={refusal} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} data-testid="sell-cancel">
            {tCommon(sale.ok ? "cancel" : "close")}
          </DialogClose>
          {sale.ok && (
            <Button
              variant="club"
              disabled={pending}
              onClick={() => run(name, () => sellPlayerAction({ saveId, playerSaveId: player.id }), () => setOpen(false))}
              data-testid="sell-confirm"
            >
              {pending ? t("selling") : t("acceptOffer")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SquadPlayerActionsProps = {
  saveId: string;
  player: PlayerProfile;
  terms: ContractTerms;
  currentDate: Date;
  windowOpen: boolean;
  nextWindowOpensOn: Date;
  primary?: boolean; // the renewal in orange; false where the screen's orange is another action
  care?: ShopShortcuts["care"]; // express care in the shop, for an injured player: null or absent, none now
};

/**
 * Actions of the player sheet for a player of the managed club; disabled, with the reason, while the window is closed.
 * With the window open, the sale alone can be out of reach: just signed, or no club able to buy him. It says why here,
 * before any click, as it says why no club pays much more for a player who joined less than a year ago.
 */
export function SquadPlayerActions({
  saveId,
  player,
  terms,
  currentDate,
  windowOpen,
  nextWindowOpensOn,
  primary = true,
  care = null,
}: SquadPlayerActionsProps) {
  const t = useTranslations("contract");
  const tShortcuts = useTranslations("rewards.shortcuts");
  // Express care (missions v2): an injured player out for long enough, while the shop has some left this season.
  const careable = care !== null && player.injuredUntil !== null && daysLeft(player.injuredUntil, currentDate) >= EXPRESS_CARE_MIN_DAYS;
  const tRefusals = useTranslations("refusals");
  const locale = useLocale();
  const disabled = !windowOpen;
  const { sale } = terms;
  // A promising youth of the shop stays through his first contract: neither sold nor released, whatever the window.
  const academy = terms.academyUntil !== null;
  return (
    <>
      {careable && care !== null && (
        <Link
          href={`/saves/${saveId}/rewards?buy=EXPRESS_CARE&player=${player.id}`}
          data-testid="player-express-care"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-(--club) hover:text-(--club-hover)"
        >
          <HeartPulseIcon aria-hidden className="size-4 shrink-0" />
          {tShortcuts("care", { price: care.price, left: care.left })}
        </Link>
      )}
      {terms.academyUntil !== null && (
        <p className="text-xs text-muted-foreground" data-testid="player-academy">
          {t("academyUntil", { date: formatDate(terms.academyUntil, locale) })}
        </p>
      )}
      {disabled && <ClosedWindowNote actions={t("closedActions")} reopensOn={nextWindowOpensOn} />}
      {windowOpen && !sale.ok && !academy && (
        <p className="text-xs text-muted-foreground" data-testid="player-sale-refusal">
          {refusalMessage(sale.reason, tRefusals, locale)}
        </p>
      )}
      {windowOpen && sale.ok && sale.resaleCap !== undefined && (
        <p className="text-xs text-muted-foreground" data-testid="player-resale-cap">
          {t(`resaleCap.${sale.resaleCap}`)}
        </p>
      )}
      <RenewContractDialog
        saveId={saveId}
        player={player}
        terms={terms}
        currentDate={currentDate}
        disabled={disabled}
        primary={primary}
        triggerClassName="h-12 w-full font-heading text-xl"
      />
      <div className="grid grid-cols-2 gap-2">
        <SellPlayerDialog saveId={saveId} player={player} terms={terms} disabled={disabled || !sale.ok} triggerClassName="h-10 w-full" />
        <ReleasePlayerDialog
          saveId={saveId}
          player={player}
          terms={terms}
          disabled={disabled || academy}
          triggerClassName="h-10 w-full text-loss hover:text-loss"
        />
      </div>
    </>
  );
}
