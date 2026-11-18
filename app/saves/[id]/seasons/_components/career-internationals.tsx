import { useTranslations } from "next-intl";
import type { CareerHistoryView } from "@/src/db/career-history";
import type { ClubInternational } from "@/src/db/nations-view";
import { Panel } from "@/src/components/panel";
import { HISTORY_TITLE } from "./trophy-room";

/**
 * The club's players with their national teams (docs/design/selections.md § 9.9): the summer tournaments they won while
 * at the club (the highlights of the season whose transition played it), then its most capped internationals, their caps
 * and goals while at the club.
 */
export function CareerInternationals({ history, internationals }: { history: CareerHistoryView; internationals: readonly ClubInternational[] }) {
  const t = useTranslations("seasons.history.internationals");
  const tNations = useTranslations("nations");
  const tWorld = useTranslations("world");
  return (
    <Panel aria-labelledby="history-internationals-title" data-testid="history-internationals" className="space-y-4">
      <h2 id="history-internationals-title" className={HISTORY_TITLE}>
        {t("title")}
      </h2>
      <section className="space-y-1.5">
        <h3 className="eyebrow">{t("titles")}</h3>
        {history.internationalTitles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTitle")}</p>
        ) : (
          <ul data-testid="history-international-titles" className="space-y-1 text-sm">
            {history.internationalTitles.map((title) => (
              <li key={`${title.tournament}-${title.year}`} data-testid="history-international-title" data-year={title.year} className="font-semibold">
                {t("titleLine", {
                  year: title.year,
                  name: tNations(title.tournament === "int.eu" ? "tournaments.eu" : "tournaments.world"),
                  players: title.players.map((player) => player.name).join(", "),
                  nation: tWorld(`nationalities.${title.nation}`),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-1.5">
        <h3 className="eyebrow">{t("players")}</h3>
        {internationals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ol data-testid="history-internationals-players" className="divide-y text-sm">
            {internationals.map((player) => (
              <li key={player.playerKey} className="flex min-h-10 items-center gap-3 py-1.5">
                <span className="inline-grid h-6 min-w-10 place-items-center rounded-md bg-secondary px-1.5 font-heading text-xs leading-none">
                  {player.nation}
                </span>
                <span className="min-w-0 flex-1 font-semibold wrap-break-word">{player.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{t("playerLine", { caps: player.caps, goals: player.goals })}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">{t("explain")}</p>
      </section>
    </Panel>
  );
}
