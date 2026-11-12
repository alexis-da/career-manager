import { useLocale, useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { Panel } from "@/src/components/panel";
import type { ObjectiveView, SeasonObjectivesView } from "@/src/db/objectives";
import { assistantObjective, OBJECTIVES_JUDGED_FROM_MATCH, type ObjectiveKind, type OptionalObjective } from "@/src/engine/objectives";
import { seasonLabel } from "@/src/engine/world";
import type { Translator } from "@/src/i18n/translator";
import { cn } from "@/src/lib/utils";
import {
  CLUB_OBJECTIVES_ANCHOR,
  CONFIDENCE_FILL,
  CONFIDENCE_TEXT,
  metCount,
  ObjectiveStatusPill,
  objectivesInPlay,
  proposalsOf,
} from "../../_components/dashboard-objectives";
import { confidenceLevel, confidenceWords, objectiveCurrent, objectiveExceed, objectiveGoal } from "../../_lib/objectives";
import { CLUB_CARD_LINK, ClubCardTitle } from "./club-card";

/** The president's confidence runs from 1 to 99: its gauge, from 0 to 99. */
const CONFIDENCE_MAX = 99;

/** An optional objective's kind: neither the ranking nor the cup, both imposed. */
const isOptional = (kind: ObjectiveKind): kind is OptionalObjective => kind !== "RANKING" && kind !== "CUP";

/** Who set an objective: the board, the player, or the assistant in the player's place. */
function originOf(objective: ObjectiveView, t: Translator<"objectives">): string {
  if (objective.imposed) {
    return t("imposed");
  }
  return t(objective.byAssistant ? "chosenBy.assistant" : "chosenBy.player");
}

/** An objective in detail: its kind and who set it, where it stands, what it asks and what exceeds it, its figure. */
function ObjectiveDetail({ objective }: { objective: ObjectiveView }) {
  const t = useTranslations("objectives");
  const locale = useLocale();
  const exceed = objectiveExceed(objective, t);
  const current = objectiveCurrent(objective, t, locale);
  return (
    <li data-objective={objective.kind} className="flex flex-col gap-1 rounded-lg bg-background px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-[0.8125rem] leading-snug text-muted-foreground wrap-break-word">
          <span className="font-bold text-foreground">{t(`kind.${objective.kind}`)}</span>
          {` · ${originOf(objective, t)}`}
        </p>
        <ObjectiveStatusPill status={objective.status} />
      </div>
      <p className="text-[0.9375rem] leading-snug font-bold wrap-break-word">{objectiveGoal(objective, t)}</p>
      {exceed !== null && <p className="text-[0.8125rem] leading-snug text-muted-foreground wrap-break-word">{exceed}</p>}
      {current !== null && (
        <p data-testid="objective-current" className="text-[0.8125rem] leading-snug tabular-nums">
          {current}
        </p>
      )}
    </li>
  );
}

/**
 * The optional objectives the board proposes, while the player may still choose one: what each asks, the assistant's pick
 * if the player makes none before the season's first match, and the way to the season's start screen, where it is made.
 */
function Proposals({ saveId, proposals }: { saveId: string; proposals: readonly ObjectiveView[] }) {
  const t = useTranslations("club.objectives");
  const tObjectives = useTranslations("objectives");
  const kinds = proposals.map(({ kind }) => kind).filter(isOptional);
  return (
    <div data-testid="club-objectives-proposals" className="flex flex-col gap-2.5 rounded-lg border-2 border-dashed p-3">
      <div className="space-y-0.5">
        <h3 className="text-[0.9375rem] font-bold">{t("choiceTitle")}</h3>
        {kinds.length > 0 && (
          <p className="text-[0.8125rem] leading-snug text-muted-foreground">
            {t("choiceDetail", { objective: tObjectives(`kind.${assistantObjective(kinds)}`) })}
          </p>
        )}
      </div>
      <ul className="space-y-1.5 text-[0.8125rem] leading-snug">
        {proposals.map((proposal) => (
          <li key={proposal.kind} data-proposal={proposal.kind} className="wrap-break-word">
            <span className="font-bold">{tObjectives(`kind.${proposal.kind}`)}</span>
            {` · ${objectiveGoal(proposal, tObjectives)}`}
          </li>
        ))}
      </ul>
      <Link href={`/saves/${saveId}/season-start`} data-testid="club-objectives-choose" className={cn(CLUB_CARD_LINK, "self-start")}>
        {t("choose")}
      </Link>
    </div>
  );
}

/**
 * The president's confidence: its figure and its words, a gauge of 0 to 99, and that it is shown only. While it is too
 * early to judge the objectives, it holds still, and says from which league match it will follow them.
 */
function Confidence({ confidence, early }: { confidence: number; early: boolean }) {
  const t = useTranslations("club.objectives");
  const tObjectives = useTranslations("objectives");
  const level = confidenceLevel(confidence);
  const words = confidenceWords(confidence, early, tObjectives);
  const share = Math.round((Math.min(CONFIDENCE_MAX, Math.max(0, confidence)) / CONFIDENCE_MAX) * 100);
  return (
    <div data-testid="club-confidence" data-confidence={confidence} className="flex flex-col gap-2.5 rounded-lg bg-background p-4 lg:self-start">
      <h3 className="eyebrow">{tObjectives("confidence")}</h3>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-heading text-[2.75rem] leading-none tabular-nums">{confidence}</span>
        <span className={cn("text-[0.9375rem] font-bold", CONFIDENCE_TEXT[level])}>{words}</span>
      </p>
      <div
        role="meter"
        aria-label={tObjectives("confidence")}
        aria-valuemin={0}
        aria-valuemax={CONFIDENCE_MAX}
        aria-valuenow={confidence}
        aria-valuetext={`${confidence} · ${words}`}
        className="h-2.5 overflow-hidden rounded-full bg-secondary"
      >
        <div className={cn("h-full rounded-full", CONFIDENCE_FILL[level])} style={{ width: `${share}%` }} />
      </div>
      <p className="text-[0.8125rem] leading-snug text-muted-foreground">
        {early ? t("confidenceFrom", { match: OBJECTIVES_JUDGED_FROM_MATCH }) : t("confidenceFollows")}
      </p>
      <p className="text-[0.8125rem] leading-snug text-muted-foreground">{t("neverSacked")}</p>
    </div>
  );
}

type ClubObjectivesProps = {
  saveId: string;
  view: SeasonObjectivesView;
  className?: string;
};

/**
 * The president's objectives for the season, in detail: the imposed ones and the chosen one, who set each, what it asks
 * and what exceeds it, where it stands (too early to tell before the club's fifth league match, unless decided) and its
 * figure; while the optional one is still to choose, the proposals and the way to the choice; the count of those met once
 * the season is over. Beside them from 1024 px, under them on a phone, the president's confidence, which follows them
 * (holding still until then) and acts on nothing. The dashboard's card leads straight to it, by its anchor.
 */
export function ClubObjectives({ saveId, view, className }: ClubObjectivesProps) {
  const t = useTranslations("club.objectives");
  const inPlay = objectivesInPlay(view);
  const proposals = proposalsOf(view);
  return (
    <Panel
      id={CLUB_OBJECTIVES_ANCHOR}
      aria-labelledby="club-objectives-title"
      data-testid="club-objectives"
      className={cn("grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem]", className)}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <ClubCardTitle id="club-objectives-title">{t("title")}</ClubCardTitle>
          <p className="text-sm text-muted-foreground tabular-nums">{t("season", { season: seasonLabel(view.startYear) })}</p>
        </div>
        {view.over && (
          <div data-testid="club-objectives-met" className="space-y-0.5">
            <p className="text-sm font-bold tabular-nums">{t("met", { met: metCount(inPlay), total: inPlay.length })}</p>
            <p className="text-[0.8125rem] leading-snug text-muted-foreground">{t("metDetail")}</p>
          </div>
        )}
        <ul className="space-y-2">
          {inPlay.map((objective) => (
            <ObjectiveDetail key={objective.kind} objective={objective} />
          ))}
        </ul>
        {proposals.length > 0 && <Proposals saveId={saveId} proposals={proposals} />}
      </div>
      <Confidence confidence={view.confidence} early={view.early} />
    </Panel>
  );
}
