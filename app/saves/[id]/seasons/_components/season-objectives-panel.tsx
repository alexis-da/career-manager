import { useTranslations } from "next-intl";
import { Panel, PanelTitle } from "@/src/components/panel";
import type { ClosedObjectivesView } from "@/src/db/objectives";
import { cn } from "@/src/lib/utils";
import { objectiveGoal, STATUS_TONE } from "../../_lib/objectives";

/** An outcome's pill, in the result colours of the screens (STATUS_TONE). */
const TONE_CLASSES: Readonly<Record<(typeof STATUS_TONE)[keyof typeof STATUS_TONE], string>> = {
  win: "bg-win/15 text-win",
  warning: "bg-warning/15 text-warning",
  loss: "bg-loss/15 text-loss",
  info: "bg-info/15 text-info",
};

/**
 * The season's objectives once it is over, with its other facts: « Objectifs : 2/3 », then each objective that counted
 * (the imposed ones, then the one chosen), what it asked and its outcome, the chosen one marked when the assistant chose
 * it. Beside the card from lg, under it below.
 */
export function SeasonObjectivesPanel({ objectives }: { objectives: ClosedObjectivesView }) {
  const t = useTranslations("objectives");
  const { met, total } = objectives;
  return (
    <Panel
      className="space-y-4"
      aria-labelledby="season-objectives-title"
      data-testid="season-objectives"
      data-met={met}
      data-total={total}
    >
      <PanelTitle id="season-objectives-title">{t("met", { met, total })}</PanelTitle>
      <ul className="space-y-3">
        {objectives.objectives.map((objective) => (
          <li
            key={objective.kind}
            data-objective={objective.kind}
            data-outcome={objective.outcome}
            className="flex items-start justify-between gap-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-[0.8125rem] font-semibold text-muted-foreground">{t(`kind.${objective.kind}`)}</p>
              <p className="text-sm font-semibold wrap-break-word">{objectiveGoal(objective, t)}</p>
              {objective.byAssistant && (
                <p data-testid="season-objective-assistant" className="text-xs text-muted-foreground">
                  {t("chosenBy.assistant")}
                </p>
              )}
            </div>
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                TONE_CLASSES[STATUS_TONE[objective.outcome]],
              )}
            >
              {t(`status.${objective.outcome}`)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
