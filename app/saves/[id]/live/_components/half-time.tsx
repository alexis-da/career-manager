"use client";

import { useTranslations } from "next-intl";
import { ArrowRightLeftIcon, ChevronDownIcon, PlayIcon, SkipForwardIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { toast } from "sonner";
import { PlayerFace } from "@/src/components/player-face";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import type { TeamView } from "@/src/db/calendar";
import type { HalfTimePlayer, HalfTimeTeam } from "@/src/db/live-match";
import { FORMATION_NAMES, FORMATIONS, isFormationName } from "@/src/engine/formations";
import { ratingAt, type Position } from "@/src/engine/positions";
import type { Translator } from "@/src/i18n/translator";
import type { ClubColors } from "@/src/lib/color";
import { getOrThrow } from "@/src/lib/maps";
import { cn } from "@/src/lib/utils";
import { FitnessGauge } from "../../_components/fitness-gauge";
import { LineupSummary } from "../../_components/lineup-summary";
import { Pitch } from "../../_components/pitch";
import { PositionBadges } from "../../_components/position-badge";
import { fitnessFigure } from "../../_lib/fitness";
import { isOffPosition, positionFit } from "../../_lib/positions";
import { resumeMatch } from "../../actions";
import { slotTarget, usePointerDrag, type DragSource, type DropTarget } from "../../lineup/_components/use-pointer-drag";
import { coachAdvice } from "../_lib/coach-advice";
import {
  cancelSubstitution,
  halfTimeChoice,
  substitute,
  substitutionsMade,
  suggestChange,
  swapSlots,
  switchFormation,
  type HalfTimeRules,
  type HalfTimeState,
  type Move,
  type SuggestedChange,
} from "../_lib/half-time-moves";

/** Gap between the pointer and the dragged player's tag. */
const GHOST_OFFSET_PX = 14;

/**
 * How long the ways on stay out of reach once the panel opens: on a phone they come right under the bar's button, and a
 * second tap meant for it, or one that came as the clock reached the break, would resume the match for good.
 */
const RESUME_GUARD_MS = 500;

/** Side margins of the panel, its content and its foot alike. */
const PANEL_GUTTER = "px-4 sm:px-6 lg:px-7";

/** A club's name beside the score. On a phone, smaller: a word longer than its column wraps rather than being cut. */
const SCORE_NAME =
  "min-w-0 font-heading leading-tight font-bold text-balance wrap-break-word max-[390px]:text-sm min-[390px]:max-sm:text-base sm:text-lg";

type HalfTimeProps = {
  saveId: string;
  team: HalfTimeTeam;
  open: boolean; // closed, the changes stay here: the page's Coaching button opens the panel on them again
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>; // that button: the one that was pressed to get here has gone
  home: TeamView;
  away: TeamView;
  homeGoals: number; // at this break
  awayGoals: number;
  onResumed: () => void; // what follows the break is played and saved: replay it
};

/**
 * The Coaching panel, for a match paused at a break: half-time, or the end of regulation time of a level cup tie (one
 * more substitution then, before extra time). The screen's whole size under lg, beside the match from there. The
 * assistant says where things stand and suggests a substitution, made by touching it as by a drag; a change can be
 * undone until the restart. Unfolded, the full line-up: the eleven on the pitch (players injured in the first half in
 * red, a sent-off player's slot crossed out) and the bench. A substitute dropped on a slot comes on, the player in the
 * slot goes off; starters moved between slots or another formation cost no substitution. The keyboard way is the
 * lineup page's: a slot, then a substitute or another slot.
 */
export function HalfTime({
  saveId,
  team,
  open,
  onOpenChange,
  returnFocusTo,
  home,
  away,
  homeGoals,
  awayGoals,
  onResumed,
}: HalfTimeProps) {
  const t = useTranslations("halfTime");
  const tPositions = useTranslations("positions");
  const [rules] = useState<HalfTimeRules>(() => ({
    injured: new Set(team.injured),
    sentOffSlots: new Set(team.sentOff.map((entry) => entry.slot)),
    substitutionsBefore: team.substitutions,
    maxSubstitutions: team.maxSubstitutions,
  }));
  const regulationEnd = team.phase === "REGULATION_END";
  const [state, setState] = useState<HalfTimeState>(() => ({
    formation: team.formation,
    starters: team.starters,
    bench: team.bench,
    off: [],
    substitutions: [],
  }));
  const [selected, setSelected] = useState<number | null>(null);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [settled, setSettled] = useState(false); // the panel has been open for RESUME_GUARD_MS
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), RESUME_GUARD_MS);
    return () => {
      window.clearTimeout(timer);
      setSettled(false);
    };
  }, [open]);

  const byKey = new Map(team.players.map((player) => [player.id, player]));
  const slots = FORMATIONS[state.formation];
  const sentOff = new Map(team.sentOff.flatMap(({ slot, playerKey }) => {
    const player = byKey.get(playerKey);
    return player === undefined ? [] : [[slot, player] as const];
  }));

  const apply = (move: Move): void => {
    if (move.ok) {
      setState(move.state);
    } else {
      toast.error(move.message);
    }
    setSelected(null);
  };

  const { drag, sourceProps } = usePointerDrag(
    (source: DragSource, target: DropTarget) => {
      if (target.kind !== "slot") {
        return;
      }
      apply(
        source.kind === "slot"
          ? swapSlots(state, rules, source.index, target.index, t)
          : substitute(state, rules, target.index, source.key, t),
      );
    },
    { scrollContainer: scroller },
  );

  const clickSlot = (index: number): void => {
    if (selected === null) {
      setSelected(rules.sentOffSlots.has(index) ? null : index);
    } else if (selected === index) {
      setSelected(null);
    } else {
      apply(swapSlots(state, rules, selected, index, t));
    }
  };

  const clickSubstitute = (key: string): void => {
    if (selected === null) {
      toast.info(t("selectFirst"));
      return;
    }
    apply(substitute(state, rules, selected, key, t));
  };

  const changeFormation = (value: string): void => {
    if (isFormationName(value)) {
      setState(switchFormation(state, rules, value, team.players));
      setSelected(null);
    }
  };

  const cancelChange = (change: HalfTimeState["substitutions"][number]): void => {
    setState(cancelSubstitution(state, change));
    setSelected(null);
  };

  const resume = (withChanges: boolean): void =>
    startTransition(async () => {
      try {
        const result = await resumeMatch(saveId, withChanges ? halfTimeChoice(state, rules, team.players) : null);
        if (result.ok) {
          onResumed();
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error(t("resumeFailed"));
      }
    });

  const made = substitutionsMade(state, rules);
  const selectedPosition: Position | null = selected === null ? null : slots[selected].position;
  const dragged = drag === null ? null : (byKey.get(drag.source.key) ?? null);
  const suggestion = suggestChange(state, rules, team.players);
  const advice = coachAdvice(
    {
      phase: team.phase,
      goalDifference: home.isManaged ? homeGoals - awayGoals : awayGoals - homeGoals,
      state,
      rules,
      suggestion,
      booked: team.booked,
      players: byKey,
    },
    t,
  );

  return (
    // Modal: only Escape and the cross close it, a drag may end anywhere.
    <Sheet modal disablePointerDismissal open={open} onOpenChange={onOpenChange}>
      <SheetContent
        // The panel's start rather than its first control: the suggestion would take a stray Enter at the whistle.
        initialFocus={scroller}
        finalFocus={returnFocusTo}
        data-half-time={team.phase}
        data-testid="half-time"
        className="gap-0 overflow-hidden border-secondary bg-card data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-none lg:data-[side=right]:w-110 lg:data-[side=right]:border-l"
      >
        {/* It scrolls, not the panel: the cross stays in place. */}
        <div ref={scroller} tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain outline-none">
          <div className={cn("mx-auto w-full max-w-lg grow space-y-5 pt-5 pb-6 lg:pt-7", PANEL_GUTTER)}>
            <div className="space-y-3">
              {/* The cross is in the corner of the panel. */}
              <div className="pr-10">
                <SheetTitle data-testid="half-time-title" className="text-4xl leading-none font-bold">
                  {regulationEnd ? t("title.regulationEnd") : t("title.halfTime")}
                </SheetTitle>
                <SheetDescription className="mt-1 font-bold text-(--club)">{t("paused")}</SheetDescription>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 max-sm:gap-2">
                <p className={cn(SCORE_NAME, "text-right")}>{home.name}</p>
                <p className="font-heading text-4xl font-bold tabular-nums">
                  {homeGoals} – {awayGoals}
                </p>
                <p className={SCORE_NAME}>{away.name}</p>
              </div>

              <p
                data-substitutions
                data-testid="half-time-substitutions"
                className={cn("text-sm", made >= team.maxSubstitutions ? "text-warning" : "text-muted-foreground")}
              >
                {t("substitutions", { made, max: team.maxSubstitutions })}
                {regulationEnd && ` · ${t("oneMore")}`}
              </p>
            </div>

            <p data-testid="half-time-advice" className="text-[0.9375rem] leading-[1.45] text-muted-foreground">
              {t("advice.intro")} {t("advice.open")}
              {advice.map((line, index) => (
                <span
                  key={line.topic}
                  data-testid={line.topic === "injured" ? "half-time-injured" : undefined}
                  className={cn(line.topic === "injured" && "font-semibold text-loss")}
                >
                  {index > 0 && " "}
                  {line.text}
                </span>
              ))}
              {t("advice.close")}
            </p>

            {suggestion !== null && (
              <section data-testid="half-time-suggestion" className="space-y-2">
                <h3 className="eyebrow text-highlight">{t("suggestion.title", { count: team.maxSubstitutions - made })}</h3>
                <SuggestionCard
                  suggestion={suggestion}
                  outgoing={getOrThrow(byKey, suggestion.out, "player")}
                  incoming={getOrThrow(byKey, suggestion.in, "player")}
                  clubColors={team.clubColors}
                  onApply={() => apply(substitute(state, rules, suggestion.slot, suggestion.in, t))}
                />
                <p className="text-[0.8125rem] text-muted-foreground">{t("suggestion.apply")}</p>
              </section>
            )}

            {state.substitutions.length > 0 && (
              <section aria-label={t("planned.title")} data-testid="half-time-off">
                <h3 className="eyebrow text-highlight">{t("planned.title")}</h3>
                <ul className="mt-1 divide-y">
                  {state.substitutions.map((change) => (
                    // On a phone, the button under the names rather than the names cut.
                    <li key={change.out} data-off-player-key={change.out} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                      <span className="min-w-0 text-sm font-semibold wrap-break-word">
                        {t("planned.change", {
                          out: getOrThrow(byKey, change.out, "player").lastName,
                          in: getOrThrow(byKey, change.in, "player").lastName,
                        })}
                      </span>
                      <Button variant="outline" className="h-11 px-3" onClick={() => cancelChange(change)} data-testid="half-time-cancel-change">
                        {t("planned.cancel")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex items-center justify-between gap-3">
              <label htmlFor="half-time-formation" className="eyebrow text-highlight">
                {t("formation")}
              </label>
              <select
                id="half-time-formation"
                data-testid="half-time-formation"
                value={state.formation}
                onChange={(event) => changeFormation(event.target.value)}
                className="h-9 rounded-lg border border-input bg-input/30 px-2 font-heading text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:h-11"
              >
                {FORMATION_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                aria-expanded={lineupOpen}
                onClick={() => setLineupOpen(!lineupOpen)}
                data-testid="half-time-lineup-toggle"
                className="flex cursor-pointer items-center gap-1 rounded-md text-sm font-semibold text-(--club) outline-none hover:text-(--club-hover) focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:min-h-11"
              >
                {lineupOpen ? t("lineup.close") : t("lineup.open")}
                <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform", lineupOpen && "rotate-180")} />
              </button>

              {lineupOpen && (
                <>
                  <div className="space-y-2">
                    <Pitch
                      slots={slots}
                      starters={state.starters}
                      players={byKey}
                      clubColors={team.clubColors}
                      label={t("pitch")}
                      sentOff={sentOff}
                      fitnessAt="restart"
                      editing={{
                        selected,
                        onSelect: clickSlot,
                        dragged,
                        draggedFrom: drag?.source.kind === "slot" ? drag.source.index : null,
                        over: drag?.over?.kind === "slot" ? drag.over.index : null,
                        dragProps: (index, key) => sourceProps({ kind: "slot", index, key }),
                        dropTarget: slotTarget,
                      }}
                    />
                    <LineupSummary slots={slots} starters={state.starters} players={byKey} closedSlots={rules.sentOffSlots.size} />
                  </div>

                  <section aria-label={t("bench")} data-testid="half-time-bench">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="eyebrow">{t("bench")}</h3>
                      <p className="text-right text-xs text-muted-foreground">{t("benchHint")}</p>
                    </div>
                    <ul className="mt-1.5 divide-y">
                      {state.bench.map((key) => {
                        const player = byKey.get(key);
                        if (player === undefined) {
                          return null;
                        }
                        const rating = selectedPosition === null ? player.overall : ratingAt(player, selectedPosition);
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              data-bench-player-key={key}
                              data-testid="half-time-bench-player"
                              aria-disabled={selected === null}
                              onClick={() => clickSubstitute(key)}
                              {...sourceProps({ kind: "reserve", key })}
                              className={cn(
                                // A finger's long press lifts the player (usePointerDrag), never the browser's menu; a swipe
                                // scrolls the panel. On a phone, no face, and the name whole.
                                "grid w-full cursor-grab grid-cols-[5.5rem_2rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm select-none [-webkit-touch-callout:none]",
                                "max-sm:min-h-11 max-sm:grid-cols-[3.75rem_minmax(0,1fr)_2rem] max-sm:gap-2",
                                selected !== null && "hover:bg-muted",
                                drag?.source.key === key && "opacity-50",
                              )}
                            >
                              <PositionBadges playerKey={key} position={player.position} className="justify-self-start max-sm:flex-wrap" />
                              <PlayerFace playerKey={key} age={player.age} clubColors={team.clubColors} size={32} className="max-sm:hidden" />
                              {/* His fitness under his name: what he would come on with. */}
                              <span className="flex min-w-0 flex-col items-start gap-1">
                                <span className="max-w-full truncate font-medium max-sm:whitespace-normal">
                                  {player.firstName} {player.lastName}
                                </span>
                                <FitnessGauge fitness={player.fitness} moment="restart" />
                              </span>
                              <span
                                title={
                                  selectedPosition === null
                                    ? t("rating")
                                    : t("ratingAt", { position: tPositions(`short.${selectedPosition}`) })
                                }
                                className={cn(
                                  "text-right font-heading font-bold tabular-nums",
                                  selectedPosition !== null && isOffPosition(positionFit(player, selectedPosition)) && "text-warning",
                                )}
                              >
                                {Math.round(rating)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {state.bench.length === 0 && <p className="mt-1.5 text-sm text-muted-foreground">{t("noSubstitutes")}</p>}
                  </section>
                </>
              )}
            </div>
          </div>

          {/* Stuck to the foot of the panel, which can be taller than a screen: these are the only way on. */}
          <div className="sticky bottom-0 z-20 border-t bg-card">
            <div className={cn("mx-auto flex w-full max-w-lg flex-col gap-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-5", PANEL_GUTTER)}>
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={pending || !settled}
                onClick={() => resume(false)}
                data-testid="half-time-resume-unchanged"
              >
                <SkipForwardIcon data-icon="inline-start" />
                {t("resumeUnchanged")}
              </Button>
              <Button
                variant="club"
                className="h-14 w-full font-heading text-2xl font-semibold"
                disabled={pending || !settled}
                onClick={() => resume(true)}
                data-testid="half-time-resume"
              >
                <PlayIcon data-icon="inline-start" className="fill-current" />
                {pending
                  ? regulationEnd
                    ? t("resuming.regulationEnd")
                    : t("resuming.halfTime")
                  : regulationEnd
                    ? t("resume.regulationEnd")
                    : t("resume.halfTime")}
              </Button>
            </div>
          </div>
        </div>

        {drag !== null && dragged !== null && (
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-3 pl-0.5 text-sm font-semibold shadow-lg"
            style={{ left: drag.x + GHOST_OFFSET_PX, top: drag.y + GHOST_OFFSET_PX }}
          >
            <PlayerFace playerKey={dragged.id} age={dragged.age} clubColors={team.clubColors} size={28} />
            <PositionBadges playerKey={dragged.id} position={dragged.position} />
            {dragged.lastName}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type SuggestionCardProps = {
  suggestion: SuggestedChange;
  outgoing: HalfTimePlayer;
  incoming: HalfTimePlayer;
  clubColors: ClubColors;
  onApply: () => void;
};

/** What the card says of the player going off: injured, how tired when he is to come off for his fitness, or his form. */
function outCaption({ reason }: SuggestedChange, outgoing: HalfTimePlayer, t: Translator<"halfTime">): string {
  switch (reason) {
    case "injured":
      return t("suggestion.outInjured");
    case "fitness":
      return t("suggestion.outTired", { fitness: fitnessFigure(outgoing.fitness) });
    default:
      return t("suggestion.out", { form: outgoing.form });
  }
}

/** The suggested change, one button: the player going off, the player coming on, why. */
function SuggestionCard({ suggestion, outgoing, incoming, clubColors, onApply }: SuggestionCardProps) {
  const t = useTranslations("halfTime");
  const tPositions = useTranslations("positions");
  return (
    <button
      type="button"
      onClick={onApply}
      data-testid="half-time-suggestion-apply"
      className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg border-2 border-secondary bg-background p-3.5 text-left transition-colors outline-none hover:border-highlight focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ChangeEnd
        player={outgoing}
        clubColors={clubColors}
        injured={suggestion.reason === "injured"}
        caption={outCaption(suggestion, outgoing, t)}
      />
      <ArrowRightLeftIcon aria-hidden className="size-6 text-(--club)" />
      <ChangeEnd
        player={incoming}
        clubColors={clubColors}
        caption={t("suggestion.in", {
          position: tPositions(`short.${suggestion.position}`),
          rating: Math.round(ratingAt(incoming, suggestion.position)),
        })}
      />
    </button>
  );
}

type ChangeEndProps = {
  player: HalfTimePlayer;
  clubColors: ClubColors;
  caption: string;
  injured?: boolean;
};

/** One side of a suggested change. On a phone, no face: the name needs the room, on two lines at worst, never cut. */
function ChangeEnd({ player, clubColors, caption, injured = false }: ChangeEndProps) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PlayerFace playerKey={player.id} age={player.age} clubColors={clubColors} size={36} className="shrink-0 max-sm:hidden" />
      <span className="flex min-w-0 flex-col">
        <span className={cn("text-xs", injured ? "text-loss" : "text-muted-foreground")}>{caption}</span>
        <span className="font-bold wrap-break-word">{player.lastName}</span>
      </span>
    </span>
  );
}
