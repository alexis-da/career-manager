"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import type { EditorPlayer } from "@/src/db/lineup";
import { rankFormations } from "@/src/engine/formation-choice";
import { FORMATION_FAMILIES, FORMATION_NAMES, formationFamily, type FormationName } from "@/src/engine/formations";
import type { CompetitionTier } from "@/src/engine/tiers";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { formatHundredths } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { formationProfile, signedFigure } from "../_lib/formation-profile";

/**
 * How many formations the lineup's lists set first, the others folded behind a button: the picker's recommended for the
 * manager's squad, and the comparison's best against the next opponent (FormationPanel).
 */
export const BEST_FORMATIONS = 3;

type FormationPickerProps = {
  formation: FormationName; // the editor's
  players: readonly EditorPlayer[]; // the squad, as the next match will have it: the formations are ranked for it
  tier: CompetitionTier; // its division, whose average opponent the ranking weighs against
  about?: string; // how they are ranked, a nation's words; the club's (« … de ta division ») by default
  onPick: (formation: FormationName) => void; // switches the lineup to it, the players kept where they fit
};

/**
 * The lineup's formation, and the screen that picks it: a button that says it, opening a sheet from the foot of the
 * screen under lg, beside the page from there. First the three formations recommended for the squad, those that bring
 * the most points expected, as an AI club weighs them (rankFormations: the assistant's eleven in each, against the
 * average opponent of the division), and the current one under them when it is not one of them; the fourteen others by
 * family, four defenders, three, five, behind a button; each with its label, its profile and the points it expects a
 * match. Picking one switches the lineup to it and closes the sheet. The comparison against the next opponent stays
 * under the pitch (FormationPanel).
 */
export function FormationPicker({ formation, players, tier, about, onPick }: FormationPickerProps) {
  const t = useTranslations("lineup");
  const tFormations = useTranslations("formations");
  const computer = useMediaQuery(COMPUTER_QUERY);
  const [open, setOpen] = useState(false);
  const ranked = useMemo(() => rankFormations(players, tier), [players, tier]);
  const label = tFormations(`label.${formation}`);

  const pick = (chosen: FormationName): void => {
    onPick(chosen);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("picker.open", { formation: label })}
        data-testid="lineup-formation"
        data-formation={formation}
        className="h-8 justify-between gap-2 bg-card px-2.5 font-heading text-base font-semibold max-sm:h-11 max-sm:min-w-0 max-sm:flex-1"
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon data-icon="inline-end" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={computer ? "right" : "bottom"}
          data-testid="formation-picker"
          className="gap-0 overflow-hidden border-secondary bg-card data-[side=bottom]:max-h-[calc(100dvh-2.5rem)] data-[side=bottom]:rounded-t-card data-[side=right]:w-full lg:data-[side=right]:w-110 lg:data-[side=right]:max-w-none"
        >
          {/* The cross is in the corner. */}
          <div className="px-4 pt-4 pr-14 pb-3 sm:px-6">
            <SheetTitle className="text-2xl leading-none font-bold">{t("picker.title")}</SheetTitle>
            <SheetDescription className="mt-1.5 leading-snug">{about ?? t("picker.about")}</SheetDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <FormationChoices formation={formation} ranked={ranked} onPick={pick} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

type FormationChoicesProps = {
  formation: FormationName; // the current one
  ranked: readonly { formation: FormationName; points: number }[]; // every formation, best first (rankFormations)
  onPick: (formation: FormationName) => void;
};

/**
 * What the sheet lists, each a button that picks it: the three recommended for the squad, ranked; the current one right
 * under them when it is not one of them; then a button that unfolds in place, in the browser, the fourteen others by
 * family (a single DOM, folded until then). The recommended are listed once; only the current one can be twice, under
 * them and in its family.
 */
export function FormationChoices({ formation, ranked, onPick }: FormationChoicesProps) {
  const t = useTranslations("lineup");
  const tFormations = useTranslations("formations");
  const [showAll, setShowAll] = useState(false);
  const othersId = useId();
  const points = new Map(ranked.map((entry) => [entry.formation, entry.points]));
  const best = ranked.slice(0, BEST_FORMATIONS).map((entry) => entry.formation);
  const others = FORMATION_NAMES.filter((name) => !best.includes(name));
  const row = (name: FormationName, testId: string, rank: number | null) => (
    <FormationRow
      formation={name}
      rank={rank}
      points={points.get(name) ?? 0}
      current={name === formation}
      onPick={onPick}
      testId={testId}
    />
  );
  return (
    // Gaps rather than margins: the folded list leaves no room under its button.
    <div className="flex flex-col gap-5">
      <section aria-labelledby="formation-picker-best" className="space-y-2">
        <h3 id="formation-picker-best" className="eyebrow text-highlight">
          {t("picker.recommended", { count: best.length })}
        </h3>
        <ol className="space-y-2">
          {best.map((name, index) => (
            <li key={name}>{row(name, "formation-best", index + 1)}</li>
          ))}
        </ol>
      </section>
      {!best.includes(formation) && row(formation, "formation-current", null)}
      <Button
        variant="outline"
        size="lg"
        onClick={() => setShowAll(!showAll)}
        aria-expanded={showAll}
        aria-controls={othersId}
        data-testid="formation-show-all"
        className="w-full"
      >
        {t("picker.showAll", { count: others.length })}
        <ChevronDownIcon data-icon="inline-end" className={cn("transition-transform", showAll && "rotate-180")} />
      </Button>
      <div id={othersId} hidden={!showAll} className="flex flex-col gap-5">
        {FORMATION_FAMILIES.map((family) => {
          const names = others.filter((name) => formationFamily(name) === family);
          // A family all of whose formations are recommended has none left here.
          return names.length === 0 ? null : (
            <section key={family} aria-labelledby={`formation-picker-${family}`} data-family={family} className="space-y-2">
              <h3 id={`formation-picker-${family}`} className="eyebrow">
                {tFormations(`family.${family}`)}
              </h3>
              <ul className="space-y-2">
                {names.map((name) => (
                  <li key={name}>{row(name, "formation-choice", null)}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

type FormationRowProps = {
  formation: FormationName;
  rank: number | null; // among the recommended for the squad, in their list only
  points: number; // expected a match against the division's average opponent
  current: boolean;
  onPick: (formation: FormationName) => void;
  testId: string;
};

/** A formation to pick: its label, its profile, the points it expects; its rank among the recommended, the current one marked. */
function FormationRow({ formation, rank, points, current, onPick, testId }: FormationRowProps) {
  const t = useTranslations("lineup");
  const tFormations = useTranslations("formations");
  const locale = useLocale();
  const profile = formationProfile(formation);
  return (
    <button
      type="button"
      onClick={() => onPick(formation)}
      aria-current={current ? "true" : undefined}
      data-testid={testId}
      data-formation={formation}
      data-rank={rank ?? undefined}
      className={cn(
        "grid min-h-11 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border-2 px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        current ? "border-highlight bg-secondary" : "border-secondary bg-background hover:border-highlight/60",
      )}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-heading text-lg leading-tight font-bold">{tFormations(`label.${formation}`)}</span>
          {rank !== null && (
            <span className="rounded-full bg-highlight px-2 py-0.5 text-[0.6875rem] leading-tight font-bold text-background">
              {t("picker.rank", { rank })}
            </span>
          )}
          {current && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-highlight">
              <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
              {t("picker.current")}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {t("picker.profile", {
            attack: signedFigure(profile.attack),
            defense: signedFigure(profile.defense),
          })}
        </span>
      </span>
      {/* A unit, which keeps its case (« pt/match »). */}
      <span className="text-right font-heading text-base leading-tight font-bold normal-case tabular-nums">
        {t("picker.points", { points: formatHundredths(points, locale === "en" ? "en" : "fr") })}
      </span>
    </button>
  );
}
