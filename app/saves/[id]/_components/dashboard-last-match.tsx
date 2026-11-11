import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "@/src/components/link";
import type { ReactNode } from "react";
import type { Dashboard, Scorer } from "@/src/db/dashboard";
import { cn } from "@/src/lib/utils";
import { monthOf, monthParam } from "../fixtures/_lib/month-grid";
import { RESULT_CLASSES } from "../_lib/results";
import { matchResultFor, stageLabel } from "../_lib/stage";
import { Panel, PanelTitle } from "@/src/components/panel";
import { ScoreNotes } from "./score-notes";

const TEAM_NAME = "w-full font-heading text-2xl leading-tight text-balance wrap-break-word";

function Scorers({ scorers, className }: { scorers: Scorer[]; className?: string }) {
  return (
    <ul className={cn("space-y-1", className)}>
      {scorers.map((scorer, index) => (
        <li key={index}>
          {scorer.name} {scorer.minute}&apos;
        </li>
      ))}
    </ul>
  );
}

function LastResult({ saveId, lastResult }: { saveId: string; lastResult: NonNullable<Dashboard["lastResult"]> }) {
  const t = useTranslations("dashboard");
  const tStage = useTranslations("stage");
  const { fixture, homeScorers, awayScorers } = lastResult;
  const { home, away, homeGoals, awayGoals } = fixture;
  const result = matchResultFor({ ...fixture, homeGoals: homeGoals ?? 0, awayGoals: awayGoals ?? 0 }, home.isManaged);
  return (
    <>
      <PanelTitle>
        {t("lastResult")} · {stageLabel(fixture, tStage)}
      </PanelTitle>
      {/* Home, score and away one above the other, at every width: beside a score, a column of 300 px would cut a name in
          the middle of a word. */}
      <div className="flex flex-col items-center gap-1 pt-5 text-center">
        <p className={TEAM_NAME}>{home.name}</p>
        <p className={cn("rounded-md px-2 py-1 font-heading text-4xl leading-tight tabular-nums", RESULT_CLASSES[result])}>
          {homeGoals} – {awayGoals}
        </p>
        <p className={TEAM_NAME}>{away.name}</p>
      </div>
      <ScoreNotes match={fixture} className="mt-1 block text-center" />
      <div className="grid flex-1 grid-cols-2 gap-4 pt-4 text-sm wrap-break-word tabular-nums">
        <Scorers scorers={homeScorers} />
        <Scorers scorers={awayScorers} className="text-right" />
      </div>
      <Link
        // The month of this match: the calendar opens on the next one's, which may be another.
        href={`/saves/${saveId}/fixtures?mois=${monthParam(monthOf(fixture.scheduledAt))}`}
        data-testid="dashboard-match-report"
        className="mt-4 inline-flex items-center gap-0.5 self-start text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:min-h-11"
      >
        {t("matchReport")}
        <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
      </Link>
    </>
  );
}

type LastMatchCardProps = {
  saveId: string;
  dashboard: Dashboard;
  firstActions: ReactNode; // in place of the result until the club's first match: nothing (null, false) afterwards
  className?: string;
};

/** The managed club's last match, or a new save's first actions before it. */
export function LastMatchCard({ saveId, dashboard, firstActions, className }: LastMatchCardProps) {
  const t = useTranslations("dashboard");
  const tFirstSteps = useTranslations("firstSteps");
  const { lastResult } = dashboard;
  return (
    <Panel className={cn("flex flex-col", className)} data-testid="dashboard-last-result">
      {firstActions ? (
        <>
          <PanelTitle>{tFirstSteps("title")}</PanelTitle>
          {firstActions}
        </>
      ) : lastResult === null ? (
        <>
          <PanelTitle>{t("lastResult")}</PanelTitle>
          <p className="py-10 text-center text-muted-foreground">{t("noMatchPlayed")}</p>
        </>
      ) : (
        <LastResult saveId={saveId} lastResult={lastResult} />
      )}
    </Panel>
  );
}
