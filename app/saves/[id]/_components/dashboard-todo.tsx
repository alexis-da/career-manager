import {
  BandageIcon,
  ChevronRightIcon,
  FileClockIcon,
  HandCoinsIcon,
  ShieldAlertIcon,
  TargetIcon,
  UserCheckIcon,
  UserMinusIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { Dashboard } from "@/src/db/dashboard";
import type { ManagedLineup } from "@/src/db/lineup";
import type { MarketSales } from "@/src/db/market-sales";
import { YELLOWS_PER_SUSPENSION } from "@/src/engine/balance";
import { weakSpotOf } from "@/src/engine/market-proposals";
import { ratingAt } from "@/src/engine/positions";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDayMonth, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

/** Below this many players under contract, the list warns. */
const SQUAD_ALERT_SIZE = 18;
const MIN_GOALKEEPERS = 2;
/** Names a line gives before « et 2 autres ». */
const NAMES_SHOWN = 3;

type Severity = "danger" | "warning" | "ok" | "neutral";

type Todo = {
  id:
    | "injured-starters"
    | "suspended-starters"
    | "injured"
    | "booking-risks"
    | "offers"
    | "weak-spot"
    | "expiring-contracts"
    | "goalkeepers"
    | "small-squad"
    | "full-squad";
  severity: Severity;
  icon: ComponentType<{ className?: string }>; // a lucide icon, or the referee's card
  title: string;
  detail: string;
  href?: string; // a full squad asks for nothing: no link
};

/** A card, upright and full, in its tile's colour: the referee's, red or yellow, as in the match's feed. */
function BookingCardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" />
    </svg>
  );
}

const TILE_CLASSES: Record<Severity, string> = {
  danger: "bg-loss/15 text-loss",
  warning: "bg-warning/15 text-warning",
  ok: "bg-win/15 text-win",
  neutral: "bg-secondary",
};

const ROW = "flex min-h-11 items-center gap-3 rounded-lg bg-card p-3.5";

type DashboardTodoProps = {
  saveId: string;
  dashboard: Dashboard;
  lineup: ManagedLineup;
  sales: MarketSales | null; // null out of a transfer window
  className?: string;
};

const shortName = ({ firstName, lastName }: { firstName: string; lastName: string }): string => `${firstName.charAt(0)}. ${lastName}`;

/** The first names of a list, then how many more: « A, B, C et 2 autres ». */
function namesAndOthers(names: readonly string[], t: Translator<"dashboardTodo">): string {
  const shown = names.slice(0, NAMES_SHOWN).join(", ");
  const others = names.length - NAMES_SHOWN;
  return others > 0 ? t("andOthers", { players: shown, count: others }) : shown;
}

/**
 * The injured the first line does not name. A dashboard's injured have only their short name, which a substitute may share:
 * each saved starter takes one off.
 */
function otherInjured(injured: Dashboard["injured"], injuredStarters: ManagedLineup["missingStarters"]): Dashboard["injured"] {
  const others = [...injured];
  for (const starter of injuredStarters) {
    const index = others.findIndex(({ name }) => name === shortName(starter));
    if (index !== -1) {
      others.splice(index, 1);
    }
  }
  return others;
}

/** The highest offer, on the first row that has one (getMarketSales sorts them so), and how many there are. */
function bestOffer({ rows, offers }: MarketSales) {
  for (const player of rows) {
    const { sale } = player.terms;
    if (sale.ok) {
      return { player, sale, offers };
    }
  }
  return null;
}

function todosOf(
  { saveId, dashboard, lineup, sales }: DashboardTodoProps,
  t: Translator<"dashboardTodo">,
  tPositions: Translator<"positions">,
  locale: Locale,
): Todo[] {
  const { club } = dashboard;
  const base = `/saves/${saveId}`;
  const squadHref = `${base}/squad`;
  const lineupHref = `${base}/lineup`;
  const todos: Todo[] = [];

  // The saved starters out of the next match: injured, or else suspended (an injured player serves his suspension).
  const injuredStarters = lineup.missingStarters.filter((player) => player.injured);
  const suspendedStarters = lineup.missingStarters.filter((player) => !player.injured);
  if (injuredStarters.length > 0) {
    todos.push({
      id: "injured-starters",
      severity: "danger",
      icon: BandageIcon,
      title: t("injuredStarters", { count: injuredStarters.length }),
      detail: t("injuredStartersDetail", { players: injuredStarters.map(shortName).join(", ") }),
      href: lineupHref,
    });
  }
  if (suspendedStarters.length > 0) {
    todos.push({
      id: "suspended-starters",
      severity: "danger",
      icon: BookingCardIcon,
      title: t("suspendedStarters", { count: suspendedStarters.length }),
      detail: t("suspendedStartersDetail", { players: suspendedStarters.map(shortName).join(", ") }),
      href: lineupHref,
    });
  }

  const injured = otherInjured(dashboard.injured, injuredStarters);
  if (injured.length > 0) {
    todos.push({
      id: "injured",
      severity: "neutral",
      icon: BandageIcon,
      title: t("injured", { count: injured.length }),
      detail: injured
        .map((player) => t("injuredPlayer", { name: player.name, date: formatDayMonth(player.until, locale) }))
        .join(t("injuredSeparator")),
      href: squadHref,
    });
  }

  // One booking from a suspension: a matter of the matches to come, the line-up's to weigh.
  const { bookingRisks } = dashboard;
  if (bookingRisks.length > 0) {
    const names = bookingRisks.map(({ name, competitions }) =>
      competitions.includes("CUP") ? t(`bookingRiskIn.${competitions.length > 1 ? "BOTH" : "CUP"}`, { name }) : name,
    );
    todos.push({
      id: "booking-risks",
      severity: "warning",
      icon: BookingCardIcon,
      title: t("bookingRisks", { count: bookingRisks.length, yellows: YELLOWS_PER_SUSPENSION - 1 }),
      detail: t("bookingRisksDetail", { players: namesAndOthers(names, t) }),
      href: lineupHref,
    });
  }

  const best = sales === null ? null : bestOffer(sales);
  if (best !== null) {
    todos.push({
      id: "offers",
      severity: "neutral",
      icon: HandCoinsIcon,
      title: t("offers", {
        club: best.sale.buyerName,
        // In the middle of a sentence: never a line's end between the figure and its unit.
        fee: formatMoney(best.sale.fee, locale).replace(" ", " "),
        player: `${best.player.firstName} ${best.player.lastName}`,
      }),
      detail: t("offersDetail", { count: best.offers }),
      href: `${base}/transfers?tab=sell`,
    });
  }

  // Every eleven has a weakest starter: never an alert, only where to look next.
  const weakSpot = weakSpotOf(lineup.lineup.starters.map(({ player, slot }) => ({ slot, rating: ratingAt(player, slot) })));
  if (weakSpot !== null) {
    todos.push({
      id: "weak-spot",
      severity: "neutral",
      icon: TargetIcon,
      title: t("weakSpot", { position: tPositions(`label.${weakSpot.position}`).toLocaleLowerCase(locale) }),
      detail: t("weakSpotDetail", { rating: weakSpot.rating }),
      href: `${base}/transfers`,
    });
  }

  const expiring = dashboard.expiringContracts;
  if (expiring.length > 0) {
    todos.push({
      id: "expiring-contracts",
      severity: "warning",
      icon: FileClockIcon,
      title: t("expiringContracts", { count: expiring.length }),
      detail: namesAndOthers(expiring, t),
      href: squadHref,
    });
  }
  if (club.goalkeepers < MIN_GOALKEEPERS) {
    todos.push({
      id: "goalkeepers",
      severity: "danger",
      icon: ShieldAlertIcon,
      title: club.goalkeepers === 0 ? t("noGoalkeeper") : t("oneGoalkeeper"),
      detail: t("goalkeepersNeeded", { count: MIN_GOALKEEPERS }),
      href: squadHref,
    });
  }
  if (club.players < SQUAD_ALERT_SIZE) {
    todos.push({
      id: "small-squad",
      severity: "warning",
      icon: UserMinusIcon,
      title: t("smallSquad"),
      detail: t("smallSquadDetail", { count: club.players, minimum: SQUAD_ALERT_SIZE }),
      href: squadHref,
    });
  }
  if (club.players >= SQUAD_ALERT_SIZE && club.goalkeepers >= MIN_GOALKEEPERS) {
    todos.push({
      id: "full-squad",
      severity: "ok",
      icon: UserCheckIcon,
      title: t("fullSquad"),
      detail: t("fullSquadDetail", { players: club.players, goalkeepers: club.goalkeepers }),
    });
  }
  return todos;
}

/** A line of the list, whole on a phone: its text wraps, and all of it is the link to where the thing gets done. */
function TodoRow({ severity, icon: Icon, title, detail, href }: Omit<Todo, "id">) {
  const content = (
    <>
      <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-md", TILE_CLASSES[severity])}>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-[0.9375rem] leading-tight font-bold wrap-break-word">{title}</span>
        <span className="block text-[0.8125rem] leading-snug wrap-break-word text-muted-foreground">{detail}</span>
      </span>
    </>
  );
  if (href === undefined) {
    return <div className={ROW}>{content}</div>;
  }
  return (
    <Link
      href={href}
      data-testid="alert-action"
      className={cn(ROW, "transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
    >
      {content}
      <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/**
 * What the dashboard asks of the manager, the most pressing first: the starters out of the next match, injured then
 * suspended, the other injured, the players one booking from a suspension, offers, the weak spot, then the squad's state.
 */
export function DashboardTodo({ className, ...props }: DashboardTodoProps): ReactNode {
  const t = useTranslations("dashboardTodo");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  return (
    <section aria-labelledby="dashboard-todo" data-testid="dashboard-alerts" className={cn("space-y-2.5", className)}>
      <h2 id="dashboard-todo" className="font-heading text-xl">
        {t("title")}
      </h2>
      <ul className="space-y-2.5">
        {todosOf(props, t, tPositions, locale).map(({ id, ...todo }) => (
          <li key={id} data-testid={`alert-${id}`}>
            <TodoRow {...todo} />
          </li>
        ))}
      </ul>
    </section>
  );
}
