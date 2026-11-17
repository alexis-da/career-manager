"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { JournalEntry } from "@/src/db/rewards-view";
import type { Translator } from "@/src/i18n/translator";
import { cosmeticOf, type CosmeticId } from "@/src/lib/cosmetics";
import { formatDayMonth } from "@/src/lib/format";
import { STREAK_DAY7_TOKENS, addDays, missionTarget } from "@/src/lib/missions";
import { cn } from "@/src/lib/utils";

/** The entries shown before « Tout le journal ». */
const FIRST_ENTRIES = 5;

/** An entry in words: the mission it paid for, the bonus, the welcome, or what was bought. */
function entryLabel(entry: JournalEntry, t: Translator<"rewards">, tMissions: Translator<"missions">): string {
  switch (entry.reason) {
    case "MISSION":
      return entry.kind !== null
        ? tMissions(`kinds.${entry.kind}`, { target: missionTarget(entry.kind) })
        : t(`tokens.entries.missionTiers.${entry.tier ?? "none"}`);
    case "ALL_THREE":
      return t("tokens.entries.allThree");
    case "STREAK":
      return t("tokens.entries.streak", { day: entry.amount >= STREAK_DAY7_TOKENS ? 7 : 3 });
    case "WELCOME":
      return t("tokens.entries.welcome");
    case "PURCHASE": {
      const cosmetic = cosmeticOf(entry.cosmetic);
      if (cosmetic !== undefined) {
        return t("tokens.entries.purchase", { item: t(`cosmetics.${cosmetic.id as CosmeticId}.name`) });
      }
      return t("tokens.entries.purchase", { item: entry.item === null ? "" : t(`shop.items.${entry.item}.name`) });
    }
  }
}

/** The player's journal of tokens, the latest first: five, then all on demand. */
export function TokenJournal({ entries, today }: { entries: readonly JournalEntry[]; today: string }) {
  const t = useTranslations("rewards");
  const tMissions = useTranslations("missions");
  const locale = useLocale();
  const [all, setAll] = useState(false);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("tokens.empty")}</p>;
  }
  const shown = all ? entries : entries.slice(0, FIRST_ENTRIES);
  const when = (at: string): string => {
    const day = at.slice(0, 10);
    if (day === today) {
      return t("tokens.today");
    }
    return day === addDays(today, -1) ? t("tokens.yesterday") : formatDayMonth(new Date(at), locale);
  };
  return (
    <div className="space-y-2">
      <ul data-testid="token-journal" className="divide-y divide-border">
        {shown.map((entry) => (
          <li
            key={entry.key}
            data-testid="token-entry"
            data-reason={entry.reason}
            data-amount={entry.amount}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-2 py-2 text-sm"
          >
            <span className={cn("font-semibold tabular-nums", entry.amount >= 0 ? "text-win" : "text-loss")}>
              {entry.amount > 0 ? `+${entry.amount}` : `−${Math.abs(entry.amount)}`}
            </span>
            <span className="min-w-0 leading-snug wrap-break-word">{entryLabel(entry, t, tMissions)}</span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">{when(entry.at)}</span>
          </li>
        ))}
      </ul>
      {entries.length > FIRST_ENTRIES && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          data-testid="token-journal-all"
          className="text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
        >
          {all ? t("tokens.less") : t("tokens.all")}
        </button>
      )}
    </div>
  );
}
