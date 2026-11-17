"use client";

import { useLocale, useTranslations } from "next-intl";
import { Progress } from "@base-ui/react/progress";
import { ArrowRightIcon, SquareIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/src/components/ui/dialog";
import { ProgressIndicator, ProgressLabel, ProgressTrack } from "@/src/components/ui/progress";
import type { SimulatedMatch, SimulationSummary } from "@/src/db/simulation";
import { formatDate, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import {
  planSimulationAction,
  simulateMatchdays,
  simulationSummaryAction,
  type SimulationResult,
  type SimulationTargetInput,
} from "../actions";
import { RESULT_CLASSES } from "../_lib/results";
import { isEuropeStage, matchResultFor, stageLabel } from "../_lib/stage";
import { ResultPill } from "./result-pill";
import { ScoreNotes } from "./score-notes";
import { SessionEndCard } from "./session-end-card";

/** Where a simulation stops; a picked day is sent as « 2026-08-31 ». */
export type SimulationTarget = SimulationTargetInput;

type Phase =
  | { kind: "idle" }
  | { kind: "planning" }
  | { kind: "running"; untilDate: Date; total: number; played: number; matches: SimulatedMatch[]; stopping: boolean }
  | {
      kind: "finished";
      untilDate: Date;
      fromDate: Date;
      total: number;
      played: number;
      matches: SimulatedMatch[];
      stopped: boolean;
      summary: SimulationResult | null; // null when the simulation failed halfway
    };

type SimulationContextValue = {
  busy: boolean;
  start: (target: SimulationTarget) => void;
  picking: boolean; // the manager is choosing a day in the calendar
  beginPicking: () => void; // opens the calendar to choose the day
  cancelPicking: () => void;
};

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function useSimulation(): SimulationContextValue {
  const value = useContext(SimulationContext);
  if (value === null) {
    throw new Error("useSimulation must be used inside a SimulationProvider");
  }
  return value;
}

/** The day param of a date: « 2026-08-31 ». */
const dayParam = (date: Date): string => date.toISOString().slice(0, 10);

/** Matches of the managed club shown in the running dialog, the latest first. */
const TICKER_LENGTH = 3;

/** A match of the managed club, its goals first: « contre Nice 3 – 2 », « à Montpellier 1 – 5 ». */
function MatchLine({ match, fresh = false }: { match: SimulatedMatch; fresh?: boolean }) {
  const t = useTranslations("simulation");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  const atHome = match.home.isManaged;
  const opponent = atHome ? match.away : match.home;
  const homeGoals = match.homeGoals ?? 0;
  const awayGoals = match.awayGoals ?? 0;
  const [scored, conceded] = atHome ? [homeGoals, awayGoals] : [awayGoals, homeGoals];
  const result = matchResultFor({ ...match, homeGoals, awayGoals }, atHome);
  return (
    <div
      className={cn(
        "grid grid-cols-[4.5rem_minmax(0,1fr)_auto_auto_auto] items-center gap-3 text-sm",
        fresh && "animate-in duration-300 fade-in-0 slide-in-from-top-2",
      )}
    >
      <span className="text-xs text-muted-foreground tabular-nums first-letter:uppercase">{formatShortDate(match.scheduledAt, locale)}</span>
      {/* Wrapped on a phone rather than cut. */}
      <span className="min-w-0 truncate max-sm:whitespace-normal">
        <span className="text-muted-foreground">{atHome ? t("home") : t("away")}</span> {opponent.name}
        {match.cup && <span className="ml-1.5 text-xs font-medium text-(--club)">{stageLabel(match, tStage)}</span>}
        {/* A European match: its competition and round, in the green of its calendar tag. */}
        {isEuropeStage(match) && <span className="ml-1.5 text-xs font-medium text-win">{stageLabel(match, tStage)}</span>}
      </span>
      <span className={cn("rounded-sm px-2 font-heading text-base font-bold tabular-nums", RESULT_CLASSES[result])}>
        {scored} – {conceded}
      </span>
      {/* The shoot-out's score in the managed club's order, as the goals are. */}
      <ScoreNotes match={atHome ? match : { ...match, homePenalties: match.awayPenalties, awayPenalties: match.homePenalties }} />
      <ResultPill result={result} />
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

function RankChange({ summary }: { summary: SimulationSummary }) {
  const t = useTranslations("simulation");
  const { rankBefore, rankAfter } = summary;
  const trend =
    rankBefore === null || rankAfter === null || rankBefore === rankAfter ? null : rankAfter < rankBefore ? "up" : "down";
  return (
    <p className="flex items-center gap-3 font-heading text-2xl font-bold normal-case tabular-nums" data-simulation="rank">
      <span className="text-muted-foreground">{rankBefore === null ? "–" : t("rank", { rank: rankBefore })}</span>
      <ArrowRightIcon aria-label={t("then")} className="size-5 text-muted-foreground" />
      <span className={cn(trend === "up" && "text-win", trend === "down" && "text-loss")}>
        {rankAfter === null ? "–" : t("rank", { rank: rankAfter })}
      </span>
      <span className="font-sans text-sm font-normal text-muted-foreground">{t("outOf", { count: summary.clubCount })}</span>
    </p>
  );
}

type FinishedProps = {
  saveId: string;
  phase: Extract<Phase, { kind: "finished" }>;
  onContinue: () => void; // to the dashboard
  onLeave: () => void; // the dialog closed, a link of its « À demain » card followed
};

function Finished({ saveId, phase, onContinue, onLeave }: FinishedProps) {
  const t = useTranslations("simulation");
  const locale = useLocale();
  const { summary, matches } = phase;
  const period = t("period", { count: phase.played, date: formatDate(phase.untilDate, locale) });
  return (
    <>
      <div className="space-y-1">
        <DialogTitle className="font-heading text-2xl" data-testid="simulation-title">
          {summary === null ? t("interrupted") : phase.stopped ? t("stopped") : t("finished")}
        </DialogTitle>
        <DialogDescription data-testid="simulation-description">
          {summary === null
            ? t("interruptedAfter", { count: phase.played })
            : phase.stopped
              ? t("stoppedAfter", { count: phase.played, total: phase.total })
              : period}
        </DialogDescription>
      </div>

      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        {summary !== null && (
          <SummarySection title={t("table")}>
            <RankChange summary={summary} />
          </SummarySection>
        )}

        <SummarySection title={t("myMatches")}>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMatches")}</p>
          ) : (
            <ol className="space-y-2" data-simulation="matches">
              {matches.map((match) => (
                <li key={match.id} className="space-y-1">
                  <MatchLine match={match} />
                  {match.autoFilledSlots > 0 && (
                    <p className="pl-[5.25rem] text-xs text-warning">{t("autoFilled", { count: match.autoFilledSlots })}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </SummarySection>

        {summary !== null && (
          <>
            <SummarySection title={t("injuries")}>
              {summary.injuries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noInjuries")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {summary.injuries.map((injury, index) => (
                    <li key={`${injury.playerName}-${index}`} className="flex justify-between gap-3">
                      <span className="font-medium">{injury.playerName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatShortDate(injury.date, locale)}
                        {injury.injuredUntil !== null && injury.injuredUntil > injury.date
                          ? ` · ${t("outUntil", { date: formatDate(injury.injuredUntil, locale) })}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SummarySection>

            <SummarySection title={t("expiredContracts")}>
              {summary.expiredContracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noExpiredContracts")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {summary.expiredContracts.map((contract) => (
                    <li key={contract.playerName} className="flex justify-between gap-3">
                      <span className="font-medium">{contract.playerName}</span>
                      <span className="text-muted-foreground tabular-nums">{formatDate(contract.contractUntil, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SummarySection>

            <SessionEndCard
              saveId={saveId}
              appointment={summary.sessionEnd.appointment}
              word={summary.sessionEnd.word}
              mission={summary.sessionEnd.mission}
              onNavigate={onLeave}
              className="bg-background"
            />
          </>
        )}
      </div>

      <Button
        variant="club"
        className="h-9 justify-self-end px-5 font-heading text-base font-semibold"
        onClick={onContinue}
        data-testid="simulation-continue"
      >
        {t("continue")}
      </Button>
    </>
  );
}

function Running({ phase, onStop }: { phase: Extract<Phase, { kind: "running" }>; onStop: () => void }) {
  const t = useTranslations("simulation");
  const locale = useLocale();
  const ticker = phase.matches.slice(-TICKER_LENGTH).reverse();
  return (
    <>
      <div className="space-y-1">
        <DialogTitle className="font-heading text-2xl" data-testid="simulation-title">
          {t("running")}
        </DialogTitle>
        <DialogDescription data-testid="simulation-description">{t("until", { date: formatDate(phase.untilDate, locale) })}</DialogDescription>
      </div>

      <Progress.Root value={phase.played} max={phase.total} className="flex flex-wrap gap-2" data-simulation="progress">
        <ProgressLabel>{t("matchdays")}</ProgressLabel>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {phase.played} / {phase.total}
        </span>
        <ProgressTrack className="h-2">
          <ProgressIndicator className="bg-(--club)" />
        </ProgressTrack>
      </Progress.Root>

      <section className="min-h-24 space-y-2" aria-live="polite">
        <h3 className="eyebrow">{t("myClub")}</h3>
        {ticker.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMatchYet")}</p>
        ) : (
          <ol className="space-y-1.5">
            {ticker.map((match, index) => (
              <li key={match.id} className={cn(index > 0 && "opacity-60")}>
                <MatchLine match={match} fresh={index === 0} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <Button variant="outline" className="justify-self-end" disabled={phase.stopping} onClick={onStop} data-testid="simulation-stop">
        <SquareIcon className="fill-current" />
        {phase.stopping ? t("stopping") : t("stop")}
      </Button>
    </>
  );
}

/**
 * Runs quick simulations for the save's pages: the « Simuler jusqu'à… » menu and the calendar's day picking start
 * one, a modal follows it call after call, then sums it up. Each call plays at most five matchdays; « Arrêter »
 * lets the call in flight finish and stops there.
 */
export function SimulationProvider({ saveId, children }: { saveId: string; children: ReactNode }) {
  const t = useTranslations("simulation");
  const tLive = useTranslations("liveMatch");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [picking, setPicking] = useState(false);
  const stopRequested = useRef(false);
  const busy = phase.kind !== "idle";
  const calendar = `/saves/${saveId}/fixtures`;

  // Leaving the calendar ends the picking, so a later visit shows it as usual (state adjusted during render).
  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    if (pathname !== calendar) {
      setPicking(false);
    }
  }

  // To the grid, from the list too; the month shown stays when the grid is already open.
  const beginPicking = useCallback(() => {
    setPicking(true);
    const onGrid = pathname === calendar && new URLSearchParams(window.location.search).get("vue") === "grille";
    if (!onGrid) {
      router.push(`${calendar}?vue=grille`);
    }
  }, [calendar, pathname, router]);
  const cancelPicking = useCallback(() => setPicking(false), []);

  const start = useCallback(
    (target: SimulationTarget) => {
      if (busy) {
        return;
      }
      setPicking(false);
      setPhase({ kind: "planning" });
      stopRequested.current = false;

      void (async () => {
        let plan;
        try {
          plan = await planSimulationAction(saveId, target);
        } catch {
          setPhase({ kind: "idle" });
          toast.error(t("startFailed"));
          return;
        }
        if (plan.matchInProgress) {
          setPhase({ kind: "idle" });
          toast.error(tLive("matchInProgress"));
          return;
        }
        if (plan.matchdays === 0) {
          setPhase({ kind: "idle" });
          toast.info(t("nothingToPlay", { date: formatDate(plan.untilDate, locale) }));
          return;
        }

        const { fromDate, untilDate, matchdays: total } = plan;
        let played = 0;
        let matches: SimulatedMatch[] = [];
        setPhase({ kind: "running", untilDate, total, played, matches, stopping: false });
        try {
          for (;;) {
            const batch = await simulateMatchdays(saveId, dayParam(untilDate));
            played += batch.played;
            matches = [...matches, ...batch.matches];
            setPhase((current) =>
              current.kind === "running" ? { ...current, played, matches } : current,
            );
            if (batch.done || batch.played === 0 || stopRequested.current) {
              break;
            }
          }
          const summary = await simulationSummaryAction(saveId, dayParam(fromDate));
          setPhase({ kind: "finished", untilDate, fromDate, total, played, matches, stopped: stopRequested.current, summary });
        } catch {
          setPhase({ kind: "finished", untilDate, fromDate, total, played, matches, stopped: false, summary: null });
        }
        router.refresh();
      })();
    },
    [busy, locale, router, saveId, t, tLive],
  );

  const stop = () => {
    stopRequested.current = true;
    setPhase((current) => (current.kind === "running" ? { ...current, stopping: true } : current));
  };

  const finish = () => {
    setPhase({ kind: "idle" });
    router.push(`/saves/${saveId}`);
  };

  // A link of the summary's « À demain » card: its page, the dialog closed.
  const leave = () => setPhase({ kind: "idle" });

  const value = useMemo(
    () => ({ busy, start, picking, beginPicking, cancelPicking }),
    [busy, start, picking, beginPicking, cancelPicking],
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
      <Dialog
        open={phase.kind === "running" || phase.kind === "finished"}
        // Only « Continuer » closes it: the simulation runs to its end, the summary is read.
        onOpenChange={() => {}}
        disablePointerDismissal
      >
        <DialogContent
          showCloseButton={false}
          className="gap-5 p-6 sm:max-w-lg"
          data-simulation="dialog"
          data-testid="simulation-dialog"
        >
          {phase.kind === "running" && <Running phase={phase} onStop={stop} />}
          {phase.kind === "finished" && <Finished saveId={saveId} phase={phase} onContinue={finish} onLeave={leave} />}
        </DialogContent>
      </Dialog>
    </SimulationContext.Provider>
  );
}
