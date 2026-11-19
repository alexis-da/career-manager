"use client";

import { CheckIcon, ListChecksIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { saveCoachCallUpAction } from "../actions";
import { CallUpSheet, type CallUpSheetData } from "./call-up-sheet";
import { useNationAction } from "./use-nation-action";

type CallUpActionsProps = {
  saveId: string;
  byAssistant: boolean; // the list is still his assistant's: one gesture makes it his
  sheet: CallUpSheetData;
};

/**
 * What he does with his list before his break or tournament starts: « Valider la liste de l'adjoint », one gesture, while
 * it is his assistant's; « Modifier la liste », which opens the sheet. Neither is the orange: the sheet has its own.
 */
export function CallUpActions({ saveId, byAssistant, sheet }: CallUpActionsProps) {
  const t = useTranslations("nationalTeam.callUp");
  const { pending, run } = useNationAction();
  const [open, setOpen] = useState(false);
  // Each opening mounts the sheet anew, on the list as it stands.
  const [opening, setOpening] = useState(0);

  const edit = () => {
    setOpening((count) => count + 1);
    setOpen(true);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {byAssistant && (
        <Button
          variant="secondary"
          disabled={pending}
          aria-busy={pending}
          onClick={() => run(() => saveCoachCallUpAction(saveId, sheet.assistant))}
          data-testid="call-up-validate"
          className="h-11 px-4 max-sm:grow"
        >
          <CheckIcon data-icon="inline-start" />
          {t("validate")}
        </Button>
      )}
      <Button variant="outline" onClick={edit} data-testid="call-up-edit" className="h-11 px-4 max-sm:grow">
        <ListChecksIcon data-icon="inline-start" />
        {t("edit")}
      </Button>
      <CallUpSheet key={opening} saveId={saveId} data={sheet} open={open} onOpenChange={setOpen} />
    </div>
  );
}
