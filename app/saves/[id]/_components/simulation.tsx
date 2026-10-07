"use client";

import { Progress } from "@base-ui/react/progress";
import { ArrowRightIcon, SquareIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/src/components/ui/dialog";
import { ProgressIndicator, ProgressLabel, ProgressTrack } from "@/src/components/ui/progress";
import type { SimulatedMatch, SimulationSummary } from "@/src/db/simulation";
import { formatDate, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { planSimulationAction, simulateMatchdays, simulationSummaryAction, type SimulationTargetInput } from "../actions";
import { RESULT_CLASSES, resultFor } from "../_lib/results";
import { ResultPill } from "./result-pill";

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
      summary: SimulationSummary | null; // null when the simulation failed halfway
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

const plural = (count: number, singular: string, pluralForm: string): string =>
  `${count} ${count > 1 ? pluralForm : singular}`;

const ordinal = (rank: number): string => (rank === 1 ? "1er" : `${rank}e`);

/** A match of the managed club, its goals first: « contre Nice 3 – 2 », « à Montpellier 1 – 5 ». */
function MatchLine({ match, fresh = false }: { match: SimulatedMatch; fresh?: boolean }) {
  const atHome = match.home.isManaged;
  const opponent = atHome ? match.away : match.home;
  const homeGoals = match.homeGoals ?? 0;
  const awayGoals = match.awayGoals ?? 0;
  const [scored, conceded] = atHome ? [homeGoals, awayGoals] : [awayGoals, homeGoals];
  const result = resultFor(homeGoals, awayGoals, atHome);
  return (
    <div
      className={cn(
        "grid grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 text-sm",
        fresh && "animate-in duration-300 fade-in-0 slide-in-from-top-2",
      )}
    >
      <span className="text-xs text-muted-foreground tabular-nums first-letter:uppercase">{formatShortDate(match.scheduledAt)}</span>
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">{atHome ? "contre" : "à"}</span> {opponent.name}
      </span>
      <span className={cn("rounded-sm px-2 font-heading text-base font-bold tabular-nums", RESULT_CLASSES[result])}>
        {scored} – {conceded}
      </span>
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
  const { rankBefore, rankAfter } = summary;
  const trend =
    rankBefore === null || rankAfter === null || rankBefore === rankAfter ? null : rankAfter < rankBefore ? "up" : "down";
  return (
    <p className="flex items-center gap-3 font-heading text-2xl font-bold tabular-nums" data-simulation="rank">
      <span className="text-muted-foreground">{rankBefore === null ? "–" : ordinal(rankBefore)}</span>
      <ArrowRightIcon aria-label="puis" className="size-5 text-muted-foreground" />
      <span className={cn(trend === "up" && "text-win", trend === "down" && "text-loss")}>
        {rankAfter === null ? "–" : ordinal(rankAfter)}
      </span>
      <span className="font-sans text-sm font-normal text-muted-foreground">sur {summary.clubCount}</span>
    </p>
  );
}

function Finished({ phase, onContinue }: { phase: Extract<Phase, { kind: "finished" }>; onContinue: () => void }) {
  const { summary, matches } = phase;
  const period = `${plural(phase.played, "journée jouée", "journées jouées")} · jusqu'au ${formatDate(phase.untilDate)}`;
  return (
    <>
      <div className="space-y-1">
        <DialogTitle className="font-heading text-2xl">
          {summary === null ? "Simulation interrompue" : phase.stopped ? "Simulation arrêtée" : "Simulation terminée"}
        </DialogTitle>
        <DialogDescription>
          {summary === null
            ? `Une erreur a interrompu la simulation après ${plural(phase.played, "journée jouée", "journées jouées")}.`
            : phase.stopped
              ? `${plural(phase.played, "journée jouée", "journées jouées")} sur ${phase.total} prévues.`
              : period}
        </DialogDescription>
      </div>

      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        {summary !== null && (
          <SummarySection title="Classement">
            <RankChange summary={summary} />
          </SummarySection>
        )}

        <SummarySection title="Mes matchs">
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Votre club n&apos;a pas joué sur la période.</p>
          ) : (
            <ol className="space-y-2" data-simulation="matches">
              {matches.map((match) => (
                <li key={match.id} className="space-y-1">
                  <MatchLine match={match} />
                  {match.autoFilledSlots > 0 && (
                    <p className="pl-[5.25rem] text-xs text-warning">
                      Onze recomplété automatiquement ({plural(match.autoFilledSlots, "poste", "postes")})
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </SummarySection>

        {summary !== null && (
          <>
            <SummarySection title="Blessures">
              {summary.injuries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune blessure dans votre effectif.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {summary.injuries.map((injury, index) => (
                    <li key={`${injury.playerName}-${index}`} className="flex justify-between gap-3">
                      <span className="font-medium">{injury.playerName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatShortDate(injury.date)}
                        {injury.injuredUntil !== null && injury.injuredUntil > injury.date
                          ? ` · absent jusqu'au ${formatDate(injury.injuredUntil)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SummarySection>

            <SummarySection title="Contrats arrivés à expiration">
              {summary.expiredContracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun contrat n&apos;a expiré.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {summary.expiredContracts.map((contract) => (
                    <li key={contract.playerName} className="flex justify-between gap-3">
                      <span className="font-medium">{contract.playerName}</span>
                      <span className="text-muted-foreground tabular-nums">{formatDate(contract.contractUntil)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SummarySection>
          </>
        )}
      </div>

      <Button variant="club" className="h-9 justify-self-end px-5 font-heading text-base font-semibold" onClick={onContinue}>
        Continuer
      </Button>
    </>
  );
}

function Running({ phase, onStop }: { phase: Extract<Phase, { kind: "running" }>; onStop: () => void }) {
  const ticker = phase.matches.slice(-TICKER_LENGTH).reverse();
  return (
    <>
      <div className="space-y-1">
        <DialogTitle className="font-heading text-2xl">Simulation en cours</DialogTitle>
        <DialogDescription>Jusqu&apos;au {formatDate(phase.untilDate)}</DialogDescription>
      </div>

      <Progress.Root value={phase.played} max={phase.total} className="flex flex-wrap gap-2" data-simulation="progress">
        <ProgressLabel>Journées</ProgressLabel>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {phase.played} / {phase.total}
        </span>
        <ProgressTrack className="h-2">
          <ProgressIndicator className="bg-(--club)" />
        </ProgressTrack>
      </Progress.Root>

      <section className="min-h-24 space-y-2" aria-live="polite">
        <h3 className="eyebrow">Mon club</h3>
        {ticker.length === 0 ? (
          <p className="text-sm text-muted-foreground">Pas encore de match joué.</p>
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

      <Button variant="outline" className="justify-self-end" disabled={phase.stopping} onClick={onStop}>
        <SquareIcon className="fill-current" />
        {phase.stopping ? "Arrêt après la tranche en cours…" : "Arrêter"}
      </Button>
    </>
  );
}

/**
 * Runs quick simulations for the save's pages: the « Simuler jusqu'à… » menu and the calendar's day picking start
 * one, a modal follows it call after call, then sums it up. Each call plays at most five matchdays; « Arrêter »
 * lets the call in flight finish and stops there.
 */
export function SimulationProvider({
  saveId,
  accent,
  children,
}: {
  saveId: string;
  accent: CSSProperties; // the club accent, set again on the dialog: portaled out of the layout, it does not inherit it
  children: ReactNode;
}) {
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

  // To the calendar view, from the list view too; the month shown stays when the calendar is already open.
  const beginPicking = useCallback(() => {
    setPicking(true);
    const onCalendarView = pathname === calendar && !new URLSearchParams(window.location.search).has("vue");
    if (!onCalendarView) {
      router.push(calendar);
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
          toast.error("La simulation n'a pas pu démarrer. Réessayez.");
          return;
        }
        if (plan.matchdays === 0) {
          setPhase({ kind: "idle" });
          toast.info(`Aucune journée à jouer d'ici au ${formatDate(plan.untilDate)}.`);
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
    [busy, router, saveId],
  );

  const stop = () => {
    stopRequested.current = true;
    setPhase((current) => (current.kind === "running" ? { ...current, stopping: true } : current));
  };

  const finish = () => {
    setPhase({ kind: "idle" });
    router.push(`/saves/${saveId}`);
  };

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
        <DialogContent showCloseButton={false} style={accent} className="gap-5 p-6 sm:max-w-lg" data-simulation="dialog">
          {phase.kind === "running" && <Running phase={phase} onStop={stop} />}
          {phase.kind === "finished" && <Finished phase={phase} onContinue={finish} />}
        </DialogContent>
      </Dialog>
    </SimulationContext.Provider>
  );
}
