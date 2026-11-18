import { useTranslations } from "next-intl";
import Image from "next/image";
import type { CareerHistoryView } from "@/src/db/career-history";
import { seasonLabel } from "@/src/engine/world";
import { Panel } from "@/src/components/panel";
import { divisionsPath } from "../_lib/career";
import { SeasonCardActions, type CardFile } from "./season-card-panel";

type HistoryHeadProps = {
  history: CareerHistoryView;
  card: { square: CardFile; landscape: CardFile } | null; // none in a challenge save, nor before a completed season
};

/**
 * The head of the History tab, on the bright blue: the career in a few figures (its completed seasons, its divisions,
 * its trophies and promotions, its objectives met), then its card's way out of the game, the screen's one orange
 * action; from 1024 px, the card itself beside them.
 */
export function HistoryHead({ history, card }: HistoryHeadProps) {
  const t = useTranslations("seasons.history.head");
  const tPanel = useTranslations("seasons.cardPanel");
  const { summary } = history;
  const path = divisionsPath(summary.path);
  const facts = [
    path,
    t("titles", { count: summary.titles }),
    summary.promotions > 0 ? t("promotions", { count: summary.promotions }) : null,
  ].filter((fact) => fact !== null);
  return (
    <Panel aria-labelledby="history-head-title" data-testid="history-head" className="flex gap-5.5 bg-primary text-primary-foreground">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="space-y-1">
          <h2 id="history-head-title" className="font-heading text-[1.875rem] leading-none">
            {t("title")}
          </h2>
          <p data-testid="history-seasons" className="text-sm font-semibold tabular-nums">
            {t("seasons", { count: summary.seasons })}
            {summary.firstYear !== null && summary.lastYear !== null && (
              <> · {t("span", { first: seasonLabel(summary.firstYear), last: seasonLabel(summary.lastYear) })}</>
            )}
          </p>
          <p data-testid="history-facts" className="text-sm text-on-blue tabular-nums">
            {facts.join(" · ")}
          </p>
          {summary.objectives !== null && (
            <p data-testid="history-objectives" className="text-sm text-on-blue tabular-nums">
              {t("objectives", { met: summary.objectives.met, total: summary.objectives.total })}
            </p>
          )}
        </div>
        {card !== null && (
          <SeasonCardActions square={card.square} shareTitle={t("shareTitle")} main>
            <a
              href={card.landscape.url}
              download={card.landscape.fileName}
              data-testid="career-card-landscape"
              className="basis-full text-sm text-on-blue underline-offset-4 hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
            >
              {tPanel("landscape")}
            </a>
          </SeasonCardActions>
        )}
      </div>
      {/* Lazy and hidden, a phone never fetches it. */}
      {card !== null && (
        <Image
          src={card.square.url}
          alt={tPanel("alt", { title: t("shareTitle") })}
          width={200}
          height={200}
          unoptimized
          loading="lazy"
          data-testid="career-card-image"
          className="size-50 shrink-0 rounded-card max-lg:hidden"
        />
      )}
    </Panel>
  );
}
