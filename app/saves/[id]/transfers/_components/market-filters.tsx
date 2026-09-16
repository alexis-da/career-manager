import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import type { MarketFilters, MarketOverview } from "@/src/db/market";
import { POSITION_LABEL, POSITION_ORDER } from "../../_lib/positions";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
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
  return (
    <form
      method="get"
      action={`/saves/${saveId}/transfers`}
      role="search"
      aria-label="Filtrer les joueurs"
      className="grid items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3 xl:grid-cols-[2fr_repeat(5,minmax(0,1fr))_auto]"
    >
      <input type="hidden" name="tab" value="clubs" />
      <input type="hidden" name="sort" value={filters.sort} />
      <input type="hidden" name="dir" value={filters.dir} />

      <Field id="market-q" label="Nom">
        <Input id="market-q" name="q" type="search" defaultValue={filters.q} placeholder="Prénom ou nom" />
      </Field>
      <Field id="market-position" label="Poste">
        <select id="market-position" name="position" defaultValue={filters.position ?? ""} className={SELECT_CLASS}>
          <option value="">Tous</option>
          {POSITION_ORDER.map((position) => (
            <option key={position} value={position}>
              {POSITION_LABEL[position]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="market-competition" label="Championnat">
        <select id="market-competition" name="competition" defaultValue={filters.competition ?? ""} className={SELECT_CLASS}>
          <option value="">Tous</option>
          {competitions.map((competition) => (
            <option key={competition.code} value={competition.code}>
              {competition.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="market-min-overall" label="Note min.">
        <Input id="market-min-overall" name="minOverall" type="number" min={1} max={99} defaultValue={filters.minOverall} />
      </Field>
      <Field id="market-max-age" label="Âge max.">
        <Input id="market-max-age" name="maxAge" type="number" min={15} max={50} defaultValue={filters.maxAge} />
      </Field>
      <Field id="market-max-price" label="Prix max. (M€)">
        <Input id="market-max-price" name="maxPrice" type="number" min={0} step={0.5} defaultValue={filters.maxPrice} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
        <Link href={`/saves/${saveId}/transfers?tab=clubs`} className={buttonVariants({ variant: "ghost" })}>
          Réinitialiser
        </Link>
      </div>
    </form>
  );
}
