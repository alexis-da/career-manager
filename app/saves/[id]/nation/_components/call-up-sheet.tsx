"use client";

import { CheckIcon, HeartPulseIcon, RotateCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import type { CallUpCandidate } from "@/src/db/national-view";
import { CALL_UP_BY_GROUP, CALL_UP_SIZE } from "@/src/engine/balance";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { cn } from "@/src/lib/utils";
import { PositionBadge } from "../../_components/position-badge";
import { fitnessFigure, fitnessTextClass } from "../../_lib/fitness";
import { callUpIssue, callUpLines, goalkeepersOf, selectedKeys, type CallUpLine } from "../_lib/call-up";
import { saveCoachCallUpAction } from "../actions";
import { useNationAction } from "./use-nation-action";

/** What the sheet needs of his list's editor: the candidates it shows and the lists it starts from. */
export type CallUpSheetData = {
  candidates: CallUpCandidate[]; // best first
  assistant: string[]; // his assistant's 23: « Réinitialiser » comes back to them
  initial: string[]; // the list it opens on: his own, else his assistant's
  hidden: number; // the nation's players it leaves out, rated lower
};

type CandidateRowProps = {
  candidate: CallUpCandidate;
  selected: boolean;
  onToggle: (key: string) => void;
};

/**
 * A candidate, a box to tick: his rating, his name, his position, his club (or « Hors championnats »), « Ton club » for one
 * of the coach's own, his caps, his fitness on the first date. Injured then, he cannot be ticked.
 */
function CandidateRow({ candidate, selected, onToggle }: CandidateRowProps) {
  const t = useTranslations("nationalTeam.sheet");
  const tNations = useTranslations("nations");
  const fitness = fitnessFigure(candidate.fitness);
  const fitnessLabel = t("fitness", { fitness });
  return (
    <li>
      <label
        data-testid="call-up-candidate"
        data-key={candidate.key}
        data-selected={selected}
        data-own-club={candidate.ownClub}
        data-injured={candidate.injured || undefined}
        className={cn(
          "grid min-h-11 grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-lg px-2 py-1.5 select-none has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          candidate.injured ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted",
          selected && "bg-secondary",
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={candidate.injured}
          onChange={() => onToggle(candidate.key)}
          className="sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "grid size-5 place-items-center rounded-md border-2",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60",
          )}
        >
          {selected && <CheckIcon className="size-3.5" strokeWidth={3} />}
        </span>
        <span className="text-center font-heading text-xl leading-none tabular-nums">{candidate.overall}</span>
        <span className="min-w-0">
          {/* On two lines if need be, never cut. */}
          <span className="block text-sm leading-tight font-semibold wrap-break-word">
            {candidate.firstName} {candidate.lastName}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <PositionBadge position={candidate.position} />
            <span className="wrap-break-word">{candidate.club ?? tNations("outsideLeagues")}</span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">{t("caps", { count: candidate.caps })}</span>
            {candidate.ownClub && (
              <span className="rounded-full border border-(--club)/60 px-1.5 text-[0.6875rem] leading-4 font-bold text-(--club)">{t("ownClub")}</span>
            )}
            {candidate.injured && <span className="font-bold text-loss">{t("injured")}</span>}
          </span>
        </span>
        <span title={fitnessLabel} className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", fitnessTextClass(fitness))}>
          <HeartPulseIcon aria-hidden className="size-3.5 shrink-0" />
          <span aria-hidden>{fitness}</span>
          <span className="sr-only">{fitnessLabel}</span>
        </span>
      </label>
    </li>
  );
}

/** A line of the list: its players called, then, under « Non appelés », the others; its count of goalkeepers warned when short. */
function LineSection({ line, selected, onToggle }: { line: CallUpLine; selected: ReadonlySet<string>; onToggle: (key: string) => void }) {
  const t = useTranslations("nationalTeam.sheet");
  const short = line.line === "GK" && line.called.length < CALL_UP_BY_GROUP.GK;
  const row = (candidate: CallUpCandidate) => (
    <CandidateRow key={candidate.key} candidate={candidate} selected={selected.has(candidate.key)} onToggle={onToggle} />
  );
  return (
    <section aria-labelledby={`call-up-line-${line.line}`} data-testid="call-up-line" data-line={line.line} data-count={line.called.length}>
      <h3 id={`call-up-line-${line.line}`} className={cn("eyebrow px-2 pt-3 pb-1", short && "text-warning")}>
        {t(`lines.${line.line}`, { count: line.called.length })}
      </h3>
      {line.called.length > 0 && <ul className="space-y-0.5">{line.called.map(row)}</ul>}
      {line.others.length > 0 && (
        <>
          <h4 className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{t("notCalled")}</h4>
          <ul className="space-y-0.5">{line.others.map(row)}</ul>
        </>
      )}
    </section>
  );
}

type CallUpSheetProps = {
  saveId: string;
  data: CallUpSheetData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * His list of 23 for his next break or tournament, a sheet from the foot of the screen under 1024 px, beside the page
 * above: « Convocations · 18 / 23 » and « Réinitialiser » (his assistant's list), the candidates line by line, those called
 * first, then « Enregistrer la liste », the sheet's only orange, until the list holds 23 players, three goalkeepers among
 * them (it says why). It opens on the list as it stands: mounted anew at each opening (its parent's key).
 */
export function CallUpSheet({ saveId, data, open, onOpenChange }: CallUpSheetProps) {
  const t = useTranslations("nationalTeam.sheet");
  const computer = useMediaQuery(COMPUTER_QUERY);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(data.initial));
  const [refusal, setRefusal] = useState<string | null>(null);
  const { pending, run } = useNationAction();
  const keys = selectedKeys(data.candidates, selected);
  const issue = callUpIssue(data.candidates, selected);

  const toggle = (key: string) => {
    setRefusal(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const reset = () => {
    setRefusal(null);
    setSelected(new Set(data.assistant));
  };

  const save = () => {
    setRefusal(null);
    run(() => saveCoachCallUpAction(saveId, keys), { onSuccess: () => onOpenChange(false), onRefusal: setRefusal });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={computer ? "right" : "bottom"}
        data-testid="call-up-sheet"
        className="gap-0 overflow-hidden border-secondary bg-card data-[side=bottom]:max-h-[calc(100dvh-2.5rem)] data-[side=bottom]:rounded-t-card data-[side=right]:w-full lg:data-[side=right]:w-110 lg:data-[side=right]:max-w-none"
      >
        {/* The cross is in the corner of the sheet. */}
        <div className="px-4 pt-4 pr-14 pb-2 sm:px-6 sm:pr-14">
          <SheetTitle data-testid="call-up-count" data-count={keys.length} className="text-2xl leading-none font-bold tabular-nums">
            {t("title", { count: keys.length, size: CALL_UP_SIZE })}
          </SheetTitle>
          <SheetDescription className="mt-1.5 leading-snug">
            {t("description", { size: CALL_UP_SIZE, goalkeepers: CALL_UP_BY_GROUP.GK })}
          </SheetDescription>
          <Button variant="ghost" size="sm" onClick={reset} disabled={pending} data-testid="call-up-reset" className="mt-1.5 -ml-2.5">
            <RotateCcwIcon data-icon="inline-start" />
            {t("reset")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-2 pb-3 sm:px-4">
          {callUpLines(data.candidates, selected).map((line) => (
            <LineSection key={line.line} line={line} selected={selected} onToggle={toggle} />
          ))}
          {data.hidden > 0 && <p className="px-2 pt-3 text-xs text-muted-foreground">{t("hidden", { count: data.hidden })}</p>}
        </div>
        <div className="space-y-2.5 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <p
            data-testid="call-up-issue"
            data-issue={issue?.kind ?? "none"}
            aria-live="polite"
            className={cn("text-sm leading-snug", issue === null ? "text-muted-foreground" : "text-warning")}
          >
            {issue === null
              ? t("ready", { size: CALL_UP_SIZE, count: goalkeepersOf(data.candidates, selected) })
              : t(`issue.${issue.kind}`, { size: CALL_UP_SIZE, goalkeepers: CALL_UP_BY_GROUP.GK, count: issue.count })}
          </p>
          {refusal !== null && (
            <p role="alert" data-testid="call-up-refusal" className="text-sm leading-snug text-loss">
              {refusal}
            </p>
          )}
          <Button
            variant="club"
            disabled={issue !== null || pending}
            aria-busy={pending}
            onClick={save}
            data-testid="call-up-save"
            className="h-12 w-full font-heading text-lg font-semibold"
          >
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
