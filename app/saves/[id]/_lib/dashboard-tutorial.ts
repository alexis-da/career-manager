import "server-only";
import type { Dashboard } from "@/src/db/dashboard";
import type { ManagedLineup } from "@/src/db/lineup";
import type { ManagedBreak } from "@/src/db/nations-view";
import type { SeasonObjectivesView } from "@/src/db/objectives";
import { ROTATION_FITNESS } from "@/src/engine/balance";
import { isEuropeCode, type EuropeCode } from "@/src/engine/europe";
import { isAvailable } from "@/src/engine/lineup";
import { elevenOf, weakSpotOf } from "@/src/engine/market-proposals";
import { transferWindowCloseDate } from "@/src/engine/world";
import { competitionName } from "@/src/i18n/countries";
import type { Locale } from "@/src/i18n/locale";
import type { Translator } from "@/src/i18n/translator";
import { formatDayMonth } from "@/src/lib/format";
import type { LaterContext, TutorialStepKey } from "@/src/lib/tutorial";

// The dashboard's following days' bubbles (docs/design/tutoriel.md § 1.3): what the dashboard already reads, made into
// the context of the tutorial's rules, and each step's line, target and move. Nothing read here.

/** A club's league-phase matches in each European competition: every other pot home and away, four pots or three. */
const LEAGUE_PHASE_MATCHES: Readonly<Record<EuropeCode, number>> = { "eu.1": 6, "eu.2": 4 };

/** What the dashboard reads, for the following days' steps. */
type DashboardReads = {
  dashboard: Dashboard;
  lineup: ManagedLineup;
  objectives: SeasonObjectivesView | null;
  internationalBreak: ManagedBreak | null;
};

/** A starter who would kick the next match off tired, the most tired first; null when none is. */
function tiredStarterOf(lineup: ManagedLineup): { firstName: string; lastName: string; fitness: number } | null {
  const tired = lineup.lineup.starters
    .map(({ player }) => player)
    .filter((player) => isAvailable(player) && player.fitness < ROTATION_FITNESS)
    .sort((a, b) => a.fitness - b.fitness);
  return tired[0] ?? null;
}

/** The context of the following days' steps, from what the dashboard has read. */
export function laterContextOf({ dashboard, lineup, objectives, internationalBreak }: DashboardReads): LaterContext {
  const next = dashboard.nextMatch?.fixture ?? null;
  return {
    windowOpen: dashboard.windowOpen,
    breakUpcoming: internationalBreak?.state === "upcoming",
    calledUp: internationalBreak?.state === "upcoming" ? internationalBreak.players.length : 0,
    nextMatch: next === null ? null : next.cup ? "cup" : isEuropeCode(next.competitionCode) ? "europe" : "league",
    tiredStarter: tiredStarterOf(lineup) !== null,
    judged: objectives !== null && !objectives.early,
    objectives: objectives !== null,
    europe: objectives?.objectives.some(({ kind }) => kind === "EUROPE") ?? false,
    // A world of two divisions has its national teams from its first season (a challenge save, never a tutorial's, has none).
    nations: dashboard.worldVersion === 2,
  };
}

/** Where the dashboard puts a bubble from lg: under the hero, or just above the objectives it speaks of. */
export type BubblePlace = "hero" | "objectives";

/** A following day's bubble on the dashboard: its line, what it rings, its move, where it goes. */
export type DashboardBubble = {
  text: string;
  target?: string;
  gotIt: boolean;
  doneOn?: string;
  place: BubblePlace;
};

/** The translators a following day's line needs. */
export type BubbleTranslators = {
  tutorial: Translator<"tutorial">;
  nav: Translator<"nav">;
  game: Translator<"gameActions">;
  hero: Translator<"dashboardHero">;
  todo: Translator<"dashboardTodo">;
  positions: Translator<"positions">;
  world: Translator<"world">;
  lineup: Translator<"lineup">;
};

const HERO = '[data-testid="dashboard-next-match"]';
const PREPARE = `${HERO} [data-testid="dashboard-lineup"]`;
const PLAY = `${HERO} [data-testid="next-match"]`;

/** The dashboard's bubble for a following day's step, or the farewell; null for the welcome (the page's own) and the rest. */
export function dashboardBubbleOf(
  step: TutorialStepKey,
  { dashboard, lineup, objectives, internationalBreak }: DashboardReads,
  t: BubbleTranslators,
  locale: Locale,
): DashboardBubble | null {
  switch (step) {
    case "missions":
      return {
        text: t.tutorial("steps.missions", { club: t.nav("club"), rewards: t.nav("rewards") }),
        target: '[data-testid="daily-missions"]',
        gotIt: true,
        doneOn: '[data-testid="mission-change"]',
        place: "hero",
      };
    case "market": {
      const closes = transferWindowCloseDate(dashboard.currentDate);
      const weakSpot = weakSpotOf(elevenOf(lineup.formation, lineup.lineup.starters));
      return {
        text: t.tutorial("steps.market", {
          date: closes === null ? "" : formatDayMonth(closes, locale),
          position: weakSpot === null ? "" : t.positions(`label.${weakSpot.position}`).toLocaleLowerCase(locale),
          market: t.nav("transfers"),
        }),
        // Its move is the Market reached (its own bubble there says so): opened by any way, not this click alone.
        target: '[data-testid="nav-transfers"]',
        gotIt: false,
        place: "hero",
      };
    }
    case "objectives": {
      const chosen = objectives?.objectives.find((objective) => objective.chosen) ?? null;
      return {
        text: t.tutorial(chosen !== null && !chosen.byAssistant ? "steps.objectivesOwn" : "steps.objectives"),
        target: '[data-testid="dashboard-objectives"]',
        gotIt: true,
        doneOn: '[data-testid="dashboard-objectives-detail"]',
        place: "objectives",
      };
    }
    case "simulate":
      return {
        text: t.tutorial("steps.simulate", { simulate: t.game("simulateShort") }),
        target: `${HERO} [data-testid="simulate-menu"]`,
        gotIt: true,
        doneOn: `${HERO} [data-testid="simulate-menu"]`,
        place: "hero",
      };
    case "break": {
      const count = internationalBreak?.state === "upcoming" ? internationalBreak.players.length : 0;
      return {
        text: count > 0 ? t.tutorial("steps.break", { count }) : t.tutorial("steps.breakNone"),
        target: '[data-testid="hero-break"]',
        gotIt: true,
        doneOn: PLAY,
        place: "hero",
      };
    }
    case "europe": {
      const code = dashboard.nextMatch?.fixture.competitionCode ?? "eu.1";
      return {
        text: t.tutorial("steps.europe", {
          competition: competitionName(code, t.world),
          count: isEuropeCode(code) ? LEAGUE_PHASE_MATCHES[code] : LEAGUE_PHASE_MATCHES["eu.1"],
        }),
        target: HERO,
        gotIt: true,
        doneOn: PLAY,
        place: "hero",
      };
    }
    case "cup":
      return { text: t.tutorial("steps.cup"), target: HERO, gotIt: true, doneOn: PLAY, place: "hero" };
    case "fitness": {
      const tired = tiredStarterOf(lineup);
      if (tired === null) {
        return null;
      }
      return {
        text: t.tutorial("steps.fitness", {
          player: `${tired.firstName.charAt(0)}. ${tired.lastName}`,
          fitness: Math.round(tired.fitness),
          automatic: t.lineup("automatic"),
        }),
        target: PREPARE,
        gotIt: false,
        doneOn: PREPARE,
        place: "hero",
      };
    }
    case "judged":
      return {
        text: t.tutorial("steps.judged"),
        target: '[data-testid="dashboard-confidence"]',
        gotIt: true,
        doneOn: '[data-testid="dashboard-objectives-detail"]',
        place: "objectives",
      };
    case "lineup":
      // Its screen never opened by the third day: pushed by « Préparer », its bubble then shown on the line-up itself.
      return { text: t.tutorial("steps.lineupPush", { prepare: t.hero("prepare") }), target: PREPARE, gotIt: false, place: "hero" };
    case "farewell":
      return { text: t.tutorial("steps.farewell", { todo: t.todo("title") }), gotIt: true, place: "hero" };
    default:
      return null;
  }
}
