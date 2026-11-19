"use client";

import { MessageCircleMoreIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import type { TutorialStepKey } from "@/src/lib/tutorial";
import { cn } from "@/src/lib/utils";
import { skipTutorialAction } from "../../tutorial/actions";
import { modalOpen, useTutorialEvents } from "./use-tutorial";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** A quiet way out of the bubble: never orange, the screen keeps its own action (one a screen). */
export const TUTORIAL_LINK =
  "text-[0.8125rem] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

export type DayOnePlace = { index: number; total: number };

/** Whether an element lies in something fixed to the screen. */
function inFixedBar(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
    if (getComputedStyle(node).position === "fixed") {
      return true;
    }
  }
  return false;
}

type TutorialBubbleProps = {
  saveId: string;
  step: TutorialStepKey;
  text: string; // the assistant's line, one or two sentences
  place: DayOnePlace | null; // « Premier jour · 2 sur 5 », on the first day
  target?: string; // the element it speaks of, by a selector: ringed, and described by the line
  gotIt?: boolean; // « Compris »: for a step without a move of its own on the screen
  live?: boolean; // on the match live, under lg: above its controls rather than the save's navigation
  onClosed?: (how: "pass" | "done" | "skip") => void; // passed, understood or the tutorial skipped: the page's own
  className?: string;
};

/**
 * The assistant's bubble (docs/design/tutoriel.md § 0.2): one at a time, never over a modal sheet. Under lg a card fixed
 * to the foot of the screen, above the save's navigation (or the controls of the match live); from lg, where the page
 * puts it, by its target. Its target is ringed, the screen still usable, and scrolled to once if the bubble would cover
 * it; nothing moves with reduced motion. Its line describes its target; the focus is never moved; Escape passes the step
 * when no sheet is open. Shown once a mount: the server counts it. Nothing orange: « Passer l'étape », « Passer le
 * tutoriel », and « Compris » where the step has no move of its own.
 */
export function TutorialBubble({ saveId, step, text, place, target, gotIt = false, live = false, onClosed, className }: TutorialBubbleProps) {
  const t = useTranslations("tutorial");
  const send = useTutorialEvents(saveId);
  const [gone, setGone] = useState(false);
  const shown = useRef(false);
  const bubble = useRef<HTMLElement>(null);
  const lineId = useId();

  // Shown once a mount: twice without its move, it comes no more.
  useEffect(() => {
    if (shown.current) {
      return;
    }
    shown.current = true;
    send([{ step, event: "show" }]);
  }, [send, step]);

  // The target ringed and described by the line; scrolled to the screen's upper third, once, if the bubble would hide it.
  useEffect(() => {
    if (gone || target === undefined) {
      return;
    }
    const element = document.querySelector<HTMLElement>(target);
    if (element === null) {
      return;
    }
    const described = element.getAttribute("aria-describedby");
    element.setAttribute("data-tutorial-target", "");
    element.setAttribute("aria-describedby", described === null ? lineId : `${described} ${lineId}`);
    const { top, bottom } = element.getBoundingClientRect();
    const fixed = bubble.current !== null && getComputedStyle(bubble.current).position === "fixed";
    const covered = fixed && bubble.current !== null ? bubble.current.getBoundingClientRect() : null;
    const hidden = top < 0 || bottom > window.innerHeight || (covered !== null && top < covered.bottom && bottom > covered.top);
    // A target in a bar fixed to the screen (the controls of the match live) moves with no scroll.
    if (hidden && !inFixedBar(element)) {
      const smooth = !window.matchMedia(REDUCED_MOTION_QUERY).matches;
      window.scrollBy({ top: top - window.innerHeight / 3, behavior: smooth ? "smooth" : "auto" });
    }
    return () => {
      element.removeAttribute("data-tutorial-target");
      if (described === null) {
        element.removeAttribute("aria-describedby");
      } else {
        element.setAttribute("aria-describedby", described);
      }
    };
  }, [gone, target, lineId]);

  const close = (event: "pass" | "done") => {
    setGone(true);
    send([{ step, event }]);
    onClosed?.(event);
  };

  // Escape passes the step, unless a sheet is open: its own Escape is its own.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (gone) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !modalOpen()) {
        closeRef.current("pass");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gone]);

  if (gone) {
    return null;
  }

  const skip = () => {
    setGone(true);
    onClosed?.("skip");
    void skipTutorialAction(saveId, step).then(
      () => toast(t("skipped")),
      (error: unknown) => console.warn("[tutorial] not skipped", error),
    );
  };

  return (
    <aside
      ref={bubble}
      aria-label={t("assistant")}
      aria-live="polite"
      data-testid="tutorial-bubble"
      data-step={step}
      className={cn(
        "z-30 rounded-card border border-highlight/60 bg-card p-4 shadow-lg max-lg:fixed max-lg:inset-x-3 motion-safe:max-lg:animate-in motion-safe:max-lg:slide-in-from-bottom-4 lg:shadow-none",
        live ? "max-lg:bottom-[calc(var(--live-controls-height)+0.5rem)]" : "max-lg:bottom-[calc(var(--save-nav-height)+0.5rem)]",
        className,
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold tracking-wider text-highlight uppercase">
        <MessageCircleMoreIcon aria-hidden className="size-4 shrink-0" />
        <span>{t("assistant")}</span>
        {place !== null && (
          <span data-testid="tutorial-place" className="font-semibold text-muted-foreground normal-case">
            · {t("dayOne", place)}
          </span>
        )}
      </p>
      <p id={lineId} data-testid="tutorial-text" className="mt-1.5 text-[0.9375rem] leading-snug">
        {text}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        {gotIt && (
          <Button variant="outline" className="h-9 px-4 max-sm:h-11" onClick={() => close("done")} data-testid="tutorial-got-it">
            {t("gotIt")}
          </Button>
        )}
        <button type="button" onClick={() => close("pass")} className={TUTORIAL_LINK} data-testid="tutorial-pass">
          {t("passStep")}
        </button>
        <button type="button" onClick={skip} className={cn(TUTORIAL_LINK, "ml-auto")} data-testid="tutorial-skip">
          {t("skip")}
        </button>
      </div>
    </aside>
  );
}
