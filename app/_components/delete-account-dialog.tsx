"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
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
import { deleteAccountAction } from "../actions";

function ConfirmButton() {
  const t = useTranslations("account.delete");
  const common = useTranslations("common");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending} data-testid="confirm-delete-account">
      {pending ? common("deleting") : t("confirm")}
    </Button>
  );
}

/** « Supprimer mon compte », for a signed-in player, behind an explicit confirmation: their saves go with it. */
export function DeleteAccountDialog() {
  const t = useTranslations("account.delete");
  const common = useTranslations("common");
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline"
            data-testid="delete-account"
          />
        }
      >
        {t("trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{common("cancel")}</DialogClose>
          <form action={deleteAccountAction}>
            <ConfirmButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
