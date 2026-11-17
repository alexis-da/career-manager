import { useLocale, useTranslations } from "next-intl";
import type { ClubDotation, ClubFinances, SeasonPrizes } from "@/src/db/club";
import { NEUTRAL_BUDGET_COEFFICIENT } from "@/src/engine/balance";
import { seasonLabel } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import type { Locale } from "@/src/i18n/locale";
import { formatHundredths, formatMillionsAmount, formatMoney, millionsFigure } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "@/src/components/panel";
import { isPayrollHigh } from "../../_lib/payroll";
import { ClubCardTitle } from "./club-card";

/** An amount added or taken away, with its sign: « +4,2 M€ », « -6,3 M€ » (« +€4.2m », « -€6.3m »). */
function signedMoney(euros: number, locale: Locale): string {
  return euros > 0 ? `+${formatMoney(euros, locale)}` : formatMoney(euros, locale);
}

type DotationLineProps = {
  testId: string;
  label: string;
  detail?: string; // under the label, smaller
  amount: string;
  amountValue?: number; // euros, in data-amount
  amountClassName?: string;
  className?: string;
};

/** A line of the dotation: what it is, its detail under it, and its amount at the right, on the label's first line. */
function DotationLine({ testId, label, detail, amount, amountValue, amountClassName, className }: DotationLineProps) {
  return (
    <div data-testid={testId} className={cn("flex items-baseline justify-between gap-x-3", className)}>
      <dt className="min-w-0 wrap-break-word">
        {label}
        {detail !== undefined && <span className="block text-[0.8125rem] text-muted-foreground">{detail}</span>}
      </dt>
      <dd data-amount={amountValue} className={cn("shrink-0 text-right font-bold tabular-nums", amountClassName)}>
        {amount}
      </dd>
    </div>
  );
}

/** What the objectives of the season before did to the dotation: a bonus, a malus, or nothing without any. */
function ObjectivesLine({ coefficient, objectivesAmount }: Pick<ClubDotation, "coefficient" | "objectivesAmount">) {
  const t = useTranslations("club.dotation");
  const locale = useLocale();
  const values = { coefficient: formatHundredths(coefficient / 100, locale) };
  if (coefficient === NEUTRAL_BUDGET_COEFFICIENT) {
    return (
      <DotationLine
        testId="club-dotation-objectives"
        label={t("objectives")}
        detail={t("neutral", values)}
        amount="—"
        amountClassName="text-muted-foreground"
      />
    );
  }
  const bonus = coefficient > NEUTRAL_BUDGET_COEFFICIENT;
  return (
    <DotationLine
      testId="club-dotation-objectives"
      label={t("objectives")}
      detail={bonus ? t("bonus", values) : t("malus", values)}
      amount={signedMoney(objectivesAmount, locale)}
      amountClassName={bonus ? "text-win" : "text-loss"}
    />
  );
}

/**
 * The board's last dotation: the season's budget, from the board's funding at the club's reputation rank, the objectives'
 * bonus or malus and the carry-over, in one line for the save's first season; then the wage cap it came with.
 */
function DotationDetail({ dotation }: { dotation: ClubDotation }) {
  const t = useTranslations("club.dotation");
  const locale = useLocale();
  return (
    <section aria-labelledby="club-dotation-title" data-testid="club-dotation" className="space-y-2.5 border-t pt-4">
      <h3 id="club-dotation-title" className="eyebrow">
        {t("title", { season: seasonLabel(dotation.startYear) })}
      </h3>
      <dl className="space-y-2.5 text-sm">
        {dotation.first ? (
          <DotationLine testId="club-dotation-start" label={t("start")} amount={formatMoney(dotation.budget, locale)} />
        ) : (
          <>
            <DotationLine
              testId="club-dotation-base"
              label={t("base")}
              detail={t("reputationRank", { rank: dotation.reputationRank, count: dotation.clubCount })}
              amount={formatMoney(dotation.dotation, locale)}
            />
            <ObjectivesLine coefficient={dotation.coefficient} objectivesAmount={dotation.objectivesAmount} />
            <DotationLine
              testId="club-dotation-carry-over"
              label={t("carryOver")}
              detail={t("carryOverDetail")}
              amount={formatMoney(dotation.carryOver, locale)}
            />
            <DotationLine
              testId="club-dotation-total"
              label={t("total")}
              amount={formatMoney(dotation.budget, locale)}
              className="border-t pt-2.5 font-bold"
            />
          </>
        )}
        <DotationLine testId="club-dotation-wage-budget" label={t("wageBudget")} amount={formatMoney(dotation.wageBudget, locale)} />
      </dl>
    </section>
  );
}

/**
 * The prize money the club has received this season, on top of its dotation: its European competition's, participation
 * included, then its cup's, each named by its competition.
 */
function PrizesDetail({ prizes }: { prizes: SeasonPrizes }) {
  const t = useTranslations("club.prizes");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  return (
    <section aria-labelledby="club-prizes-title" data-testid="club-prizes" className="space-y-2.5 border-t pt-4">
      <h3 id="club-prizes-title" className="eyebrow">
        {t("title", { season: seasonLabel(prizes.startYear) })}
      </h3>
      <dl className="space-y-2.5 text-sm">
        {prizes.europe !== null && (
          <DotationLine
            testId="club-prizes-europe"
            label={t("europe")}
            detail={competitionName(prizes.europe.code, tWorld)}
            amount={formatMoney(prizes.europe.amount, locale)}
            amountValue={prizes.europe.amount}
          />
        )}
        {prizes.cup !== null && (
          <DotationLine
            testId="club-prizes-cup"
            label={t("cup")}
            detail={competitionName(prizes.cup.code, tWorld)}
            amount={formatMoney(prizes.cup.amount, locale)}
            amountValue={prizes.cup.amount}
          />
        )}
      </dl>
    </section>
  );
}

/**
 * The club's money, read only: its transfer budget, its payroll against its wage budget and what that leaves, then the
 * board's last dotation, for a save made since the season budgets (gameplay v2, V2), and the prize money of the season,
 * for a save with a cup or a European competition.
 */
export function ClubFinancesCard({ finances, prizes = null }: { finances: ClubFinances; prizes?: SeasonPrizes | null }) {
  const t = useTranslations("club");
  const locale = useLocale();
  const { budget, wageBudget, payroll, wageRoom, dotation } = finances;
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
      {dotation !== null && <DotationDetail dotation={dotation} />}
      {prizes !== null && <PrizesDetail prizes={prizes} />}
    </Panel>
  );
}
