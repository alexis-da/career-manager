"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { deleteSaveAction } from "../actions";

type DeleteSaveDialogProps = {
  saveId: string;
  saveName: string; // as the list shows it
};

export function DeleteSaveDialog({ saveId, saveName }: DeleteSaveDialogProps) {
  const t = useTranslations("deleteSave");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      try {
        await deleteSaveAction(saveId);
        setOpen(false);
        toast.success(t("deleted", { name: saveName }));
      } catch {
        toast.error(t("failed"));
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" data-testid="delete-save" />}>{t("trigger")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: saveName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{common("cancel")}</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm} data-testid="confirm-delete-save">
            {pending ? common("deleting") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
