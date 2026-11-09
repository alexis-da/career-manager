import { useTranslations } from "next-intl";
import { CompassIcon, PauseIcon, PlayIcon, SplitIcon, TimerIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { PlayerFace } from "@/src/components/player-face";
import type { DecisionView, MatchEventView, TeamView } from "@/src/db/calendar";
import { cn } from "@/src/lib/utils";
import { EventIcon, IconChip } from "../../_components/event-icon";
import { Panel } from "@/src/components/panel";
import { decisionMoment, describeDecision } from "../../_lib/decisions";
import { describeInstructionChange, type InstructionChange } from "../../_lib/instruction-changes";
import { formatMinute } from "../../_lib/match-events";
import { feedEntries, type FeedEntry, type FeedMarker } from "../_lib/feed-entries";
import { LiveCardTitle } from "./live-card-title";

const MARKER_ICONS: Record<FeedMarker, ReactNode> = {
  kickOff: <PlayIcon className="fill-current" />,
  halfTime: <PauseIcon className="fill-current" />,
  regulationEnd: <TimerIcon strokeWidth={2.5} />,
};

// The line's own attributes (data-testid…) go on it; its title is the line's text, not a tooltip.
type FeedRowProps = Omit<ComponentProps<"li">, "title" | "children" | "className"> & {
  minute: string;
  icon: ReactNode;
  title: string;
  detail?: ReactNode;
  highlighted?: boolean;
  children?: ReactNode; // what ends the line
};

function FeedRow({ minute, icon, title, detail, highlighted = false, children, ...attributes }: FeedRowProps) {
  return (
    <li
      {...attributes}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-1.5 leading-tight motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 max-sm:gap-2 max-sm:px-2",
        highlighted && "bg-secondary",
      )}
    >
      {/* The width of « 90+5' », the longest. */}
      <span className="w-11 shrink-0 font-heading text-xl leading-none text-highlight tabular-nums">{minute}</span>
      {icon}
      <span className="min-w-0 flex-1 wrap-break-word">
        <span className="block text-[0.9375rem] font-bold">{title}</span>
        {detail !== undefined && <span className="block text-[0.8125rem] text-muted-foreground">{detail}</span>}
      </span>
      {children}
    </li>
  );
}

/** An event of a club: the type and the player, then the club, with who gave the pass or who went off. */
function EventRow({ event, team }: { event: MatchEventView; team: TeamView }) {
  const t = useTranslations("live");
  const tEvents = useTranslations("events");
  const goal = event.type === "GOAL";
  const related = event.relatedPlayerName;
  return (
    <FeedRow
      minute={formatMinute(event.minute, event.period)}
      icon={<EventIcon type={event.type} managed={team.isManaged} />}
      title={t("eventTitle", { type: tEvents(`type.${event.type}`), player: event.playerName })}
      detail={
        related === null
          ? team.name
          : goal
            ? t("eventAssist", { club: team.name, assist: related })
            : t("eventReplaces", { club: team.name, replaced: related })
      }
      highlighted={goal && team.isManaged}
    >
      {goal && event.playerKey !== null && event.playerAge !== null && (
        // On the page's dark: the default round is the highlighted line's colour.
        <PlayerFace playerKey={event.playerKey} age={event.playerAge} clubColors={team.colors} size={32} background="var(--background)" className="shrink-0" />
      )}
    </FeedRow>
  );
}

function MarkerRow({ entry }: { entry: Extract<FeedEntry, { kind: "marker" }> }) {
  const t = useTranslations("live");
  return (
    <FeedRow
      minute={formatMinute(entry.minute)}
      icon={<IconChip className="text-on-blue">{MARKER_ICONS[entry.marker]}</IconChip>}
      title={t(`marker.${entry.marker}`)}
      detail={entry.score === null ? undefined : <span className="tabular-nums">{entry.score.home} – {entry.score.away}</span>}
    />
  );
}

/**
 * A decision of the managed club on a choice event, at the minute after its boundary: what was decided and what came of
 * it, read in the events shown, then the event's name. A road that forks on the bright blue: a choice, never an event.
 */
function DecisionRow({ decision, shown }: { decision: DecisionView; shown: readonly MatchEventView[] }) {
  const t = useTranslations("decisions");
  const moment = decisionMoment(decision);
  return (
    <FeedRow
      data-testid="live-decision"
      data-decision-kind={decision.kind}
      data-decision-option={decision.option}
      minute={formatMinute(moment.minute, moment.period)}
      icon={
        <IconChip className="bg-primary text-primary-foreground">
          <SplitIcon strokeWidth={2.5} />
        </IconChip>
      }
      title={describeDecision(decision, shown, t)}
      detail={t(`kind.${decision.kind}`)}
    />
  );
}

/** A change of the managed club's instruction: what it plays for now, and who said so. */
function InstructionRow({ change }: { change: InstructionChange }) {
  const t = useTranslations("decisions");
  const { title, detail } = describeInstructionChange(change, t);
  return (
    <FeedRow
      data-testid="live-instruction-change"
      data-instruction={change.instruction}
      data-source={change.source}
      minute={formatMinute(change.minute, change.period)}
      icon={
        <IconChip className="bg-secondary text-foreground">
          <CompassIcon strokeWidth={2.5} />
        </IconChip>
      }
      title={title}
      detail={detail}
    />
  );
}

type LiveFeedProps = {
  shown: MatchEventView[]; // the match's events the clock has passed, oldest first
  decisions: DecisionView[]; // the managed club's decisions the clock has passed, whose effects are among those events
  changes: InstructionChange[]; // the managed club's changes of instruction the clock has passed
  minute: number;
  extraTime: boolean; // the match goes on past the 90th minute
  home: TeamView;
  away: TeamView;
  className?: string;
};

/** The match, line by line, newest first: the latest event is always in view, the managed club's decisions among them. */
export function LiveFeed({ shown, decisions, changes, minute, extraTime, home, away, className }: LiveFeedProps) {
  const t = useTranslations("live");
  return (
    <Panel className={cn("max-sm:p-4", className)} data-testid="live-events">
      <LiveCardTitle>{t("feed")}</LiveCardTitle>
      <ol role="log" aria-label={t("events")} className="mt-3 space-y-1">
        {feedEntries(shown, decisions, minute, extraTime, changes).map((entry) =>
          entry.kind === "marker" ? (
            <MarkerRow key={entry.marker} entry={entry} />
          ) : entry.kind === "instruction" ? (
            <InstructionRow key={`instruction-${entry.change.period}-${entry.change.minute}`} change={entry.change} />
          ) : entry.kind === "decision" ? (
            <DecisionRow key={`decision-${entry.decision.sequence}`} decision={entry.decision} shown={shown} />
          ) : (
            <EventRow key={entry.event.id} event={entry.event} team={entry.event.side === "home" ? home : away} />
          ),
        )}
      </ol>
    </Panel>
  );
}
