"use client";

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
  saveName: string;
};

export function DeleteSaveDialog({ saveId, saveName }: DeleteSaveDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      try {
        await deleteSaveAction(saveId);
        setOpen(false);
        toast.success(`Partie « ${saveName} » supprimée.`);
      } catch {
        toast.error("La partie n'a pas pu être supprimée. Réessayez.");
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>Supprimer</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer « {saveName} » ?</DialogTitle>
          <DialogDescription>
            La partie et tout ce qu&apos;elle contient seront effacés. Cette action est définitive.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? "Suppression…" : "Supprimer la partie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
