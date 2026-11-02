import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/src/components/ui/badge";
import type { Dashboard } from "@/src/db/dashboard";
import { nextTransferWindowOpening, transferWindowCloseDate } from "@/src/engine/world";
import {
  formatDayMonth,
  formatDecimal,
  formatGoalDifference,
  formatMillionsAmount,
  formatMoney,
  millionsFigure,
} from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { isPayrollHigh } from "../_lib/payroll";
import { Panel } from "@/src/components/panel";
import { ResultPill } from "./result-pill";

const PILL = "h-9 bg-card px-3.5 text-[0.8125rem] tabular-nums";

/** The club's money and the transfer window, at the top of the dashboard. */
export function DashboardPills({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { club, currentDate } = dashboard;
  const windowClose = transferWindowCloseDate(currentDate);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <Badge data-testid="dashboard-budget" variant="secondary" className={PILL}>
        {t("budgetPill", { amount: formatMoney(club.budget, locale) })}
      </Badge>
      <Badge
        data-testid="dashboard-payroll"
        data-summary="payroll"
        data-value={club.payroll}
        variant="secondary"
        className={cn(PILL, isPayrollHigh(club.payroll, club.wageBudget) && "text-warning")}
      >
        {t("payrollPill", {
          payroll: millionsFigure(club.payroll, locale).value,
          wageBudget: formatMillionsAmount(club.wageBudget, locale),
        })}
      </Badge>
      <p data-testid="dashboard-window" className="text-xs text-muted-foreground">
        {windowClose === null
          ? t("windowClosedUntil", { date: formatDayMonth(nextTransferWindowOpening(currentDate), locale) })
          : t("windowOpenUntil", { date: formatDayMonth(windowClose, locale) })}
      </p>
    </div>
  );
}

/** A card of the summary: a small label, then what it counts. */
function Tile({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <Panel className="flex flex-col gap-1.5 p-4" data-testid={testId}>
      <h2 className="text-xs text-muted-foreground">{label}</h2>
      {children}
    </Panel>
  );
}

function Figure({ children }: { children: ReactNode }) {
  return <p className="font-heading text-[2rem] leading-none normal-case tabular-nums">{children}</p>;
}

function SmallPrint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground tabular-nums">{children}</p>;
}

/** The rank's change since the matchday before the club's last: nothing without one. */
function Movement({ position }: { position: NonNullable<Dashboard["position"]> }) {
  const t = useTranslations("dashboard");
  const tStage = useTranslations("stage");
  const { rank, previousRank, previousRound } = position;
  if (previousRank === null || previousRound === null) {
    return null;
  }
  const movement = previousRank - rank;
  const Icon = movement > 0 ? ArrowUpIcon : movement < 0 ? ArrowDownIcon : MinusIcon;
  return (
    <p className={cn("flex gap-1 text-xs tabular-nums", movement > 0 ? "text-win" : movement < 0 ? "text-loss" : "text-muted-foreground")}>
      <Icon aria-hidden className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0">
        {/* The arrow's direction, for a screen reader: the text gives only the distance. */}
        {movement !== 0 && <span className="sr-only">{t(movement > 0 ? "movementUp" : "movementDown")} </span>}
        {t("movement", { count: Math.abs(movement), matchday: tStage("matchdayShort", { round: previousRound }) })}
      </span>
    </p>
  );
}

/** The club's season at a glance: rank, points, form and squad. */
export function DashboardTiles({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { club, position, managedForm } = dashboard;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={t("position")} testId="dashboard-position">
        {position === null ? (
          <Figure>—</Figure>
        ) : (
          <>
            <Figure>
              {position.rank}
              <span className="text-lg">{t("rankSuffix", { rank: position.rank })}</span>
            </Figure>
            <Movement position={position} />
          </>
        )}
      </Tile>

      <Tile label={t("pointsLabel")} testId="dashboard-points">
        {position === null ? (
          <Figure>—</Figure>
        ) : (
          <>
            <Figure>{position.points}</Figure>
            <SmallPrint>{t("goalDifference", { difference: formatGoalDifference(position.goalDifference) })}</SmallPrint>
          </>
        )}
      </Tile>

      <Tile label={t("form")} testId="dashboard-form">
        {managedForm.length === 0 ? (
          <SmallPrint>{t("noMatchYet")}</SmallPrint>
        ) : (
          <div className="flex flex-wrap gap-1">
            {managedForm.map((result, index) => (
              <ResultPill key={index} result={result} />
            ))}
          </div>
        )}
      </Tile>

      <Tile label={t("squad")} testId="dashboard-squad">
        <Figure>
          {club.players}
          <span className="ml-1 text-lg text-muted-foreground">{t("playersUnit")}</span>
        </Figure>
        <div>
          <SmallPrint>{t("goalkeepers", { count: club.goalkeepers })}</SmallPrint>
          {club.averageAge !== null && <SmallPrint>{t("averageAge", { age: formatDecimal(club.averageAge, locale) })}</SmallPrint>}
        </div>
      </Tile>
    </div>
  );
}
