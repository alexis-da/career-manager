import { useTranslations } from "next-intl";
import type { SeasonRecord } from "@/src/engine/career-history";
import { Panel } from "@/src/components/panel";

/** The team records a completed season broke, on its review (recordsSetIn): its division's points, a win, a run. */
export function NewRecordsPanel({ records }: { records: readonly SeasonRecord[] }) {
  const t = useTranslations("seasons.history.newRecords");
  const text = (record: SeasonRecord): string => {
    switch (record.kind) {
      case "points":
        return t("points", { points: record.points, tier: record.tier });
      case "biggestWin":
        return t("biggestWin", { score: `${record.goalsFor}-${record.goalsAgainst}` });
      case "unbeaten":
        return t("unbeaten", { count: record.length });
    }
  };
  return (
    <Panel aria-labelledby="season-new-records-title" data-testid="season-new-records" className="space-y-2">
      <h2 id="season-new-records-title" className="font-heading text-xl leading-tight">
        {t("title")}
      </h2>
      <ul className="space-y-1 text-sm font-semibold text-(--club)">
        {records.map((record) => (
          <li key={record.kind === "points" ? `points-${record.tier}` : record.kind} data-record={record.kind}>
            {text(record)}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
