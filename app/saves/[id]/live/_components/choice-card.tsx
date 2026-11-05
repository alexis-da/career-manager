"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/src/components/ui/sheet";
import type { TeamView } from "@/src/db/calendar";
import type { ChoiceEventView } from "@/src/db/live-match";
import type { ChoiceKind, ChoiceOption } from "@/src/engine/choices";
import type { Translator } from "@/src/i18n/translator";
import { cn } from "@/src/lib/utils";
import { fitnessFigure } from "../../_lib/fitness";
import { REGULATION_MINUTES } from "../../_lib/match-events";

/**
 * How long « Valider » stays out of reach once the card opens, as the Coaching panel's ways on (its RESUME_GUARD_MS): the
 * card comes as the clock reaches the boundary, and a tap meant for the page, or a second one, would decide for good.
 */
const CONFIRM_GUARD_MS = 500;

/** Side margins of the card, its content and its foot alike: the Coaching panel's. */
const PANEL_GUTTER = "px-4 sm:px-6 lg:px-7";

/** The family of each event, named above its title with its minute. */
const FAMILIES = {
  PENALTY: "setPiece",
  FREE_KICK: "setPiece",
  HOTHEAD: "discipline",
  SCUFFLE: "discipline",
  KNOCK: "fitness",
  EXHAUSTED: "fitness",
  LEADING: "tactics",
  CHASING: "tactics",
} as const satisfies Record<ChoiceKind, string>;

/** The player's decision, as the card sends it: an option, and the player it names (a penalty's taker), if any. */
export type ChoiceCardDecision = { option: ChoiceOption; playerKey: string | null };

/**
 * What follows the decision: the match goes on at once (« Valider »), or the Coaching panel opens first (« Coaching »),
 * the decision going to the server with what the panel brings.
 */
export type ChoiceThen = "resume" | "coaching";

type OfferedOption = ChoiceEventView["options"][number];

/** The score at the pause, the player's club's goals first. */
type Score = { own: number; other: number };

/** What the card says of the match around its event. */
type Situation = { opponent: TeamView; score: Score; playerFitness: number | null };

/** What an option says: what it is, and what it does in plain words (nothing for a taker whose chance is unknown). */
type OptionTexts = { label: string; effect: string | null };

/** The minute and the score, seen from the player's club: « 60e minute, tu mènes 2-1 », « 60e minute, 1-1 ». */
function contextOf(minute: number, { own, other }: Score, t: Translator<"choiceCard">): string {
  const values = { minute, own, other };
  if (own > other) {
    return t("context.leading", values);
  }
  return own < other ? t("context.behind", values) : t("context.level", values);
}

/**
 * The card's title and its situation in one sentence: the minute, the score, the players named. A late reaction comes at
 * 60' or 75' only, and its instruction holds until the 90th minute whatever the score does: the minutes left are regulation
 * time's.
 */
function eventTexts(
  event: ChoiceEventView,
  { opponent, score, playerFitness }: Situation,
  t: Translator<"choiceCard">,
): { title: string; situation: string } {
  const context = contextOf(event.minute, score, t);
  const player = event.player ?? t("aPlayer");
  const remaining = REGULATION_MINUTES - event.minute;
  switch (event.kind) {
    case "PENALTY":
      return { title: t("PENALTY.title"), situation: t("PENALTY.situation", { context }) };
    case "FREE_KICK":
      return { title: t("FREE_KICK.title"), situation: t("FREE_KICK.situation", { context, taker: player }) };
    case "HOTHEAD":
      return { title: t("HOTHEAD.title"), situation: t("HOTHEAD.situation", { context, player }) };
    case "SCUFFLE":
      return {
        title: t("SCUFFLE.title"),
        situation: t("SCUFFLE.situation", { context, captain: player, opponent: opponent.name }),
      };
    case "KNOCK":
      return { title: t("KNOCK.title"), situation: t("KNOCK.situation", { context, player }) };
    case "EXHAUSTED":
      return {
        title: t("EXHAUSTED.title"),
        situation:
          playerFitness === null
            ? t("EXHAUSTED.situation", { context, player })
            : t("EXHAUSTED.situationFitness", { context, player, fitness: fitnessFigure(playerFitness) }),
      };
    case "LEADING":
      return { title: t("LEADING.title"), situation: t("LEADING.situation", { context, remaining }) };
    case "CHASING":
      return score.own < score.other
        ? { title: t("CHASING.title.behind"), situation: t("CHASING.situation.behind", { context, remaining }) }
        : { title: t("CHASING.title.level"), situation: t("CHASING.situation.level", { context, remaining }) };
  }
}

/**
 * An option's label and effect, by what the engine makes of it (applyOption): no figure, but a penalty taker's chance,
 * rounded; a free kick's shot keeps its own. An option that takes a player off names the substitute who comes on. The
 * same option says different things from one event to another: keeping a booked player or an exhausted one, attacking
 * when ahead or not.
 */
function optionTexts(event: ChoiceEventView, offered: OfferedOption, t: Translator<"choiceCard">): OptionTexts {
  const player = offered.player ?? event.player ?? t("aPlayer");
  const replacement = offered.replacement?.name ?? t("aPlayer");
  switch (offered.option) {
    case "TAKER":
      return {
        label: player,
        effect: offered.chance === null ? null : t("PENALTY.TAKER.effect", { chance: Math.round(offered.chance * 100) }),
      };
    case "SHOOT":
      return { label: t("FREE_KICK.SHOOT.label"), effect: t("FREE_KICK.SHOOT.effect", { taker: player }) };
    case "COMBINE":
      return { label: t("FREE_KICK.COMBINE.label"), effect: t("FREE_KICK.COMBINE.effect") };
    case "TAKE_OFF":
      return event.kind === "HOTHEAD"
        ? { label: t("HOTHEAD.TAKE_OFF.label"), effect: t("HOTHEAD.TAKE_OFF.effect", { replacement }) }
        : { label: t("KNOCK.TAKE_OFF.label"), effect: t("KNOCK.TAKE_OFF.effect", { replacement }) };
    case "KEEP":
      return event.kind === "HOTHEAD"
        ? { label: t("HOTHEAD.KEEP.label"), effect: t("HOTHEAD.KEEP.effect") }
        : { label: t("EXHAUSTED.KEEP.label"), effect: t("EXHAUSTED.KEEP.effect") };
    case "CALM":
      return { label: t("SCUFFLE.CALM.label"), effect: t("SCUFFLE.CALM.effect") };
    case "PROTEST":
      return { label: t("SCUFFLE.PROTEST.label"), effect: t("SCUFFLE.PROTEST.effect", { captain: player }) };
    case "PLAY_ON":
      return { label: t("KNOCK.PLAY_ON.label"), effect: t("KNOCK.PLAY_ON.effect") };
    case "REPLACE":
      return { label: t("EXHAUSTED.REPLACE.label"), effect: t("EXHAUSTED.REPLACE.effect", { replacement }) };
    // The late tactical choices: one instruction each, Attaquer, Équilibré (STEADY) and Fermer, in the event's words.
    case "DEFEND":
      return event.kind === "LEADING"
        ? { label: t("LEADING.DEFEND.label"), effect: t("LEADING.DEFEND.effect") }
        : { label: t("CHASING.DEFEND.label"), effect: t("CHASING.DEFEND.effect") };
    case "ATTACK":
      return event.kind === "LEADING"
        ? { label: t("LEADING.ATTACK.label"), effect: t("LEADING.ATTACK.effect") }
        : { label: t("CHASING.ATTACK.label"), effect: t("CHASING.ATTACK.effect") };
    case "STEADY":
      return event.kind === "LEADING"
        ? { label: t("LEADING.STEADY.label"), effect: t("LEADING.STEADY.effect") }
        : { label: t("CHASING.STEADY.label"), effect: t("CHASING.STEADY.effect") };
  }
}

type ChoiceCardProps = {
  event: ChoiceEventView;
  open: boolean; // the page opens it once its clock reaches the pause, and closes it with the choice sent
  opponent: TeamView;
  ownGoals: number; // the score at the pause, the player's club's first
  otherGoals: number;
  playerFitness: number | null; // what the player it is about has left now (« Joueur à bout »); null for any other event
  pending: boolean; // the match goes on with the decision: the card stays until it has, nothing left to press
  onConfirm: (decision: ChoiceCardDecision, then: ChoiceThen) => void; // « Valider » or « Coaching »
  returnFocusTo?: RefObject<HTMLElement | null>; // where the keyboard goes once it closes; by default, where it was before
};

/**
 * The card of a choice event, for the player's club's match paused at a boundary: the screen's whole size under lg, a
 * panel beside the match from there, as the Coaching panel. Its family and minute, a title, the situation in one sentence,
 * then two or three options, each with what it does in plain words; the assistant's is marked, and chosen to begin with,
 * and on a late tactical card, the instruction the club has been playing with is « (actuelle) ».
 * The choice is required: no cross, no timer, neither Escape nor a press outside closes the card. « Valider », the
 * screen's one orange action, takes the decision and the match goes on at once, the card staying until it has; « Coaching »
 * takes it too and opens the Coaching panel first. Both answer only once the card has been open for CONFIRM_GUARD_MS.
 */
export function ChoiceCard({
  event,
  open,
  opponent,
  ownGoals,
  otherGoals,
  playerFitness,
  pending,
  onConfirm,
  returnFocusTo,
}: ChoiceCardProps) {
  const t = useTranslations("choiceCard");
  const group = useId();
  const [picked, setPicked] = useState<{ minute: number; index: number } | null>(null);
  const [settled, setSettled] = useState(false); // the card has been open for CONFIRM_GUARD_MS
  const scroller = useRef<HTMLDivElement>(null);

  // Armed again for each opening, and for each event if the page keeps the card open from one to the next.
  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), CONFIRM_GUARD_MS);
    return () => {
      window.clearTimeout(timer);
      setSettled(false);
    };
  }, [open, event.minute]);

  // The assistant's option, until the player picks another one for this event.
  const selected = picked !== null && picked.minute === event.minute ? picked.index : event.assistant;
  const { title, situation } = eventTexts(event, { opponent, score: { own: ownGoals, other: otherGoals }, playerFitness }, t);
  // A decision the page could not send leaves the card open: it may be sent again.
  const disabled = !settled || pending;

  const confirm = (then: ChoiceThen): void => {
    const chosen = event.options[selected];
    onConfirm({ option: chosen.option, playerKey: chosen.playerKey }, then);
  };

  return (
    <Sheet
      modal
      disablePointerDismissal
      open={open}
      // The choice is the only way on: Escape asks to close, and nothing closes.
      onOpenChange={(next, details) => {
        if (!next) {
          details.cancel();
        }
      }}
    >
      <SheetContent
        showCloseButton={false}
        // The card's start rather than its first option: a stray key at the whistle would pick for the player.
        initialFocus={scroller}
        finalFocus={returnFocusTo}
        data-testid="choice-card"
        data-choice-kind={event.kind}
        className="gap-0 overflow-hidden border-secondary bg-card motion-reduce:transition-none data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-none lg:data-[side=right]:w-110 lg:data-[side=right]:border-l"
      >
        <div ref={scroller} tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain outline-none">
          <div className={cn("mx-auto w-full max-w-lg grow space-y-5 pt-5 pb-6 lg:pt-7", PANEL_GUTTER)}>
            <div className="space-y-2">
              {/* The eyebrow is in capitals, the minute's ordinal keeps its case: « 60e », « 60th ». */}
              <p className="eyebrow text-highlight">
                {t(`family.${FAMILIES[event.kind]}`)} · <span className="normal-case">{t("minute", { minute: event.minute })}</span>
              </p>
              <SheetTitle className="text-4xl leading-none font-bold text-balance">{title}</SheetTitle>
              <SheetDescription className="text-[0.9375rem] leading-[1.45] text-foreground">{situation}</SheetDescription>
            </div>

            <fieldset className="min-w-0">
              <legend className="sr-only">{t("choices")}</legend>
              <div className="space-y-2.5">
                {event.options.map((offered, index) => (
                  <OptionRow
                    key={`${offered.option}:${offered.playerKey ?? ""}`}
                    group={group}
                    index={index}
                    offered={offered}
                    texts={optionTexts(event, offered, t)}
                    checked={index === selected}
                    assistant={index === event.assistant}
                    onPick={() => setPicked({ minute: event.minute, index })}
                  />
                ))}
              </div>
            </fieldset>
          </div>

          {/* Stuck to the foot of the card, which can be taller than a screen: the only ways on, the panel's way above. */}
          <div className="sticky bottom-0 z-20 border-t bg-card">
            <div className={cn("mx-auto flex w-full max-w-lg flex-col gap-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-5", PANEL_GUTTER)}>
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={disabled}
                onClick={() => confirm("coaching")}
                aria-describedby={`${group}-coaching`}
                data-testid="choice-coaching"
              >
                {t("coaching")}
              </Button>
              <span id={`${group}-coaching`} className="sr-only">
                {t("coachingHint")}
              </span>
              <Button
                variant="club"
                className="h-14 w-full font-heading text-2xl font-semibold"
                disabled={disabled}
                onClick={() => confirm("resume")}
                data-testid="choice-validate"
              >
                <CheckIcon data-icon="inline-start" />
                {pending ? t("resuming") : t("validate")}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type OptionRowProps = {
  group: string; // the radio group's name, and the start of its ids
  index: number;
  offered: OfferedOption;
  texts: OptionTexts;
  checked: boolean;
  assistant: boolean; // the assistant's choice
  onPick: () => void;
};

/**
 * An option, a radio button the whole row picks: named by its label, described by the assistant's mark and its effect.
 * The arrows move between options, as in any radio group. Its border keeps its width when picked, so that nothing moves.
 */
function OptionRow({ group, index, offered, texts, checked, assistant, onPick }: OptionRowProps) {
  const t = useTranslations("choiceCard");
  const labelId = `${group}-${index}-label`;
  const assistantId = `${group}-${index}-assistant`;
  const effectId = `${group}-${index}-effect`;
  const describedBy = [assistant ? assistantId : null, texts.effect === null ? null : effectId].filter((id) => id !== null).join(" ");
  return (
    <label
      data-testid="choice-option"
      data-option={offered.option}
      data-player-key={offered.playerKey ?? undefined}
      data-assistant={assistant ? "true" : undefined}
      className={cn(
        "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg border-2 p-3.5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 max-sm:min-h-11 motion-safe:transition-colors",
        checked ? "border-highlight bg-secondary" : "border-secondary bg-background hover:border-highlight/60",
      )}
    >
      <input
        type="radio"
        name={group}
        value={index}
        checked={checked}
        onChange={onPick}
        aria-labelledby={labelId}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn("mt-0.5 grid size-5 place-items-center rounded-full border-2", checked ? "border-highlight" : "border-muted-foreground/60")}
      >
        {checked && <span className="size-2.5 rounded-full bg-highlight" />}
      </span>
      <span className="min-w-0 space-y-1">
        {/* On a phone, the assistant's mark under the label rather than the label cut. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span id={labelId} className="text-base leading-tight font-bold wrap-break-word">
            {texts.label}
            {/* The instruction the club has been playing with, read with the label. */}
            {offered.current && <span className="font-normal text-muted-foreground"> {t("current")}</span>}
          </span>
          {assistant && (
            <span
              id={assistantId}
              className="rounded-full bg-highlight px-2 py-0.5 text-[0.6875rem] leading-tight font-bold tracking-wide text-background uppercase"
            >
              {t("assistant")}
            </span>
          )}
        </span>
        {texts.effect !== null && (
          <span id={effectId} className="block text-sm leading-snug text-muted-foreground">
            {texts.effect}
          </span>
        )}
      </span>
    </label>
  );
}
