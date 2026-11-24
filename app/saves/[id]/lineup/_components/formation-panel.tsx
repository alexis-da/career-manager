"use client";

import { ChevronDownIcon, StarIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import type { EditorPlayer } from "@/src/db/lineup";
import { FORMATION_NAMES, type FormationName } from "@/src/engine/formations";
import type { Lineup } from "@/src/engine/lineup";
import { compareFormations, formationStrength, type FormationOption, type TeamStrength } from "@/src/engine/strength";
import { formatHundredths } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { formationProfile, profileBarWidth, signedFigure } from "../_lib/formation-profile";
import { BEST_FORMATIONS } from "./formation-picker";

/** The ends of a strength bar: the elevens of the game lie between, so that a change of a few points shows. */
const STRENGTH_BAR_MIN = 40;
const STRENGTH_BAR_MAX = 90;

// The comparison's cells, tight: its five columns hold in the 296 px a panel has at 360 px, best and button included.

/** A column head of the comparison. */
const HEAD = "eyebrow px-1 pb-1.5 text-left font-semibold";

/** A figure of the comparison. */
const FIGURE = "px-1 text-right font-heading font-bold tabular-nums";

/** A button that unfolds part of the panel: in the orange of a way on, never a full orange action; 44 px high on a phone. */
const DISCLOSURE =
  "flex cursor-pointer items-center gap-1 rounded-md text-sm font-semibold text-(--club) outline-none hover:text-(--club-hover) focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:min-h-11";

/** The next opponent as the panel compares him: his likely eleven, and where the match is played. */
export type PanelOpponent = {
  name: string;
  formation: FormationName; // his likely eleven's
  strength: TeamStrength; // that eleven's, as the engine plays it (getOpponentPreview)
  atHome: boolean; // the managed club plays at home
};

type FormationPanelProps = {
  formation: FormationName; // the editor's
  eleven: Lineup<EditorPlayer>; // what the match would play now: the editor's choices resolved, recomputed on each change
  players: readonly EditorPlayer[]; // the squad, for the automatic eleven of each formation
  // The next match's, null without one. The comparison is kept while players and opponent stay the same objects: pass
  // the page's, not one rebuilt at each render.
  opponent: PanelOpponent | null;
  onApply: (formation: FormationName) => void; // switches to a formation with its automatic eleven
};

/** Attack and defense as the screen shows them: whole. */
const rounded = ({ attack, defense }: TeamStrength): TeamStrength => ({ attack: Math.round(attack), defense: Math.round(defense) });

/**
 * The formations compared, best first against the next opponent: by the goals each expects to score more than it
 * concedes, equals in the order of FORMATION_NAMES (a stable sort, whose first is compareFormations' best). Without an
 * opponent, nothing to rank them by: that order.
 */
const byMargin = (options: readonly FormationOption[]): FormationOption[] =>
  [...options].sort((a, b) => (b.goalDifference ?? 0) - (a.goalDifference ?? 0));

/** The bar's filled share, as a CSS width to a tenth of a percent. */
function strengthWidth(value: number): string {
  const share = Math.min(1, Math.max(0, (value - STRENGTH_BAR_MIN) / (STRENGTH_BAR_MAX - STRENGTH_BAR_MIN)));
  return `${Math.round(share * 1000) / 10}%`;
}

/** A bonus from the middle to the right, in the colour of a win; a penalty to the left, in the colour of a loss. */
function ProfileBar({ percent }: { percent: number }) {
  return (
    <span className="relative block h-1.5 rounded-full bg-border">
      {percent !== 0 && (
        <span
          className={cn("absolute inset-y-0", percent > 0 ? "left-1/2 rounded-r-full bg-win" : "right-1/2 rounded-l-full bg-loss")}
          style={{ width: profileBarWidth(percent) }}
        />
      )}
      {/* The middle: neither bonus nor penalty. */}
      <span className="absolute -inset-y-1 left-1/2 w-px -translate-x-1/2 bg-muted-foreground" />
    </span>
  );
}

/** A figure of an eleven and its bar: the managed club's in blue, the opponent's neutral, none of the actions' orange. */
function StrengthFigure({ label, value, mine }: { label: string; value: number; mine: boolean }) {
  return (
    <div className="space-y-1">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-heading text-xl leading-none font-bold tabular-nums">{value}</span>
      </p>
      <span aria-hidden className="block h-1.5 rounded-full bg-border">
        <span className={cn("block h-1.5 rounded-full", mine ? "bg-info" : "bg-foreground/60")} style={{ width: strengthWidth(value) }} />
      </span>
    </div>
  );
}

type TeamFiguresProps = {
  testId: string;
  title: string;
  subtitle: string;
  strength: TeamStrength; // rounded, as shown
  mine: boolean;
};

/** An eleven's attack and defense, its figures also on the element for the tests. */
function TeamFigures({ testId, title, subtitle, strength, mine }: TeamFiguresProps) {
  const t = useTranslations("formationPanel");
  return (
    <div
      data-testid={testId}
      data-attack={strength.attack}
      data-defense={strength.defense}
      // Rows shared with the other eleven's (subgrid): a name on two lines keeps both elevens' figures level.
      className="row-span-3 grid min-w-0 grid-rows-subgrid"
    >
      <p className="min-w-0">
        <span className="eyebrow block wrap-break-word">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </p>
      <StrengthFigure label={t("attack")} value={strength.attack} mine={mine} />
      <StrengthFigure label={t("defense")} value={strength.defense} mine={mine} />
    </div>
  );
}

/** A column of figures: its name shortened while the panel is narrow, read whole all the same. */
function FigureHead({ short, full }: { short: string; full: string }) {
  return (
    <th scope="col" className={cn(HEAD, "text-right")}>
      <span aria-hidden className="@md:hidden">
        {short}
      </span>
      <span className="sr-only @md:not-sr-only">{full}</span>
    </th>
  );
}

/**
 * Under the lineup's formation: its profile in words and bars, the attack and defense of the eleven the match would play
 * (formationStrength, the engine's: positions, familiarity, form and morale, fitness), recomputed at each change, beside
 * the next opponent's likely eleven; and, unfolded, the seventeen formations compared with their automatic elevens
 * (compareFormations), best first against the opponent, the best flagged: the first three, then a button that unfolds
 * the fourteen others in place; each one to pick. Its columns follow the room it is given.
 */
export function FormationPanel({ formation, eleven, players, opponent, onApply }: FormationPanelProps) {
  const t = useTranslations("formationPanel");
  const tFormations = useTranslations("formations");
  const locale = useLocale();
  const [comparing, setComparing] = useState(false);
  const [more, setMore] = useState(false);
  const comparisonId = useId();
  const othersId = useId();
  const profile = formationProfile(formation);
  const strength = rounded(formationStrength(eleven, formation));
  // Each formation's automatic eleven: the editor's changes leave the comparison as it is.
  const comparison = useMemo(
    () => compareFormations(players, opponent === null ? null : { strength: opponent.strength, atHome: opponent.atHome }),
    [players, opponent],
  );
  const ranked = useMemo(() => byMargin(comparison.options), [comparison]);
  // The best three against the opponent, the others folded under them; without an opponent, no best: all of them.
  const shown = opponent === null ? ranked : ranked.slice(0, BEST_FORMATIONS);
  const others = ranked.slice(shown.length);
  // To a hundredth, signed as shown (a margin that rounds to nothing has no sign): to a tenth, the best often looks no
  // better than the next one.
  const margin = (goals: number): string => signedFigure(Math.round(goals * 100) / 100, (size) => formatHundredths(size, locale));

  const optionRow = (option: FormationOption) => {
    const current = option.formation === formation;
    const best = option.formation === comparison.best;
    const figures = rounded(option.strength);
    return (
      <tr
        key={option.formation}
        data-testid="formation-option"
        data-formation={option.formation}
        data-best={best}
        data-attack={figures.attack}
        data-defense={figures.defense}
        aria-current={current || undefined}
        // One height with a button or without: its 28 px (44 px under 640 px) and margins.
        className={cn("h-9 border-t max-sm:h-13", current && "bg-secondary")}
      >
        <th scope="row" className="py-1 pr-1 pl-1.5 text-left font-normal">
          {/* The flag under the formation when the row is narrow, rather than a wider row. */}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-heading text-base font-bold">{tFormations(`label.${option.formation}`)}</span>
            {best && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-win">
                <StarIcon aria-hidden className="size-3.5 fill-current" />
                {t("compare.best")}
              </span>
            )}
          </span>
        </th>
        <td className={FIGURE}>{figures.attack}</td>
        <td className={FIGURE}>{figures.defense}</td>
        {option.goalDifference !== null && <td className={FIGURE}>{margin(option.goalDifference)}</td>}
        <td className="py-1 pr-1.5 pl-1 text-right">
          {current ? (
            <span className="text-xs font-semibold text-muted-foreground">{t("compare.current")}</span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="px-2"
              onClick={() => onApply(option.formation)}
              aria-label={t("compare.applyLabel", { formation: tFormations(`label.${option.formation}`) })}
              data-testid="formation-apply"
            >
              {t("compare.apply")}
            </Button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <section aria-label={t("title")} data-testid="formation-panel" className="@container rounded-card bg-card p-4 sm:p-5">
      <div className="grid gap-4 @2xl:grid-cols-2 @2xl:gap-6">
        <div data-testid="formation-profile" data-lean={profile.lean} className="space-y-2.5">
          <p className="text-sm font-semibold">
            {t("profile", {
              lean: t(`lean.${profile.lean}`),
              attack: signedFigure(profile.attack),
              defense: signedFigure(profile.defense),
            })}
          </p>
          {/* What the sentence says, on the scale of the largest bonus of a formation. */}
          <div aria-hidden className="grid max-w-xs grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span>{t("attack")}</span>
            <ProfileBar percent={profile.attack} />
            <span>{t("defense")}</span>
            <ProfileBar percent={profile.defense} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <TeamFigures
            testId="formation-strength"
            title={t("myEleven")}
            subtitle={t("myFormation", { formation: tFormations(`label.${formation}`) })}
            strength={strength}
            mine
          />
          {opponent !== null && (
            <TeamFigures
              testId="opponent-strength"
              title={opponent.name}
              subtitle={t("likelyEleven", { formation: tFormations(`label.${opponent.formation}`) })}
              strength={rounded(opponent.strength)}
              mine={false}
            />
          )}
        </div>
      </div>

      <button
        type="button"
        aria-expanded={comparing}
        aria-controls={comparisonId}
        onClick={() => setComparing(!comparing)}
        data-testid="formation-compare-toggle"
        className={cn("mt-4", DISCLOSURE)}
      >
        {t("compare.toggle", { count: FORMATION_NAMES.length })}
        <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform", comparing && "rotate-180")} />
      </button>

      {/* In the page folded: a single DOM, opened by the button. */}
      <div id={comparisonId} hidden={!comparing} data-testid="formation-compare" className="mt-2 max-w-2xl space-y-2">
        <p className="text-[0.8125rem] leading-snug text-muted-foreground">
          {t("compare.intro")}
          {opponent !== null && ` ${t("compare.gap")}`}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th scope="col" className={HEAD}>
                <span className="sr-only">{t("compare.formation")}</span>
              </th>
              <FigureHead short={t("attackShort")} full={t("attack")} />
              <FigureHead short={t("defenseShort")} full={t("defense")} />
              {opponent !== null && (
                <th scope="col" className={cn(HEAD, "text-right")}>
                  {t("compare.gapShort")}
                </th>
              )}
              <th scope="col" className={HEAD}>
                <span className="sr-only">{t("compare.choice")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map(optionRow)}
            {others.length > 0 && (
              // Between the best and the others, as high as a row: what it unfolds comes right after it, in the same columns.
              <tr className="h-9 border-t max-sm:h-13">
                <td colSpan={opponent === null ? 4 : 5} className="py-1 pl-1.5">
                  <button
                    type="button"
                    aria-expanded={more}
                    aria-controls={othersId}
                    onClick={() => setMore(!more)}
                    data-testid="formation-compare-more"
                    className={DISCLOSURE}
                  >
                    {t("compare.more", { count: others.length })}
                    <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform", more && "rotate-180")} />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          {others.length > 0 && (
            <tbody id={othersId} hidden={!more}>
              {others.map(optionRow)}
            </tbody>
          )}
        </table>
      </div>
    </section>
  );
}
