import { useLocale, useTranslations } from "next-intl";
import type { ClubFinances } from "@/src/db/club";
import { formatMillionsAmount, formatMoney, millionsFigure } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../../_components/panel";
import { isPayrollHigh } from "../../_lib/payroll";
import { ClubCardTitle } from "./club-card";

/** The club's money, read only: its transfer budget, its payroll against its wage budget and what that leaves. */
export function ClubFinancesCard({ finances }: { finances: ClubFinances }) {
  const t = useTranslations("club");
  const locale = useLocale();
  const { budget, wageBudget, payroll, wageRoom } = finances;
  const over = wageRoom < 0;
  // The bar ends at its end, however far above the wage budget.
  const share = over ? 100 : wageBudget === 0 ? 0 : Math.round((payroll / wageBudget) * 100);
  return (
    <Panel aria-labelledby="club-finances-title" data-testid="club-finances" className="flex flex-col gap-4">
      <ClubCardTitle id="club-finances-title">{t("finances")}</ClubCardTitle>
      {/* Side by side under lg, where the card has the screen's width; one above the other beside the challenge. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
        <div className="space-y-1">
          <p className="text-[0.8125rem] text-muted-foreground">{t("transferBudget")}</p>
          <p data-testid="club-budget" className="font-heading text-[1.875rem] leading-none normal-case tabular-nums wrap-break-word lg:text-[2.75rem]">
            {formatMoney(budget, locale)}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-x-3 text-sm">
            <span className="text-muted-foreground">{t("payroll")}</span>
            <span data-testid="club-payroll" className={cn("font-bold tabular-nums", isPayrollHigh(payroll, wageBudget) && "text-warning")}>
              {millionsFigure(payroll, locale).value} / {formatMillionsAmount(wageBudget, locale)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t("payroll")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={share}
            data-testid="club-wage-bar"
            className="h-2.5 overflow-hidden rounded-full bg-background"
          >
            <div className="h-full rounded-full bg-(--club)" style={{ width: `${share}%` }} />
          </div>
          <p data-testid="club-wage-room" className={cn("text-sm font-bold tabular-nums", over && "text-warning")}>
            {over
              ? t("wageOverrun", { amount: formatMoney(-wageRoom, locale) })
              : t("wageRoom", { amount: formatMoney(wageRoom, locale) })}
          </p>
        </div>
      </div>
    </Panel>
  );
}
