import { ChevronRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { Panel } from "@/src/components/panel";
import type { ObjectiveView, SeasonObjectivesView } from "@/src/db/objectives";
import type { ObjectiveProgress, ObjectiveStatus } from "@/src/engine/objectives";
import { INTL_LOCALES, type Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { cn } from "@/src/lib/utils";
import { confidenceLevel, confidenceWords, objectiveCurrent, objectiveGoal, STATUS_TONE } from "../_lib/objectives";

// The season's objectives on the dashboard (gameplay v2, V3): where each stands (too early to tell before the club's fifth
// league match, unless decided), the way to the choice of the optional one while it is open, the assistant's pick when he
// made it, and the president's confidence. Their detail is the Club screen's (club/_components/club-objectives.tsx),
// which takes the pill, the confidence's colours and the split of the objectives from here.

/** A status's pill, in the result colours STATUS_TONE gives it. */
const TONE_CLASSES: Readonly<Record<(typeof STATUS_TONE)[ObjectiveProgress], string>> = {
  win: "bg-win/15 text-win",
  warning: "bg-warning/15 text-warning",
  loss: "bg-loss/15 text-loss",
  info: "bg-info/15 text-info",
};

/** Too early to tell: no verdict yet, so no result colour, a neutral pill. */
const TOO_EARLY_CLASSES = "bg-secondary text-muted-foreground";

/**
 * Where an objective stands, in its colour: « En bonne voie », « En danger », « Atteint », « Dépassé », « Manqué »; « Trop
 * tôt pour juger » neutral.
 */
export function ObjectiveStatusPill({ status, className }: { status: ObjectiveStatus; className?: string }) {
  const t = useTranslations("objectives");
  return (
    <span
      data-testid="objective-status"
      data-status={status}
      className={cn(
        "inline-flex min-h-6 items-center rounded-full px-2.5 text-xs leading-tight font-semibold whitespace-nowrap",
        status === "TOO_EARLY" ? TOO_EARLY_CLASSES : TONE_CLASSES[STATUS_TONE[status]],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}

type ConfidenceLevel = ReturnType<typeof confidenceLevel>;

/** The president's confidence in its colour: trust in green, expectation in blue, worry in red. */
export const CONFIDENCE_TEXT: Readonly<Record<ConfidenceLevel, string>> = { high: "text-win", middle: "text-info", low: "text-loss" };
export const CONFIDENCE_FILL: Readonly<Record<ConfidenceLevel, string>> = { high: "bg-win", middle: "bg-info", low: "bg-loss" };

/** The objectives that count this season: the imposed ones, and the optional one once chosen. */
export function objectivesInPlay(view: SeasonObjectivesView): ObjectiveView[] {
  return view.objectives.filter((objective) => objective.imposed || objective.chosen);
}

/** The optional objectives the board proposes while the player may still choose one of them; none once the choice is closed. */
export function proposalsOf(view: SeasonObjectivesView): ObjectiveView[] {
  return view.choiceOpen ? view.objectives.filter((objective) => !objective.imposed && !objective.chosen) : [];
}

/** How many objectives are met: achieved or exceeded. */
export function metCount(objectives: readonly ObjectiveView[]): number {
  return objectives.filter((objective) => objective.status === "ACHIEVED" || objective.status === "EXCEEDED").length;
}

/** The proposals by their names, as a choice: « Jeunesse, Spectacle ou Solidité », « Youth, Entertainment or Solidity ». */
export function proposalNames(proposals: readonly ObjectiveView[], t: Translator<"objectives">, locale: Locale): string {
  return new Intl.ListFormat(INTL_LOCALES[locale], { type: "disjunction" }).format(proposals.map(({ kind }) => t(`kind.${kind}`)));
}

/** The anchor of the objectives' card on the Club screen, where this card's detail leads: in French, as the game's addresses. */
export const CLUB_OBJECTIVES_ANCHOR = "objectifs";

/** A way on from the card: 44 px high on a phone. */
const CARD_LINK = "text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

/**
 * An objective at a glance: its kind, where it stands, what it asks, who chose it when the assistant did (« Choisi par
 * l'adjoint », as on the Club screen and the season's start), and the figure it is judged on once there is one.
 */
function ObjectiveCell({ objective }: { objective: ObjectiveView }) {
  const t = useTranslations("objectives");
  const locale = useLocale();
  const current = objectiveCurrent(objective, t, locale);
  return (
    <li data-objective={objective.kind} className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-background p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="eyebrow">{t(`kind.${objective.kind}`)}</span>
        <ObjectiveStatusPill status={objective.status} />
      </div>
      <p className="text-[0.9375rem] leading-snug font-bold wrap-break-word">{objectiveGoal(objective, t)}</p>
      {objective.chosen && objective.byAssistant && (
        <p data-testid="objective-by-assistant" className="text-[0.8125rem] leading-snug text-muted-foreground">
          {t("chosenBy.assistant")}
        </p>
      )}
      {current !== null && (
        <p data-testid="objective-current" className="text-[0.8125rem] leading-snug text-muted-foreground tabular-nums">
          {current}
        </p>
      )}
    </li>
  );
}

type DashboardObjectivesProps = {
  saveId: string;
  view: SeasonObjectivesView;
  className?: string;
};

/**
 * The dashboard's card of the season's objectives: the imposed ones and the chosen one, each with its status; while the
 * optional one is still to choose, its place leads to the season's start screen (no full orange: the hero keeps the
 * screen's one); while it is too early to judge them, why the assistant chose the optional one when he did; the count of
 * those met once the season is over; the president's confidence in one line.
 */
export function DashboardObjectives({ saveId, view, className }: DashboardObjectivesProps) {
  const t = useTranslations("dashboard.objectives");
  const tObjectives = useTranslations("objectives");
  const locale = useLocale();
  const inPlay = objectivesInPlay(view);
  const proposals = proposalsOf(view);
  const level = confidenceLevel(view.confidence);
  // The player chose none before the club's first match: the assistant did, at its kick-off. Said while too early to judge.
  const assistantPick = view.early ? inPlay.find((objective) => objective.chosen && objective.byAssistant) : undefined;
  return (
    <Panel aria-labelledby="dashboard-objectives-title" data-testid="dashboard-objectives" className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="dashboard-objectives-title" className="font-heading text-xl leading-tight">
          {t("title")}
        </h2>
        <Link href={`/saves/${saveId}/club#${CLUB_OBJECTIVES_ANCHOR}`} data-testid="dashboard-objectives-detail" className={CARD_LINK}>
          {t("detail")}
        </Link>
      </div>
      {view.over && (
        <p data-testid="dashboard-objectives-met" className="text-sm font-bold tabular-nums">
          {t("met", { met: metCount(inPlay), total: inPlay.length })}
        </p>
      )}
      {/* As many columns as hold 12rem: one on a phone, the three side by side on a computer. Never wider than the card. */}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(12rem,100%),1fr))] gap-2.5">
        {inPlay.map((objective) => (
          <ObjectiveCell key={objective.kind} objective={objective} />
        ))}
        {proposals.length > 0 && (
          // The optional objective's place, still empty: all of it is the way to the choice.
          <li className="min-w-0">
            <Link
              href={`/saves/${saveId}/season-start`}
              data-testid="dashboard-objectives-choose"
              className="flex h-full min-h-11 items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1 space-y-1">
                <span className="eyebrow block">{t("optional")}</span>
                <span className="block text-[0.9375rem] leading-snug font-bold wrap-break-word">{t("choose")}</span>
                <span data-testid="dashboard-objectives-proposals" className="block text-[0.8125rem] leading-snug text-muted-foreground wrap-break-word">
                  {proposalNames(proposals, tObjectives, locale)}
                </span>
              </span>
              <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        )}
      </ul>
      {assistantPick !== undefined && (
        <p data-testid="dashboard-objectives-assistant" className="text-[0.8125rem] leading-snug text-muted-foreground">
          {t("assistantPicked", { objective: tObjectives(`kind.${assistantPick.kind}`) })}
        </p>
      )}
      <dl
        data-testid="dashboard-confidence"
        data-confidence={view.confidence}
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t pt-3 text-sm"
      >
        <dt className="text-muted-foreground">{tObjectives("confidence")}</dt>
        <dd className={cn("font-bold tabular-nums", CONFIDENCE_TEXT[level])}>
          {`${view.confidence} · ${confidenceWords(view.confidence, view.early, tObjectives)}`}
        </dd>
      </dl>
    </Panel>
  );
}
