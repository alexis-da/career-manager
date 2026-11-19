import { useLocale, useTranslations } from "next-intl";
import { Panel } from "@/src/components/panel";
import type { CoachOffer } from "@/src/db/national-view";
import { cn } from "@/src/lib/utils";
import { dayRange, exceededLine, nationIn, objectiveLine } from "./coach-names";
import { CoachNationMark } from "./coach-nation-mark";
import { CoachOfferActions } from "./coach-offer-sheet";

/**
 * A federation's offer on the season's start screen, while it is open (docs/design/selections.md § 5.1, 9.6): who offers
 * its post, the objective it would set, that the club stays his; « Voir l'offre » opens its detail and « Pas maintenant »
 * declines it (coach-offer-sheet.tsx). Its words are made here, on the server: the sheet only shows them.
 */
export function CoachOfferCard({ saveId, offer, className }: { saveId: string; offer: CoachOffer; className?: string }) {
  const t = useTranslations("coachOffer");
  const tNations = useTranslations("nations");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const id = `coach-offer-${offer.code}`;
  const proposal = t("proposal", { nation: nationIn(offer.code, "of", t, tWorld) });
  const objective = objectiveLine(
    { code: offer.code, objective: offer.objective, tournament: offer.tournament, year: offer.tournamentYear },
    { tCoach: t, tNations, tWorld },
  );
  return (
    <Panel
      aria-labelledby={`${id}-title ${id}-proposal`}
      data-testid="coach-offer"
      data-nation={offer.code}
      className={cn("space-y-3 border border-highlight/30", className)}
    >
      <h2 id={`${id}-title`} className="text-xs font-bold tracking-wider text-highlight uppercase">
        {t("title")}
      </h2>
      <div className="flex items-start gap-3">
        <CoachNationMark code={offer.code} />
        <p id={`${id}-proposal`} data-testid="coach-offer-proposal" className="min-w-0 pt-0.5 text-[0.9375rem] leading-snug font-semibold wrap-break-word">
          {proposal}
        </p>
      </div>
      <p data-testid="coach-offer-objective" className="text-sm leading-snug">
        {objective}
      </p>
      <p className="text-[0.8125rem] leading-snug text-muted-foreground">{t("keepClub")}</p>
      <CoachOfferActions
        saveId={saveId}
        code={offer.code}
        details={{
          nation: tWorld(`nationalities.${offer.code}`),
          proposal,
          rank: t("rank", { rank: offer.rank }),
          objective,
          exceeded: exceededLine(offer.objective, t),
          firstBreak: offer.nextBreak === null ? null : t("firstBreak", dayRange(offer.nextBreak.from, offer.nextBreak.to, locale)),
        }}
      />
    </Panel>
  );
}
