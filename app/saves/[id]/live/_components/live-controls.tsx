import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Ref } from "react";
import { Button, buttonVariants } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { SkipTarget } from "../_lib/live-pause";

/** The replay's speeds, as factors of its normal pace. */
const SPEEDS = [1, 2, 4] as const;

export type Speed = (typeof SPEEDS)[number];

/** A secondary action outlined on the card's blue; under lg, in the bar, it needs nothing. */
const ON_BLUE = "lg:dark:border-on-blue/60 lg:dark:bg-transparent lg:dark:hover:bg-on-blue/10";

/** The way on: under lg, what the bar leaves, on two even lines if need be; in the card, its own width. */
const ACTION = "h-auto min-h-12 px-5 py-1 text-balance whitespace-normal max-lg:flex-1 max-sm:px-3";
const MAIN_ACTION = cn(ACTION, "font-heading text-xl leading-none font-semibold");
const SECONDARY_ACTION = cn(ACTION, "text-[0.9375rem] leading-tight font-bold");

type LiveControlsProps = {
  dashboardHref: string;
  finished: boolean; // the replay has reached what it stops at: a break, or the end of the match
  atBreak: boolean; // what it stops at is a break, with its Coaching panel
  skipTo: SkipTarget; // where live-skip leads while the match runs: half-time before it, the result after
  speed: Speed;
  onSpeedChange: (speed: Speed) => void;
  onSkip: () => void;
  panelOpen: boolean; // the Coaching panel, which has the break's own orange action
  onOpenPanel: () => void;
  coachingRef: Ref<HTMLButtonElement>;
  continueRef: Ref<HTMLAnchorElement>;
};

/**
 * The screen's controls, one element: in the card from lg, fixed to the foot of the screen under it. While the match runs,
 * its speed and the way to what comes next, which says where it leads: half-time, the only place for changes, is the
 * screen's main action; after it, the result, a secondary one. At a break, the way back to the Coaching panel; at the end,
 * the way on.
 */
export function LiveControls({
  dashboardHref,
  finished,
  atBreak,
  skipTo,
  speed,
  onSpeedChange,
  onSkip,
  panelOpen,
  onOpenPanel,
  coachingRef,
  continueRef,
}: LiveControlsProps) {
  const t = useTranslations("live");
  return (
    <div
      data-testid="live-controls"
      className="flex items-center gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:border-t max-lg:border-sidebar-border max-lg:bg-sidebar max-lg:px-4 max-lg:pt-2 max-lg:pb-[max(1.125rem,env(safe-area-inset-bottom))] lg:flex-wrap lg:justify-center lg:gap-2.5"
    >
      {!finished ? (
        <>
          <div role="group" aria-label={t("speed")} className="flex shrink-0 gap-1 rounded-lg bg-background p-1">
            {SPEEDS.map((value) => (
              <Button
                key={value}
                variant={value === speed ? "default" : "ghost"}
                aria-pressed={value === speed}
                onClick={() => onSpeedChange(value)}
                data-testid={`live-speed-${value}`}
                className="h-11 min-w-11 rounded-[0.625rem] px-2 font-bold lg:min-w-13"
              >
                {t("speedFactor", { factor: value })}
              </Button>
            ))}
          </div>
          {skipTo === "halfTime" ? (
            <Button variant="club" className={MAIN_ACTION} onClick={onSkip} data-skip-to={skipTo} data-testid="live-skip">
              {t("skip.halfTime")}
            </Button>
          ) : (
            <Button variant="outline" className={cn(SECONDARY_ACTION, ON_BLUE)} onClick={onSkip} data-skip-to={skipTo} data-testid="live-skip">
              {t("skip.result")}
            </Button>
          )}
        </>
      ) : atBreak ? (
        // One full orange action a screen: the open panel has its own.
        <Button
          ref={coachingRef}
          variant={panelOpen ? "outline" : "club"}
          className={cn(MAIN_ACTION, panelOpen && ON_BLUE)}
          onClick={onOpenPanel}
          data-testid="live-coaching"
        >
          {t("coaching")}
        </Button>
      ) : (
        <Link ref={continueRef} href={dashboardHref} data-testid="live-continue" className={buttonVariants({ variant: "club", className: MAIN_ACTION })}>
          {t("continue")}
        </Link>
      )}
    </div>
  );
}
