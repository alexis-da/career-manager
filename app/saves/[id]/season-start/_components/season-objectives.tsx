import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Panel } from "@/src/components/panel";
import type { ObjectiveView, SeasonObjectivesView } from "@/src/db/objectives";
import { cn } from "@/src/lib/utils";
import { objectiveExceed, objectiveGoal } from "../../_lib/objectives";
import { objectiveChoiceState } from "../_lib/season-start";
import { ObjectiveChoiceForm } from "./objective-choice-form";
import { SectionTitle } from "./section-title";

// The season's objectives (gameplay v2, V3): the ranking and the cup, imposed by the board, then the optional one, to
// choose among three before the club's first match of the season, the assistant choosing at kick-off otherwise.

const OPTIONAL_TITLE = "season-start-optional-title";

type ObjectiveCardProps = {
  objective: ObjectiveView;
  testId: string;
  aside?: ReactNode; // beside its kind: who chose it
  note?: string; // under its goal
  chosen?: boolean;
};

/** An objective: its kind, what it asks, and a word under it. */
function ObjectiveCard({ objective, testId, aside, note, chosen = false }: ObjectiveCardProps) {
  const tObjectives = useTranslations("objectives");
  return (
    <li
      data-testid={testId}
      data-objective={objective.kind}
      className={cn("space-y-1 rounded-[1.125rem] border-2 bg-background p-3.5", chosen ? "border-(--club)" : "border-background")}
    >
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={cn("text-xs font-bold tracking-wider uppercase", chosen ? "text-(--club)" : "text-highlight")}>
          {tObjectives(`kind.${objective.kind}`)}
        </span>
        {aside}
      </p>
      <p className="text-[0.9375rem] leading-snug font-semibold">{objectiveGoal(objective, tObjectives)}</p>
      {note !== undefined && <p className="text-[0.8125rem] text-muted-foreground">{note}</p>}
    </li>
  );
}

/** The optional objective once chosen, locked: by the player, or by the assistant at the first kick-off. */
function ChosenObjective({ objective }: { objective: ObjectiveView }) {
  const t = useTranslations("seasonStart.objectives");
  const tObjectives = useTranslations("objectives");
  return (
    <ul>
      <ObjectiveCard
        objective={objective}
        testId="objective-chosen"
        chosen
        note={t("locked")}
        aside={
          <span
            data-by={objective.byAssistant ? "assistant" : "player"}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[0.6875rem] font-semibold"
          >
            <LockIcon aria-hidden className="size-3" />
            {tObjectives(objective.byAssistant ? "chosenBy.assistant" : "chosenBy.player")}
          </span>
        }
      />
    </ul>
  );
}

/**
 * The season's objectives: those the board imposes, with what exceeds them, then the optional one: the choice while it
 * is open, the objective once chosen, never to change again.
 */
export function SeasonObjectives({ saveId, view }: { saveId: string; view: SeasonObjectivesView | null }) {
  const t = useTranslations("seasonStart.objectives");
  const tObjectives = useTranslations("objectives");
  if (view === null) {
    // A save from before the objectives: its seasons have none until the next one.
    return (
      <Panel aria-labelledby="season-start-objectives-title" data-testid="season-start-objectives" className="space-y-2">
        <SectionTitle id="season-start-objectives-title">{t("title")}</SectionTitle>
        <p data-testid="season-start-no-objectives" className="text-sm text-muted-foreground">
          {t("none")}
        </p>
      </Panel>
    );
  }
  const imposed = view.objectives.filter((objective) => objective.imposed);
  const choice = objectiveChoiceState(view);
  return (
    <Panel aria-labelledby="season-start-objectives-title" data-testid="season-start-objectives" className="space-y-5">
      <SectionTitle id="season-start-objectives-title">{t("title")}</SectionTitle>

      {imposed.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="eyebrow">{t("imposed")}</h3>
          <ul className="space-y-2.5">
            {imposed.map((objective) => (
              <ObjectiveCard
                key={objective.kind}
                objective={objective}
                testId="objective-imposed"
                note={objectiveExceed(objective, tObjectives) ?? undefined}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2.5">
        <h3 id={OPTIONAL_TITLE} className="eyebrow">
          {t("optional")}
        </h3>
        {choice.state === "open" && (
          <ObjectiveChoiceForm
            saveId={saveId}
            labelledBy={OPTIONAL_TITLE}
            assistant={choice.assistant}
            proposals={choice.proposals.map((proposal) => ({
              kind: proposal.kind,
              name: tObjectives(`kind.${proposal.kind}`),
              goal: objectiveGoal(proposal, tObjectives),
            }))}
          />
        )}
        {choice.state === "chosen" && <ChosenObjective objective={choice.chosen} />}
        {choice.state === "closed" && (
          <>
            <p data-testid="objective-closed" className="text-sm text-muted-foreground">
              {t("closed")}
            </p>
            <ul className="space-y-2.5">
              {choice.proposals.map((proposal) => (
                <ObjectiveCard key={proposal.kind} objective={proposal} testId="objective-proposed" />
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
