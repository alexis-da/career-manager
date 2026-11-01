import { competitionName } from "@/src/i18n/countries";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import type { MarketFilters, MarketOverview } from "@/src/db/market";
import { POSITION_ORDER } from "../../_lib/positions";

// 44 px high on a phone, as the shared fields are.
const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 max-sm:h-11";

function Field({ id, label, aside, children }: { id: string; label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="eyebrow">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

type MarketFiltersFormProps = {
  saveId: string;
  filters: MarketFilters;
  competitions: MarketOverview["competitions"];
};

/** Filters of the AI clubs' players: a plain GET form, so every search lives in the URL. */
export function MarketFiltersForm({ saveId, filters, competitions }: MarketFiltersFormProps) {
  const t = useTranslations("transfers.filters");
  const tWorld = useTranslations("world");
  const tPositions = useTranslations("positions");
  return (
    <form
      method="get"
      action={`/saves/${saveId}/transfers/advanced`}
      role="search"
      aria-label={t("label")}
      data-testid="market-filters"
      className="grid items-end gap-3 rounded-card border bg-card p-4 sm:grid-cols-3 2xl:grid-cols-[2fr_repeat(5,minmax(0,1fr))_auto]"
    >
      <input type="hidden" name="tab" value="clubs" />
      <input type="hidden" name="sort" value={filters.sort} />
      <input type="hidden" name="dir" value={filters.dir} />

      <Field id="market-q" label={t("name")}>
        <Input
          id="market-q"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder={t("namePlaceholder")}
          data-testid="market-q"
        />
      </Field>
      <Field
        id="market-position"
        label={t("position")}
        aside={
          // On the label's line, so the select stays aligned with the other fields.
          // On a phone, the whole label is the target, 44 px high, its box larger.
          <label
            title={t("withSecondary")}
            className="flex items-center gap-1 text-xs text-muted-foreground max-sm:-my-3 max-sm:min-h-11 max-sm:gap-2"
          >
            <input
              type="checkbox"
              name="withSecondary"
              value="1"
              aria-label={t("withSecondary")}
              defaultChecked={filters.withSecondary !== undefined}
              className="size-3.5 accent-(--club) max-sm:size-5"
              data-testid="market-with-secondary"
            />
            {t("secondary")}
          </label>
        }
      >
        <select
          id="market-position"
          name="position"
          defaultValue={filters.position ?? ""}
          className={SELECT_CLASS}
          data-testid="market-position"
        >
          <option value="">{t("all")}</option>
          {POSITION_ORDER.map((position) => (
            <option key={position} value={position}>
              {tPositions(`short.${position}`)} · {tPositions(`label.${position}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field id="market-competition" label={t("competition")}>
        <select
          id="market-competition"
          name="competition"
          defaultValue={filters.competition ?? ""}
          className={SELECT_CLASS}
          data-testid="market-competition"
        >
          <option value="">{t("all")}</option>
          {competitions.map((competition) => (
            <option key={competition.code} value={competition.code}>
              {competitionName(competition.code, tWorld)}
            </option>
          ))}
        </select>
      </Field>
      <Field id="market-min-overall" label={t("minOverall")}>
        <Input
          id="market-min-overall"
          name="minOverall"
          type="number"
          min={1}
          max={99}
          defaultValue={filters.minOverall}
          data-testid="market-min-overall"
        />
      </Field>
      <Field id="market-max-age" label={t("maxAge")}>
        <Input
          id="market-max-age"
          name="maxAge"
          type="number"
          min={15}
          max={50}
          defaultValue={filters.maxAge}
          data-testid="market-max-age"
        />
      </Field>
      <Field id="market-max-price" label={t("maxPrice")}>
        <Input
          id="market-max-price"
          name="maxPrice"
          type="number"
          min={0}
          step={0.5}
          defaultValue={filters.maxPrice}
          data-testid="market-max-price"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" data-testid="market-filter">
          {t("submit")}
        </Button>
        <Link
          href={`/saves/${saveId}/transfers/advanced?tab=clubs`}
          className={buttonVariants({ variant: "ghost" })}
          data-testid="market-reset"
        >
          {t("reset")}
        </Link>
      </div>
    </form>
  );
}
