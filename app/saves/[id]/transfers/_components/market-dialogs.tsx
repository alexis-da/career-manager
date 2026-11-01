"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
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
import { formatMoney } from "@/src/lib/format";
import {
  DEFAULT_CONTRACT_LENGTH,
  DurationField,
  MoneyField,
  RefusalAlert,
  usePlayerAction,
} from "../../_components/contract-fields";
import { makeTransferOfferAction, signFreeAgentAction } from "../actions";

type TriggerProps = {
  disabled?: boolean; // while the transfer window is closed
  primary?: boolean; // the main action of the player sheet, in orange; neutral in a table row
  refused?: boolean; // the player turns the club down for its reputation: the dialog says so, nothing can be sent
  triggerClassName?: string;
};

type SignFreeAgentDialogProps = TriggerProps & {
  saveId: string;
  player: { id: string; name: string };
  askedWage: number;
  wageRoom: number;
  currentDate: Date;
};

export function SignFreeAgentDialog({
  saveId,
  player,
  askedWage,
  wageRoom,
  currentDate,
  disabled = false,
  primary = false,
  refused = false,
  triggerClassName,
}: SignFreeAgentDialogProps) {
  const t = useTranslations("transfers.dialogs");
  const tCommon = useTranslations("common");
  const tRefusals = useTranslations("refusals");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number>(DEFAULT_CONTRACT_LENGTH);
  const [wage, setWage] = useState(String(askedWage));
  const { pending, refusal, clearRefusal, run } = usePlayerAction();

  const onOpenChange = (next: boolean) => {
    if (next) {
      setYears(DEFAULT_CONTRACT_LENGTH);
      setWage(String(askedWage));
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        disabled={disabled}
        render={<Button variant={primary ? "club" : "outline"} size={primary ? "default" : "sm"} className={triggerClassName} />}
        data-testid="sign-free-agent"
      >
        {t("sign")}
      </DialogTrigger>
      <DialogContent data-testid="sign-free-agent-dialog">
        <DialogHeader>
          <DialogTitle>{t("signTitle", { name: player.name })}</DialogTitle>
          <DialogDescription>{t("signDescription", { wage: formatMoney(askedWage, locale) })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <DurationField years={years} onChange={setYears} currentDate={currentDate} />
          <MoneyField
            id={`signing-wage-${player.id}`}
            label={t("wage")}
            value={wage}
            onChange={setWage}
            step={10_000}
            min={1}
            hint={t("wageRoom", { amount: formatMoney(Math.max(0, wageRoom), locale) })}
          />
          <RefusalAlert message={refused ? tRefusals("playerRefusedReputation") : refusal} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tCommon("cancel")}</DialogClose>
          <Button
            variant="club"
            disabled={pending || refused}
            data-testid="confirm-signing"
            onClick={() =>
              run(
                player.name,
                () => signFreeAgentAction({ saveId, playerSaveId: player.id, wage: Number(wage), years }),
                () => setOpen(false),
              )
            }
          >
            {pending ? t("signing") : t("confirmSigning")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MakeOfferDialogProps = TriggerProps & {
  saveId: string;
  player: { id: string; name: string };
  clubName: string;
  askingPrice: number;
  askedWage: number;
  budget: number;
  wageRoom: number;
  currentDate: Date;
};

export function MakeOfferDialog({
  saveId,
  player,
  clubName,
  askingPrice,
  askedWage,
  budget,
  wageRoom,
  currentDate,
  disabled = false,
  primary = false,
  refused = false,
  triggerClassName,
}: MakeOfferDialogProps) {
  const t = useTranslations("transfers");
  const tCommon = useTranslations("common");
  const tRefusals = useTranslations("refusals");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState<number>(DEFAULT_CONTRACT_LENGTH);
  const [fee, setFee] = useState(String(askingPrice));
  const [wage, setWage] = useState(String(askedWage));
  const { pending, refusal, clearRefusal, run } = usePlayerAction();

  const onOpenChange = (next: boolean) => {
    if (next) {
      setYears(DEFAULT_CONTRACT_LENGTH);
      setFee(String(askingPrice));
      setWage(String(askedWage));
      clearRefusal();
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        disabled={disabled}
        render={<Button variant={primary ? "club" : "outline"} size={primary ? "default" : "sm"} className={triggerClassName} />}
        data-testid="make-offer"
      >
        {t("dialogs.offer")}
      </DialogTrigger>
      <DialogContent data-testid="make-offer-dialog">
        <DialogHeader>
          <DialogTitle>{t("dialogs.offerTitle", { name: player.name })}</DialogTitle>
          <DialogDescription>
            {t("asking", {
              club: clubName,
              price: formatMoney(askingPrice, locale),
              wage: formatMoney(askedWage, locale),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <MoneyField
            id={`offer-fee-${player.id}`}
            label={t("dialogs.fee")}
            value={fee}
            onChange={setFee}
            step={100_000}
            min={0}
            hint={t("dialogs.budget", { amount: formatMoney(budget, locale) })}
          />
          <MoneyField
            id={`offer-wage-${player.id}`}
            label={t("dialogs.wage")}
            value={wage}
            onChange={setWage}
            step={10_000}
            min={1}
            hint={t("dialogs.wageRoom", { amount: formatMoney(Math.max(0, wageRoom), locale) })}
          />
          <DurationField years={years} onChange={setYears} currentDate={currentDate} />
          <RefusalAlert message={refused ? tRefusals("playerRefusedReputation") : refusal} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tCommon("cancel")}</DialogClose>
          <Button
            variant="club"
            disabled={pending || refused}
            data-testid="send-offer"
            onClick={() =>
              run(
                player.name,
                () =>
                  makeTransferOfferAction({ saveId, playerSaveId: player.id, fee: Number(fee), wage: Number(wage), years }),
                () => setOpen(false),
              )
            }
          >
            {pending ? t("dialogs.negotiating") : t("dialogs.sendOffer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
