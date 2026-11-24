"use client";

import { HeartPulseIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
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
import type { ContractTerms, SaleQuote } from "@/src/db/transfers";
import type { ContractChoice } from "@/src/engine/assistant-contracts";
import { EXPRESS_CARE_MIN_DAYS, daysLeft } from "@/src/engine/shop";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { isNewVersionError } from "@/app/_lib/new-version";
import { refusalMessage } from "../_lib/refusal-message";
import { releasePlayerAction, renewContractAction, sellPlayerAction, setContractChoiceAction } from "../squad/actions";
import { ClosedWindowNote, DEFAULT_CONTRACT_LENGTH, DurationField, RefusalAlert, usePlayerAction } from "./contract-fields";

const fullName = (player: Pick<PlayerProfile, "firstName" | "lastName">): string => `${player.firstName} ${player.lastName}`;

type ActionProps = {
  saveId: string;
  player: PlayerProfile;
  terms: ContractTerms;
  disabled?: boolean;
  triggerClassName?: string;
};

/** « Contrat actuel : jusqu'au 30 juin 2027. »: what the renewal dialog says of the contract it extends. */
export function renewalDescription(player: Pick<PlayerProfile, "contractUntil">, t: Translator<"contract">, locale: Locale): string {
  return player.contractUntil === null
    ? t("renewDescriptionNoContract")
    : t("renewDescription", { date: formatDate(player.contractUntil, locale) });
}

/** What releasing a player costs: half of what he is still owed on his contract, the one place a wage becomes money. */
export function releaseDescription(terms: Pick<ContractTerms, "releaseCost">, t: Translator<"contract">, locale: Locale): string {
  return t("releaseDescription", { cost: formatMoney(terms.releaseCost, locale) });
}

/** The best AI bid for a player, or why there is none. */
export function saleDescription(sale: SaleQuote, t: Translator<"contract">, tRefusals: Translator<"refusals">, locale: Locale): string {
  return sale.ok
    ? t("bestOffer", { buyer: sale.buyerName, fee: formatMoney(sale.fee, locale) })
    : refusalMessage(sale.reason, tRefusals, locale);
}

/**
 * « Prolonger maintenant », in a transfer window: the length alone is chosen, 1 to 5 seasons, 3 by default; the player
 * extends at his own floor (renewalWage), never shown (docs/design/simplification.md § 2.3).
 */
export function RenewContractDialog({
  saveId,
  player,
  currentDate,
  disabled = false,
  primary = true,
  triggerClassName,
}: Omit<ActionProps, "terms"> & { currentDate: Date; primary?: boolean }) {
  const t = useTranslations("contract");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number>(DEFAULT_CONTRACT_LENGTH);
  const { pending, refusal, clearRefusal, run } = usePlayerAction();
  const name = fullName(player);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setYears(DEFAULT_CONTRACT_LENGTH);
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
          <DialogDescription>{renewalDescription(player, t, locale)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <DurationField years={years} onChange={setYears} currentDate={currentDate} />
          <RefusalAlert message={refusal} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} data-testid="renew-cancel">
            {tCommon("cancel")}
          </DialogClose>
          <Button
            variant="club"
            disabled={pending}
            onClick={() => run(name, () => renewContractAction({ saveId, playerSaveId: player.id, years }), () => setOpen(false))}
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
          <DialogDescription>{releaseDescription(terms, t, locale)}</DialogDescription>
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
          <DialogDescription>{saleDescription(sale, t, tRefusals, locale)}</DialogDescription>
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

/**
 * The options of the end-of-contract choice, the assistant's first: his rule's, or a free departure while the player keeps
 * the contracts.
 */
const CHOICE_OPTIONS = [
  { choice: null, testId: "contract-choice-assistant" },
  { choice: "RENEW", testId: "contract-choice-renew" },
  { choice: "LEAVE", testId: "contract-choice-leave" },
] as const satisfies readonly { choice: ContractChoice | null; testId: string }[];

type ContractChoiceFieldProps = {
  player: Pick<PlayerProfile, "id" | "firstName" | "lastName" | "contractChoice" | "assistantIntention">;
};

/**
 * « À la fin de son contrat » (docs/design/simplification.md § 2.3), on the sheet of a player of the managed club whose
 * contract ends this season, at any date, window open or closed: his assistant decides (what his rule will do, or a free
 * departure, the default, while the player keeps the contracts), renew him, or let him go; applied at the season's turn.
 * Radio buttons of the browser's own, kept at once (useOptimistic), the page read again by the action; a refusal says why
 * and reads it again too. The save comes from the address: the sheet opens under /saves/[id] only.
 */
export function ContractChoiceField({ player }: ContractChoiceFieldProps) {
  const t = useTranslations("player.contractChoice");
  const tContract = useTranslations("contract");
  const tCommon = useTranslations("common");
  const router = useRouter();
  // Null outside the App Router: no save there, no choice.
  const params: { id: string } | null = useParams<{ id: string }>();
  const saveId = params?.id;
  const [choice, setChoice] = useOptimistic(player.contractChoice);
  const [pending, startTransition] = useTransition();
  if (saveId === undefined) {
    return null;
  }

  const choose = (next: ContractChoice | null) => {
    startTransition(async () => {
      setChoice(next);
      try {
        const result = await setContractChoiceAction(saveId, player.id, next);
        if (result.ok) {
          toast.success(tContract("done", { label: fullName(player), message: result.message }));
        } else {
          toast.error(result.message);
          router.refresh();
        }
      } catch (error) {
        toast.error(isNewVersionError(error) ? tCommon("newVersion") : t("failed"));
      }
    });
  };

  const labelOf = (option: ContractChoice | null): string => {
    if (option === "RENEW") {
      return t("renew");
    }
    if (option === "LEAVE") {
      return t("leave");
    }
    if (player.assistantIntention === null) {
      return t("default");
    }
    return t(player.assistantIntention === "renew" ? "assistantRenew" : "assistantLeave");
  };

  return (
    <fieldset
      data-testid="player-contract-choice"
      data-choice={choice ?? "ASSISTANT"}
      disabled={pending}
      className="space-y-0.5 pt-1"
    >
      <legend className="pb-1 text-xs font-semibold text-muted-foreground">{t("legend")}</legend>
      {CHOICE_OPTIONS.map((option) => (
        <label
          key={option.testId}
          data-testid={option.testId}
          className={cn(
            "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 text-[0.8125rem] leading-snug max-sm:min-h-11",
            "has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-default has-disabled:opacity-70",
          )}
        >
          <input
            type="radio"
            name={`contract-choice-${player.id}`}
            checked={choice === option.choice}
            onChange={() => choose(option.choice)}
            className="size-4 shrink-0 accent-primary"
          />
          <span className={cn(choice === option.choice && "font-semibold")}>{labelOf(option.choice)}</span>
        </label>
      ))}
    </fieldset>
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
