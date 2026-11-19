import type { ZoneTableView } from "@/src/db/nations-view";
import type { NationCode } from "@/src/engine/nations";
import type { Translator } from "@/src/i18n/translator";
import { cn } from "@/src/lib/utils";
import { NationPill } from "./nation-pill";

/** The figures of a table's row, in narrow columns: played, goal difference, points. */
export const TABLE_COLUMNS = "grid grid-cols-[1.25rem_minmax(0,1fr)_2rem_2.5rem_2.5rem] items-center gap-x-2";

export function TableHead({ t }: { t: Translator<"nations"> }) {
  return (
    <div className={cn(TABLE_COLUMNS, "px-1 pb-1 text-[0.6875rem] font-semibold text-muted-foreground uppercase")}>
      <span />
      <span>{t("table.nation")}</span>
      <abbr title={t("table.playedTitle")} className="text-right no-underline">
        {t("table.played")}
      </abbr>
      <abbr title={t("table.differenceTitle")} className="text-right no-underline">
        {t("table.difference")}
      </abbr>
      <abbr title={t("table.pointsTitle")} className="text-right no-underline">
        {t("table.points")}
      </abbr>
    </div>
  );
}

type ZoneTableProps = {
  zone: ZoneTableView;
  t: Translator<"nations">;
  tWorld: Translator<"world">;
  highlight?: NationCode; // a row set apart: the national coach's own nation
  testIdPrefix?: string; // « internationals-zone », « internationals-zone-row » unless another screen names them
};

/** A zone's qualifiers: its table, its qualifying places above a dashed line. */
export function ZoneTable({ zone, t, tWorld, highlight, testIdPrefix = "internationals" }: ZoneTableProps) {
  return (
    <section data-testid={`${testIdPrefix}-zone`} data-zone={zone.zone} className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="eyebrow">{t(`campaign.zone.${zone.zone}`)}</h3>
        <p className="text-xs text-muted-foreground">{t("campaign.places", { count: zone.places })}</p>
      </div>
      <TableHead t={t} />
      <ol className="text-sm">
        {zone.rows.map((row) => {
          const qualified = row.rank <= zone.places;
          const own = row.code === highlight;
          return (
            <li
              key={row.code}
              data-testid={`${testIdPrefix}-zone-row`}
              data-code={row.code}
              data-qualified={qualified}
              data-own={own || undefined}
              className={cn(
                TABLE_COLUMNS,
                "min-h-10 border-b px-1 py-1 last:border-b-0",
                row.rank === zone.places && "border-b-2 border-dashed border-highlight/60",
                own && "bg-secondary",
              )}
            >
              <span className={cn("text-right font-heading tabular-nums", qualified ? "text-highlight" : "text-muted-foreground")}>{row.rank}</span>
              <span className="flex min-w-0 items-center gap-2">
                <NationPill code={row.code} className={cn("h-6 min-w-10 text-xs", own && "bg-background")} />
                <span className="min-w-0 leading-tight font-semibold wrap-break-word">{tWorld(`nationalities.${row.code}`)}</span>
              </span>
              <span className="text-right tabular-nums">{row.played}</span>
              <span className="text-right tabular-nums">{row.goalsFor - row.goalsAgainst > 0 ? `+${row.goalsFor - row.goalsAgainst}` : row.goalsFor - row.goalsAgainst}</span>
              <span className="text-right font-heading text-base tabular-nums">{row.points}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
