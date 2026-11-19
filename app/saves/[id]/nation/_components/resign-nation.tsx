"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import type { NationCode } from "@/src/engine/nations";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { resignNationalTeamAction } from "../actions";
import { useNationAction } from "./use-nation-action";

type ResignNationProps = {
  saveId: string;
  code: NationCode;
  canLeave: boolean; // nothing of his under way
  session: "break" | "tournament"; // what is under way when he cannot
};

/**
 * « Quitter la sélection », at the foot of the screen: a sheet to confirm it, which says that his club stays his; out of
 * reach, and why, while his break or tournament is under way. Once he has left, the screen has no nation to show: the
 * squad's takes its place, before the page could say it is gone.
 */
export function ResignNation({ saveId, code, canLeave, session }: ResignNationProps) {
  const t = useTranslations("nationalTeam.resign");
  const common = useTranslations("common");
  const computer = useMediaQuery(COMPUTER_QUERY);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, run } = useNationAction();

  const confirm = () =>
    run(() => resignNationalTeamAction(saveId, code), {
      onSuccess: () => {
        setOpen(false);
        router.replace(`/saves/${saveId}/squad`);
      },
    });

  return (
    <section className="space-y-2 border-t pt-5" data-testid="nation-resign-section">
      <Button variant="outline" disabled={!canLeave} onClick={() => setOpen(true)} data-testid="nation-resign" className="h-11 px-4 max-sm:w-full">
        {t("trigger")}
      </Button>
      {!canLeave && (
        <p data-testid="nation-resign-blocked" className="text-sm text-muted-foreground">
          {t(`blocked.${session}`)}
        </p>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={computer ? "right" : "bottom"}
          data-testid="nation-resign-sheet"
          className="gap-0 overflow-hidden border-secondary bg-card data-[side=bottom]:max-h-[calc(100dvh-2.5rem)] data-[side=bottom]:rounded-t-card data-[side=right]:w-full lg:data-[side=right]:w-110 lg:data-[side=right]:max-w-none"
        >
          {/* The cross is in the corner of the sheet. */}
          <div className="px-4 pt-4 pr-14 pb-3 sm:px-6 sm:pr-14">
            <SheetTitle className="text-2xl leading-none font-bold">{t("title")}</SheetTitle>
            <SheetDescription className="mt-1.5 leading-snug">{t("description")}</SheetDescription>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-snug">
              <li data-testid="nation-resign-club" className="font-semibold">
                {t("club")}
              </li>
              <li>{t("history")}</li>
              <li>{t("later")}</li>
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" onClick={() => setOpen(false)} data-testid="nation-resign-cancel">
                {common("cancel")}
              </Button>
              <Button
                variant="destructive"
                className="h-auto min-h-11 py-1.5 whitespace-normal"
                disabled={pending}
                aria-busy={pending}
                onClick={confirm}
                data-testid="nation-resign-confirm"
              >
                {pending ? t("leaving") : t("confirm")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
