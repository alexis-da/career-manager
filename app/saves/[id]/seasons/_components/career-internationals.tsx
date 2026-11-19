import { Fragment } from "react";
import { useTranslations } from "next-intl";
import type { CareerHistoryView } from "@/src/db/career-history";
import type { CoachHistory } from "@/src/db/national-view";
import type { ClubInternational } from "@/src/db/nations-view";
import { Panel } from "@/src/components/panel";
import { cn } from "@/src/lib/utils";
import { coachSpellLine } from "../_lib/coach";
import { HISTORY_TITLE } from "./trophy-room";

/** A nation's code in a pill: « POR ». */
const NATION_PILL = "inline-grid h-6 min-w-10 shrink-0 place-items-center rounded-md bg-secondary px-1.5 font-heading text-xs leading-none";

/**
 * The manager's career as a national coach (docs/design/selections.md § 9.9): a line per mission, its nation and
 * seasons, the summer tournaments of his nation under him and how it ended. Shown from his first mission on.
 */
function CoachCareer({ coach }: { coach: CoachHistory }) {
  const t = useTranslations("seasons");
  const tWorld = useTranslations("world");
  const tNations = useTranslations("nations");
  return (
    <section data-testid="history-coach" className="space-y-1.5">
      <h3 className="eyebrow">{t("history.coach.title")}</h3>
      <ul className="space-y-2 text-sm">
        {coach.spells.map((spell) => {
          const line = coachSpellLine(spell, t, tWorld, tNations);
          return (
            <li
              key={`${spell.code}-${spell.fromYear}`}
              data-testid="history-coach-spell"
              data-nation={spell.code}
              data-in-post={String(spell.toYear === null)}
              className="flex items-start gap-3"
            >
              <span className={NATION_PILL}>{spell.code}</span>
              <p className="min-w-0 flex-1 leading-snug tabular-nums">
                <span className="font-semibold">{line.head}</span>
                {line.parts.map((part, index) => (
                  <Fragment key={index}>
                    {" · "}
                    <span className={cn(part.won ? "font-semibold text-(--club)" : "text-muted-foreground")}>{part.text}</span>
                  </Fragment>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The club's players with their national teams (docs/design/selections.md § 9.9): the manager's own missions as a
 * national coach when he has had one, the summer tournaments his players won while at the club (the highlights of the
 * season whose transition played it), then its most capped internationals, their caps and goals while at the club.
 */
export function CareerInternationals({
  history,
  internationals,
  coach = null,
}: {
  history: CareerHistoryView;
  internationals: readonly ClubInternational[];
  coach?: CoachHistory | null;
}) {
  const t = useTranslations("seasons.history.internationals");
  const tNations = useTranslations("nations");
  const tWorld = useTranslations("world");
  return (
    <Panel aria-labelledby="history-internationals-title" data-testid="history-internationals" className="space-y-4">
      <h2 id="history-internationals-title" className={HISTORY_TITLE}>
        {t("title")}
      </h2>
      {coach !== null && <CoachCareer coach={coach} />}
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
                <span className={NATION_PILL}>{player.nation}</span>
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
