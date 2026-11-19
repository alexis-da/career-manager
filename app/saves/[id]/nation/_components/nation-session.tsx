import { useLocale, useTranslations } from "next-intl";
import { Panel, PanelTitle } from "@/src/components/panel";
import type { NationalTeamView } from "@/src/db/national-view";
import { dayRange, tournamentName } from "../../_components/coach-names";
import { lineKey, nextStopIndex, sessionTournament } from "../_lib/nation";
import { NationMatchLine } from "./nation-match-line";

/**
 * His next break or summer tournament (docs/design/selections.md § 9.7): its dates, under way or not, and his nation's
 * matches in it (its friendlies left to his assistant said so, its next match at stake set apart, the score of those
 * played); or that there is none left this season.
 */
export function NationSession({ view }: { view: NationalTeamView }) {
  const t = useTranslations("nationalTeam.session");
  const tNations = useTranslations("nations");
  const locale = useLocale();
  const { session } = view;
  if (session === null) {
    return (
      <Panel aria-labelledby="nation-session-title" data-testid="nation-session" data-kind="none" className="space-y-2">
        <PanelTitle id="nation-session-title">{t("noneTitle")}</PanelTitle>
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      </Panel>
    );
  }
  const range = dayRange(session.first, session.last, locale);
  const tournament = sessionTournament(view);
  const next = nextStopIndex(session.matches);
  return (
    <Panel
      aria-labelledby="nation-session-title"
      data-testid="nation-session"
      data-kind={session.kind}
      data-started={session.started}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <h2 id="nation-session-title" className="min-w-0 font-heading text-[1.625rem] leading-[1.05] wrap-break-word">
          {tournament === null ? t("break", range) : t("tournament", { tournament: tournamentName(tournament.tournament, tournament.year, tNations), ...range })}
        </h2>
        {session.started && (
          <span data-testid="nation-session-underway" className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
            {t("underway")}
          </span>
        )}
      </div>
      {session.matches.length > 0 && (
        <ol className="space-y-1.5">
          {session.matches.map((line, index) => (
            <NationMatchLine key={lineKey(line)} line={line} code={view.code} testId="nation-session-match" next={index === next} assistantShown />
          ))}
        </ol>
      )}
      {/* The game stops before his matches at stake only: none left, nothing to say. */}
      {next >= 0 && <p className="text-xs text-muted-foreground">{t("hint")}</p>}
    </Panel>
  );
}
