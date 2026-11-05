import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Panel } from "@/src/components/panel";
import type { ClubDotation, ClubFinances } from "@/src/db/club";
import type { ClosedObjectivesView } from "@/src/db/objectives";
import { seasonLabel } from "@/src/engine/world";
import { formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { objectiveGoal, STATUS_TONE } from "../../_lib/objectives";
import {
  coefficientTone,
  formatCoefficient,
  isOptionalObjective,
  objectiveContribution,
  signedContribution,
  signedMoney,
} from "../_lib/season-start";
import { SectionTitle } from "./section-title";

// What the board grants for the season (gameplay v2, V2): the budget in large, how it was made, and the wage cap. Each
// figure in euros (hundredths for the coefficient) in a data attribute, beside the words that show it.

/** The result colours, as the objectives' outcomes take them (STATUS_TONE). */
const TONE_TEXT = { win: "text-win", warning: "text-warning", loss: "text-loss", info: "text-info" } as const;

/**
 * The budget the board grants for the season, in large on the bright blue: its dotation's, or in a save from before the
 * dotations, the club's budget as it is.
 */
export function SeasonGrant({ finances }: { finances: ClubFinances }) {
  const t = useTranslations("seasonStart.budget");
  const locale = useLocale();
  const { dotation } = finances;
  const amount = dotation?.budget ?? finances.budget;
  return (
    <Panel aria-labelledby="season-start-grant" data-testid="season-start-grant" className="space-y-2 bg-primary text-primary-foreground lg:p-6">
      <h2 id="season-start-grant" className="text-xs font-bold tracking-wider text-on-blue uppercase">
        {dotation === null ? t("current") : t("granted")}
      </h2>
      <p
        data-testid="season-start-budget"
        data-amount={amount}
        className="font-heading text-[3rem] leading-none normal-case tabular-nums wrap-break-word lg:text-[3.75rem]"
      >
        {formatMoney(amount, locale)}
      </p>
      <p className="text-sm text-on-blue">
        {dotation === null ? t("noDotation") : t("grantedNote", { season: seasonLabel(dotation.startYear) })}
      </p>
    </Panel>
  );
}

type BudgetLineProps = {
  testId: string;
  label: string;
  detail?: string; // under the label, smaller
  amount: number; // euros, in data-amount
  shown: string; // the amount as the line shows it
  coefficient?: number; // hundredths, in data-coefficient
  amountClassName?: string;
  className?: string;
  children?: ReactNode; // under the line, the screen's width
};

/** A line of the dotation: what it is and its detail under it, its amount at the right, then what explains it. */
function BudgetLine({ testId, label, detail, amount, shown, coefficient, amountClassName, className, children }: BudgetLineProps) {
  return (
    <div
      data-testid={testId}
      data-amount={amount}
      data-coefficient={coefficient}
      className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3", className)}
    >
      <dt className="min-w-0 wrap-break-word">
        {label}
        {detail !== undefined && <span className="block text-[0.8125rem] text-muted-foreground">{detail}</span>}
      </dt>
      <dd className={cn("text-right font-bold tabular-nums", amountClassName)}>{shown}</dd>
      {children !== undefined && <dd className="col-span-2 pt-2">{children}</dd>}
    </div>
  );
}

/**
 * Last season's objectives, those that counted, as they ended: each named, its outcome and what it added to the
 * coefficient, the chosen one with who chose it.
 */
function LastObjectives({ objectives, startYear }: { objectives: ClosedObjectivesView["objectives"]; startYear: number }) {
  const t = useTranslations("seasonStart.detail");
  const tObjectives = useTranslations("objectives");
  const locale = useLocale();
  return (
    <ul aria-label={t("lastObjectives", { season: seasonLabel(startYear) })} className="space-y-1.5 text-[0.8125rem]">
      {objectives.map((objective) => {
        const contribution = objectiveContribution(objective.kind, objective.outcome);
        return (
          <li
            key={objective.kind}
            data-objective={objective.kind}
            data-outcome={objective.outcome}
            data-contribution={contribution}
            className="rounded-lg bg-background px-3 py-2"
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">{tObjectives(`kind.${objective.kind}`)}</span>
              <span className={cn("font-bold tabular-nums", TONE_TEXT[STATUS_TONE[objective.outcome]])}>
                {tObjectives(`status.${objective.outcome}`)} · {signedContribution(contribution, locale)}
              </span>
            </span>
            <span className="block text-muted-foreground">{objectiveGoal(objective, tObjectives)}</span>
            {isOptionalObjective(objective.kind) && (
              <span className="block text-muted-foreground">
                {tObjectives(objective.byAssistant ? "chosenBy.assistant" : "chosenBy.player")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * How the season's budget was made: the board's funding at the club's reputation rank in its division, the bonus or the
 * malus of last season's objectives (its coefficient, and those objectives one by one), half of the budget left unspent,
 * and their total; for the first season of a save, its starting budget alone.
 */
export function SeasonBudgetDetail({
  dotation,
  lastObjectives,
}: {
  dotation: ClubDotation;
  lastObjectives: ClosedObjectivesView["objectives"];
}) {
  const t = useTranslations("seasonStart.detail");
  const locale = useLocale();
  const tone = coefficientTone(dotation.coefficient);
  return (
    <Panel aria-labelledby="season-start-detail-title" data-testid="season-start-detail" className="space-y-4">
      <SectionTitle id="season-start-detail-title">{t("title")}</SectionTitle>
      <dl className="space-y-3 text-sm">
        {dotation.first ? (
          <BudgetLine
            testId="season-start-first"
            label={t("start")}
            detail={t("startDetail")}
            amount={dotation.budget}
            shown={formatMoney(dotation.budget, locale)}
          />
        ) : (
          <>
            <BudgetLine
              testId="season-start-dotation"
              label={t("dotation")}
              detail={t("reputationRank", { rank: dotation.reputationRank, count: dotation.clubCount })}
              amount={dotation.dotation}
              shown={formatMoney(dotation.dotation, locale)}
            />
            <BudgetLine
              testId="season-start-objectives-bonus"
              label={t("objectives")}
              detail={t(tone, { coefficient: formatCoefficient(dotation.coefficient, locale) })}
              amount={dotation.objectivesAmount}
              shown={tone === "neutral" ? "—" : signedMoney(dotation.objectivesAmount, locale)}
              coefficient={dotation.coefficient}
              amountClassName={tone === "bonus" ? "text-win" : tone === "malus" ? "text-loss" : "text-muted-foreground"}
            >
              {lastObjectives.length > 0 && <LastObjectives objectives={lastObjectives} startYear={dotation.startYear - 1} />}
            </BudgetLine>
            <BudgetLine
              testId="season-start-carry-over"
              label={t("carryOver")}
              detail={t("carryOverDetail")}
              amount={dotation.carryOver}
              shown={formatMoney(dotation.carryOver, locale)}
            />
            <BudgetLine
              testId="season-start-total"
              label={t("total")}
              amount={dotation.budget}
              shown={formatMoney(dotation.budget, locale)}
              className="border-t pt-3 font-bold"
            />
          </>
        )}
      </dl>
    </Panel>
  );
}

/** The wage cap, in large, with the payroll under it and what it leaves, or the overrun. */
export function SeasonWages({ finances }: { finances: ClubFinances }) {
  const t = useTranslations("seasonStart.wages");
  const locale = useLocale();
  const { wageBudget, payroll, wageRoom } = finances;
  const over = wageRoom < 0;
  return (
    <Panel aria-labelledby="season-start-wages-title" data-testid="season-start-wages" className="space-y-3">
      <SectionTitle id="season-start-wages-title">{t("title")}</SectionTitle>
      <p
        data-testid="season-start-wage-budget"
        data-amount={wageBudget}
        className="font-heading text-[2.25rem] leading-none normal-case tabular-nums wrap-break-word"
      >
        {formatMoney(wageBudget, locale)}
      </p>
      <dl className="space-y-1.5 text-sm">
        <div data-testid="season-start-payroll" data-amount={payroll} className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-muted-foreground">{t("payroll")}</dt>
          <dd className="font-bold tabular-nums">{formatMoney(payroll, locale)}</dd>
        </div>
        <div data-testid="season-start-wage-room" data-amount={wageRoom} className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-muted-foreground">{over ? t("overrun") : t("room")}</dt>
          <dd className={cn("font-bold tabular-nums", over && "text-warning")}>{formatMoney(Math.abs(wageRoom), locale)}</dd>
        </div>
      </dl>
      <p className="text-[0.8125rem] text-muted-foreground">{t("note")}</p>
    </Panel>
  );
}
