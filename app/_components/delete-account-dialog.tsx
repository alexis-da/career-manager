"use client";

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
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Suppression…" : "Supprimer définitivement"}
    </Button>
  );
}

/** « Supprimer mon compte », for a signed-in player, behind an explicit confirmation: their saves go with it. */
export function DeleteAccountDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline" />}>
        Supprimer mon compte
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer ton compte ?</DialogTitle>
          <DialogDescription>
            Ton compte et toutes tes parties seront perdus, sans retour possible. Tu pourras toujours rejouer, avec un
            nouveau compte ou sans compte.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
          <form action={deleteAccountAction}>
            <ConfirmButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
