"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import type { NationCode } from "@/src/engine/nations";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { isNewVersionError } from "@/app/_lib/new-version";
import { acceptCoachOfferAction, declineCoachOfferAction } from "../nation/actions";
import { CoachNationMark } from "./coach-nation-mark";

/** What an offer's sheet says, worded on the server (coach-offer-card.tsx). */
export type CoachOfferDetails = {
  nation: string; // « Portugal »
  proposal: string; // « La fédération du Portugal te propose son poste de sélectionneur. »
  rank: string; // « 4e nation par la force »
  objective: string; // « Objectif : … », or « Pas de tournoi pour le Maroc ce cycle : prépare le suivant »
  exceeded: string | null; // « Dépassé : la finale »; null without an objective
  firstBreak: string | null; // « Première trêve : du 4 au 8 sept. »; null without a break left this season
};

type CoachOfferActionsProps = {
  saveId: string;
  code: NationCode;
  details: CoachOfferDetails;
};

/**
 * An offer's answers on its card: « Voir l'offre », outlined (the screen's orange stays « Valider mon objectif »), and
 * « Pas maintenant »; then its sheet, from the foot of the screen under 1024 px, at the right above: the nation, its rank,
 * the objective and what goes past it, the first break, the rule of the post, and « Accepter le poste », the sheet's only
 * orange. Accepted, the post is his and his national team's tab opens; declined, the card goes, the page read again by the
 * action. A refusal (the offer gone meanwhile, the club's first match played) is told, and the page read again shows
 * where it stands.
 */
export function CoachOfferActions({ saveId, code, details }: CoachOfferActionsProps) {
  const t = useTranslations("coachOffer");
  const common = useTranslations("common");
  const router = useRouter();
  const computer = useMediaQuery(COMPUTER_QUERY);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const failed = (error: unknown) => toast.error(isNewVersionError(error) ? common("newVersion") : t("failed"));

  const decline = () =>
    startTransition(async () => {
      try {
        const result = await declineCoachOfferAction(saveId, code);
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
          router.refresh();
        }
      } catch (error) {
        failed(error);
      }
    });

  const accept = () =>
    startTransition(async () => {
      try {
        const result = await acceptCoachOfferAction(saveId, code);
        setOpen(false);
        if (result.ok) {
          toast.success(result.message);
          router.push(`/saves/${saveId}/nation`);
        } else {
          toast.error(result.message);
          router.refresh();
        }
      } catch (error) {
        failed(error);
      }
    });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1 px-4 font-semibold sm:flex-none"
          disabled={pending}
          onClick={() => setOpen(true)}
          data-testid="coach-offer-view"
        >
          {t("view")}
        </Button>
        <Button
          variant="ghost"
          className="h-11 flex-1 px-4 sm:flex-none"
          disabled={pending}
          aria-busy={pending}
          onClick={decline}
          data-testid="coach-offer-decline"
        >
          {t("decline")}
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={computer ? "right" : "bottom"}
          data-testid="coach-offer-sheet"
          data-nation={code}
          className="gap-0 overflow-hidden border-secondary bg-card data-[side=bottom]:max-h-[calc(100dvh-2.5rem)] data-[side=bottom]:rounded-t-card data-[side=right]:w-full lg:data-[side=right]:w-110 lg:data-[side=right]:max-w-none"
        >
          <div className="flex items-center gap-3 px-4 pt-4 pr-14 pb-3 sm:px-6">
            <CoachNationMark code={code} />
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-bold tracking-wider text-highlight uppercase">{t("title")}</p>
              <SheetTitle className="text-2xl leading-none font-bold wrap-break-word">{details.nation}</SheetTitle>
              <SheetDescription data-testid="coach-offer-rank" className="leading-snug">
                {details.rank}
              </SheetDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <p className="text-[0.9375rem] leading-snug font-semibold">{details.proposal}</p>
            <div className="space-y-1 rounded-lg bg-background p-3.5">
              <p data-testid="coach-offer-sheet-objective" className="text-[0.9375rem] leading-snug font-semibold">
                {details.objective}
              </p>
              {details.exceeded !== null && (
                <p data-testid="coach-offer-exceeded" className="text-[0.8125rem] leading-snug text-muted-foreground">
                  {details.exceeded}
                </p>
              )}
            </div>
            <ul className="space-y-2 text-sm leading-snug">
              {details.firstBreak !== null && <li data-testid="coach-offer-first-break">{details.firstBreak}</li>}
              <li>{t("keepClub")}</li>
              <li className="text-muted-foreground">{t("rule")}</li>
              <li className="text-muted-foreground">{t("leave")}</li>
            </ul>
            {/* « Annuler » as wide as its word, the post's acceptance the rest of the row: whole at 360 px. */}
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 shrink-0 px-4" onClick={() => setOpen(false)} data-testid="coach-offer-cancel">
                {t("cancel")}
              </Button>
              <Button
                variant="club"
                className="h-11 min-w-0 flex-1 font-heading text-lg leading-none whitespace-normal"
                disabled={pending}
                aria-busy={pending}
                onClick={accept}
                data-testid="coach-offer-accept"
              >
                {pending && <LoaderCircleIcon data-icon="inline-start" aria-hidden className="animate-spin" />}
                {pending ? t("accepting") : t("accept")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
