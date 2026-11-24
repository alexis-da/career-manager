import {
  BandageIcon,
  BatteryLowIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FileClockIcon,
  FlagIcon,
  FlagOffIcon,
  HandCoinsIcon,
  HandshakeIcon,
  ShieldAlertIcon,
  TargetIcon,
  UserCheckIcon,
  UserMinusIcon,
  UsersIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "@/src/components/link";
import type { ComponentType, ReactNode } from "react";
import type { Dashboard } from "@/src/db/dashboard";
import type { ManagedLineup } from "@/src/db/lineup";
import type { CoachTodo } from "@/src/db/national-view";
import type { ManagedBreak } from "@/src/db/nations-view";
import type { SaleProposals } from "@/src/db/sale-proposals";
import { EUROPE_YELLOWS_PER_SUSPENSION, ROTATION_FITNESS, SQUAD_LIMIT, YELLOWS_PER_SUSPENSION } from "@/src/engine/balance";
import { isEuropeCode } from "@/src/engine/europe";
import { isAvailable } from "@/src/engine/lineup";
import { elevenOf, weakSpotOf, type WeakSpot } from "@/src/engine/market-proposals";
import type { TournamentCode } from "@/src/engine/tournaments";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDayMonth, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { byPriority, TODOS_SHOWN, type TodoId } from "../_lib/todo-priority";
import { dayRange, nationIn, nationsIn, tournamentName } from "./coach-names";

/** Below this many players under contract, the list warns. */
const SQUAD_ALERT_SIZE = 18;
const MIN_GOALKEEPERS = 2;
/** Names a line gives before « et 2 autres ». */
const NAMES_SHOWN = 3;

type Severity = "danger" | "warning" | "ok" | "neutral";

type Todo = {
  id: TodoId; // its rank in the list is TODO_PRIORITY's
  severity: Severity;
  icon: ComponentType<{ className?: string }>; // a lucide icon, or the referee's card
  title: string;
  detail: string;
  href?: string; // where the thing gets done; a mission's end asks for nothing: no link
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
  // Its assistant makes the club's line-up (docs/design/simplification.md § 3.4): he replaces the injured and the
  // suspended starters and rests the tired himself, so their lines say nothing to do.
  byAssistant: boolean;
  // The sales the assistant proposes (docs/design/simplification.md § 5.2): null out of a transfer window, where the
  // page reads none.
  saleProposals: SaleProposals | null;
  // Whether the club has played a match: before its first, the dashboard has its first steps to show, and the market
  // waits (no proposed sale, no weak spot).
  firstMatchPlayed: boolean;
  // An international break about to be played (its call-ups) or just played (who comes back injured or tired).
  internationalBreak: ManagedBreak | null;
  // The national coach's lines (getCoachTodos): a federation's offer, his list before his break or tournament, the end
  // of his mission. None by default.
  coachTodos?: readonly CoachTodo[];
  // The summer tournament his list is for, when it is one: its line names it.
  coachTournament?: TournamentCode | null;
  className?: string;
};

/** The translators the national coach's lines name things with. */
type CoachNames = {
  t: Translator<"dashboardTodo">;
  tCoach: Translator<"coachOffer">;
  tNations: Translator<"nations">;
  tWorld: Translator<"world">;
};

/**
 * The national coach's lines (docs/design/selections.md § 5.1, 5.4): a federation's offer while it is open, to the
 * season's start screen, where it is answered; his list before his break or summer tournament, his assistant's ready and
 * going as it is unless he changes it, never blocking; the end of a mission the federation decided this season, his club
 * going on, which leads nowhere.
 */
function coachLinesOf(
  todos: readonly CoachTodo[],
  tournament: TournamentCode | null,
  base: string,
  { t, tCoach, tNations, tWorld }: CoachNames,
  locale: Locale,
): Todo[] {
  return todos.flatMap((todo): Todo[] => {
    switch (todo.kind) {
      case "offer": {
        if (todo.offers.length === 0) {
          return [];
        }
        const [first] = todo.offers;
        return [
          {
            id: "coach-offer",
            severity: "warning",
            icon: HandshakeIcon,
            title:
              todo.offers.length === 1
                ? t("coachOffer", { nation: nationIn(first, "of", tCoach, tWorld) })
                : t("coachOffers", { count: todo.offers.length, nations: nationsIn(todo.offers, "the", tCoach, tWorld, locale) }),
            detail: t("coachOfferDetail"),
            href: `${base}/season-start`,
          },
        ];
      }
      case "call-up":
        return [
          {
            id: "coach-call-up",
            severity: "ok",
            icon: ClipboardListIcon,
            title: !todo.tournament
              ? t("coachCallUp", dayRange(todo.first, todo.last, locale))
              : tournament === null
                ? t("coachCallUpSummer")
                : t("coachCallUpTournament", { tournament: tournamentName(tournament, null, tNations) }),
            detail: t("coachCallUpDetail"),
            href: `${base}/nation`,
          },
        ];
      case "ended":
        return [
          {
            id: "coach-ended",
            severity: "neutral",
            icon: FlagOffIcon,
            title: t(`coachEnded.${todo.outcome}`, { nation: nationIn(todo.code, "of", tCoach, tWorld) }),
            detail: t("coachEndedDetail"),
          },
        ];
    }
  });
}

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

/** Why the weak spot is one: nobody to fill it, a starter out of his line there, or the lowest rating. */
function weakSpotDetail({ reason, rating }: WeakSpot, t: Translator<"dashboardTodo">): string {
  switch (reason) {
    case "empty":
      return t("weakSpotEmptyDetail");
    case "outOfLine":
      return t("weakSpotOutOfLineDetail", { rating });
    case "lowest":
      return t("weakSpotDetail", { rating });
  }
}

/** Everything the list has to say, in its order of priority (TODO_PRIORITY), whatever the order it is found in here. */
function todosOf(
  { saveId, dashboard, lineup, byAssistant, saleProposals, firstMatchPlayed, internationalBreak }: DashboardTodoProps,
  t: Translator<"dashboardTodo">,
  tPositions: Translator<"positions">,
  locale: Locale,
  coachLines: readonly Todo[],
): Todo[] {
  const { club } = dashboard;
  const base = `/saves/${saveId}`;
  const squadHref = `${base}/squad`;
  const lineupHref = `${base}/lineup`;
  const todos: Todo[] = [];

  // The player's saved starters out of the next match: injured, or else suspended (an injured player serves his
  // suspension). None while the assistant makes the eleven: he replaces them.
  const missingStarters = byAssistant ? [] : lineup.missingStarters;
  const injuredStarters = missingStarters.filter((player) => player.injured);
  const suspendedStarters = missingStarters.filter((player) => !player.injured);
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

  // Before a European match, the starters who would kick it off below the rotation threshold: the manager who makes his
  // eleven rotates his squad himself (docs/design/europe.md, § 3.3), as AI clubs rest theirs below it; his assistant does.
  const nextFixture = dashboard.nextMatch?.fixture ?? null;
  const tiredStarters =
    !byAssistant && nextFixture !== null && isEuropeCode(nextFixture.competitionCode)
      ? lineup.lineup.starters.map(({ player }) => player).filter((player) => isAvailable(player) && player.fitness < ROTATION_FITNESS)
      : [];
  if (tiredStarters.length > 0) {
    todos.push({
      id: "tired-starters",
      severity: "warning",
      icon: BatteryLowIcon,
      title: t("tiredStarters", { count: tiredStarters.length, fitness: ROTATION_FITNESS }),
      detail: t("tiredStartersDetail", { players: namesAndOthers(tiredStarters.map(shortName), t) }),
      href: lineupHref,
    });
  }

  // Back from an international break, before the club's next match: those injured with their national team, those
  // tired at its kick-off (docs/design/selections.md § 6.7); a word that all are well otherwise.
  if (internationalBreak?.state === "back" && internationalBreak.players.length > 0) {
    const injuredAbroad = internationalBreak.players.filter((player) => player.injuredUntil !== null);
    const tiredAbroad = internationalBreak.players.filter((player) => player.injuredUntil === null && player.fitness < ROTATION_FITNESS);
    const details = [
      ...injuredAbroad.map((player) =>
        t("returnsInjuredPlayer", { name: player.name, date: formatDayMonth(player.injuredUntil ?? internationalBreak.to, locale) }),
      ),
      ...(tiredAbroad.length === 0
        ? []
        : [t("returnsTiredPlayers", { players: namesAndOthers(tiredAbroad.map((player) => player.name), t), fitness: ROTATION_FITNESS })]),
    ];
    todos.push({
      id: "international-returns",
      severity: injuredAbroad.length > 0 || tiredAbroad.length > 0 ? "warning" : "ok",
      icon: FlagIcon,
      title:
        injuredAbroad.length > 0 || tiredAbroad.length > 0
          ? t("returns", { injured: injuredAbroad.length, tired: tiredAbroad.length, fitness: ROTATION_FITNESS })
          : t("returnsWell", { count: internationalBreak.players.length }),
      detail: details.length > 0 ? details.join(t("injuredSeparator")) : t("returnsWellDetail"),
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

  // Before an international break: the club's players its nations call, by name and nation.
  if (internationalBreak?.state === "upcoming" && internationalBreak.players.length > 0) {
    todos.push({
      id: "international-callups",
      severity: "neutral",
      icon: FlagIcon,
      title: t("callUps", {
        count: internationalBreak.players.length,
        from: formatDayMonth(internationalBreak.from, locale),
        to: formatDayMonth(internationalBreak.to, locale),
      }),
      detail: t("callUpsDetail", {
        players: namesAndOthers(
          internationalBreak.players.map((player) => `${player.name} (${player.nation})`),
          t,
        ),
      }),
      href: squadHref,
    });
  }

  // One booking from a suspension: a matter of the matches to come, the line-up's to weigh. In the league and the cup at
  // YELLOWS_PER_SUSPENSION − 1 yellows, in Europe at EUROPE_YELLOWS_PER_SUSPENSION − 1: a line each.
  const bookingRisks = dashboard.bookingRisks.flatMap(({ name, competitions }) => {
    const domestic = competitions.filter((competition) => competition !== "EUROPE");
    return domestic.length === 0 ? [] : [{ name, competitions: domestic }];
  });
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
  const europeRisks = dashboard.bookingRisks.filter(({ competitions }) => competitions.includes("EUROPE"));
  if (europeRisks.length > 0) {
    todos.push({
      id: "europe-booking-risks",
      severity: "warning",
      icon: BookingCardIcon,
      title: t("europeBookingRisks", { count: europeRisks.length, yellows: EUROPE_YELLOWS_PER_SUSPENSION - 1 }),
      detail: t("bookingRisksDetail", { players: namesAndOthers(europeRisks.map(({ name }) => name), t) }),
      href: lineupHref,
    });
  }

  // The national coach's: a federation's offer, his list, his mission's end.
  todos.push(...coachLines);

  // The market's lines once the club has played: a new manager meets his squad before its buyers and its weak spot. The
  // sales the assistant proposes, and what they would bring all together (the Sell tab keeps every offer).
  const proposed = saleProposals === null || !firstMatchPlayed ? [] : saleProposals.proposals;
  if (proposed.length > 0) {
    const total = proposed.reduce((sum, proposal) => sum + proposal.offer.fee, 0);
    todos.push({
      id: "sale-proposals",
      severity: "neutral",
      icon: HandCoinsIcon,
      title: t("saleProposals", { count: proposed.length }),
      detail: t("saleProposalsDetail", { count: proposed.length, total: formatMoney(total, locale) }),
      href: `${base}/transfers?tab=sell`,
    });
  }
  // A full squad signs nobody (SQUAD_LIMIT): said while a window is open, when signing is what the market is for.
  if (dashboard.windowOpen && club.players >= SQUAD_LIMIT) {
    todos.push({
      id: "squad-full",
      severity: "warning",
      icon: UsersIcon,
      title: t("squadFull", { count: club.players, limit: SQUAD_LIMIT }),
      detail: t("squadFullDetail"),
      href: `${base}/transfers?tab=sell`,
    });
  }

  // Every eleven has a weak spot, an empty slot or one held out of line first, the market's: never an alert, only where
  // to look next, and only while a transfer window is open: out of one, nothing can be done about it. Read on the
  // market's eleven (weakSpotLineup): the assistant's way, the best available at each slot, nobody rested.
  const weakSpot = firstMatchPlayed && dashboard.windowOpen ? weakSpotOf(elevenOf(lineup.formation, lineup.weakSpotLineup.starters)) : null;
  if (weakSpot !== null) {
    todos.push({
      id: "weak-spot",
      severity: "neutral",
      icon: TargetIcon,
      title: t("weakSpot", { position: tPositions(`label.${weakSpot.position}`).toLocaleLowerCase(locale) }),
      detail: weakSpotDetail(weakSpot, t),
      href: `${base}/transfers`,
    });
  }

  // The contracts ending on 30 June, from 1 January (docs/design/simplification.md § 2.2): while the assistant decides
  // them, only the important players he means to let go, whose sheet lets the player decide otherwise; every one of them
  // while the player keeps the contracts.
  const important = dashboard.contractsByAssistant ? dashboard.importantContracts : [];
  if (important.length > 0) {
    todos.push({
      id: "important-contracts",
      severity: "warning",
      icon: FileClockIcon,
      title: t("importantContracts", { players: namesAndOthers(important, t) }),
      detail: t("importantContractsDetail", { count: important.length }),
      href: squadHref,
    });
  }
  const expiring = dashboard.contractsByAssistant ? [] : dashboard.expiringContracts;
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
  return byPriority(todos);
}

/** A line's tile and its text: its title, then its detail, both wrapping. */
function TodoContent({ severity, icon: Icon, title, detail }: Pick<Todo, "severity" | "icon" | "title" | "detail">) {
  return (
    <>
      <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-md", TILE_CLASSES[severity])}>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-[0.9375rem] leading-tight font-bold wrap-break-word">{title}</span>
        {detail !== "" && <span className="block text-[0.8125rem] leading-snug wrap-break-word text-muted-foreground">{detail}</span>}
      </span>
    </>
  );
}

/** A line of the list, whole on a phone: its text wraps, and all of it is the link to where the thing gets done. */
function TodoRow({ href, ...content }: Omit<Todo, "id">) {
  if (href === undefined) {
    return (
      <div className={ROW}>
        <TodoContent {...content} />
      </div>
    );
  }
  return (
    <Link
      href={href}
      data-testid="alert-action"
      className={cn(ROW, "transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
    >
      <TodoContent {...content} />
      <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** Lines of the list, one item each, « alert-{id} ». */
function TodoItems({ todos, className }: { todos: readonly Todo[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {todos.map(({ id, ...todo }) => (
        <li key={id} data-testid={`alert-${id}`}>
          <TodoRow {...todo} />
        </li>
      ))}
    </ul>
  );
}

/** « Voir tout · 2 de plus »: secondary, as the dashboard's other links, a thumb high on a phone, no marker of its own. */
const MORE =
  "flex w-fit cursor-pointer list-none items-center gap-1 rounded-md text-sm font-semibold text-(--club) outline-none hover:text-(--club-hover) focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:min-h-11 [&::-webkit-details-marker]:hidden";

/**
 * What the dashboard asks of the manager, the most important first (TODO_PRIORITY, docs/design/simplification.md § 4.1):
 * a missing goalkeeper, the starters out of the next match, a federation's offer, the contracts (the starters his
 * assistant means to let go, or every one ending while he keeps the contracts himself), the best offer, a thin
 * squad, then the European match and the breaks ahead, the bookings, the injured, the weak spot, a mission's end and the
 * squad's state. The starters out and tired are the player's own eleven's only: the assistant replaces and rests his
 * (§ 3.4). The market's lines wait for the club's first match, the weak spot for a transfer window. Three lines at once,
 * the others behind « Voir tout ».
 */
export function DashboardTodo({ className, ...props }: DashboardTodoProps): ReactNode {
  const t = useTranslations("dashboardTodo");
  const tPositions = useTranslations("positions");
  const tCoach = useTranslations("coachOffer");
  const tNations = useTranslations("nations");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const coachLines = coachLinesOf(
    props.coachTodos ?? [],
    props.coachTournament ?? null,
    `/saves/${props.saveId}`,
    { t, tCoach, tNations, tWorld },
    locale,
  );
  const todos = todosOf(props, t, tPositions, locale, coachLines);
  const more = todos.slice(TODOS_SHOWN);
  return (
    <section aria-labelledby="dashboard-todo" data-testid="dashboard-alerts" className={cn("space-y-2.5", className)}>
      <h2 id="dashboard-todo" className="font-heading text-xl">
        {t("title")}
      </h2>
      {/* Nothing to do: the assistant takes care of the rest (docs/design/simplification.md § 4.1), on a line that leads
          nowhere. */}
      {todos.length === 0 ? (
        <div data-testid="alert-none" className={ROW}>
          <TodoContent severity="ok" icon={UserCheckIcon} title={t("none")} detail="" />
        </div>
      ) : (
        <TodoItems todos={todos.slice(0, TODOS_SHOWN)} />
      )}
      {/* The others in the page, folded: a native disclosure, which opens in place without a request, even before the
          page's script has run, and whose summary says to assistive technologies whether it is open. */}
      {more.length > 0 && (
        <details className="group/todo">
          <summary data-testid="dashboard-alerts-more" className={MORE}>
            <span className="group-open/todo:hidden">{t("seeAll", { count: more.length })}</span>
            <span className="hidden group-open/todo:inline">{t("seeLess")}</span>
            <ChevronDownIcon aria-hidden className="size-4 shrink-0 transition-transform group-open/todo:rotate-180" />
          </summary>
          <TodoItems todos={more} className="mt-2.5" />
        </details>
      )}
    </section>
  );
}
