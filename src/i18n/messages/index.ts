import type { Locale } from "../locale";
import enActions from "./en/actions.json";
import enAdmin from "./en/admin.json";
import enCatalogs from "./en/catalogs.json";
import enChallengeBanner from "./en/challenge-banner.json";
import enChallengeScreen from "./en/challenge-screen.json";
import enChoices from "./en/choices.json";
import enClub from "./en/club.json";
import enCup from "./en/cup.json";
import enDashboard from "./en/dashboard.json";
import enDashboardHero from "./en/dashboard-hero.json";
import enDashboardTodo from "./en/dashboard-todo.json";
import enDecisions from "./en/decisions.json";
import enFixtures from "./en/fixtures.json";
import enHalfTime from "./en/half-time.json";
import enHeader from "./en/header.json";
import enHome from "./en/home.json";
import enLanding from "./en/landing.json";
import enLineup from "./en/lineup.json";
import enLineupPlan from "./en/lineup-plan.json";
import enLive from "./en/live.json";
import enMarket from "./en/market.json";
import enMarketSell from "./en/market-sell.json";
import enObjectives from "./en/objectives.json";
import enOnboarding from "./en/onboarding.json";
import enPlayerSheet from "./en/player-sheet.json";
import enPublic from "./en/public.json";
import enSeasonStart from "./en/season-start.json";
import enSeasons from "./en/seasons.json";
import enSeo from "./en/seo.json";
import enSquad from "./en/squad.json";
import enStandings from "./en/standings.json";
import enTransfers from "./en/transfers.json";
import enWorld from "./en/world.json";
import frActions from "./fr/actions.json";
import frAdmin from "./fr/admin.json";
import frCatalogs from "./fr/catalogs.json";
import frChallengeBanner from "./fr/challenge-banner.json";
import frChallengeScreen from "./fr/challenge-screen.json";
import frChoices from "./fr/choices.json";
import frClub from "./fr/club.json";
import frCup from "./fr/cup.json";
import frDashboard from "./fr/dashboard.json";
import frDashboardHero from "./fr/dashboard-hero.json";
import frDashboardTodo from "./fr/dashboard-todo.json";
import frDecisions from "./fr/decisions.json";
import frFixtures from "./fr/fixtures.json";
import frHalfTime from "./fr/half-time.json";
import frHeader from "./fr/header.json";
import frHome from "./fr/home.json";
import frLanding from "./fr/landing.json";
import frLineup from "./fr/lineup.json";
import frLineupPlan from "./fr/lineup-plan.json";
import frLive from "./fr/live.json";
import frMarket from "./fr/market.json";
import frMarketSell from "./fr/market-sell.json";
import frObjectives from "./fr/objectives.json";
import frOnboarding from "./fr/onboarding.json";
import frPlayerSheet from "./fr/player-sheet.json";
import frPublic from "./fr/public.json";
import frSeasonStart from "./fr/season-start.json";
import frSeasons from "./fr/seasons.json";
import frSeo from "./fr/seo.json";
import frSquad from "./fr/squad.json";
import frStandings from "./fr/standings.json";
import frTransfers from "./fr/transfers.json";
import frWorld from "./fr/world.json";

// The game's messages, one file per zone of the game and per language: src/i18n/messages/<language>/<zone>.json. Each
// file holds namespaces of its own (« positions », « squad »…), never one of another file's.

/**
 * Each zone's messages in both languages: the public pages, the shared catalogs and names, a save's screens, the
 * administrator's page.
 */
export const ZONES = {
  public: { fr: frPublic, en: enPublic },
  home: { fr: frHome, en: enHome },
  landing: { fr: frLanding, en: enLanding },
  seo: { fr: frSeo, en: enSeo },
  world: { fr: frWorld, en: enWorld },
  catalogs: { fr: frCatalogs, en: enCatalogs },
  header: { fr: frHeader, en: enHeader },
  dashboard: { fr: frDashboard, en: enDashboard },
  "dashboard-hero": { fr: frDashboardHero, en: enDashboardHero },
  "dashboard-todo": { fr: frDashboardTodo, en: enDashboardTodo },
  onboarding: { fr: frOnboarding, en: enOnboarding },
  "challenge-banner": { fr: frChallengeBanner, en: enChallengeBanner },
  squad: { fr: frSquad, en: enSquad },
  "player-sheet": { fr: frPlayerSheet, en: enPlayerSheet },
  lineup: { fr: frLineup, en: enLineup },
  "lineup-plan": { fr: frLineupPlan, en: enLineupPlan },
  market: { fr: frMarket, en: enMarket },
  "market-sell": { fr: frMarketSell, en: enMarketSell },
  transfers: { fr: frTransfers, en: enTransfers },
  fixtures: { fr: frFixtures, en: enFixtures },
  standings: { fr: frStandings, en: enStandings },
  cup: { fr: frCup, en: enCup },
  seasons: { fr: frSeasons, en: enSeasons },
  club: { fr: frClub, en: enClub },
  objectives: { fr: frObjectives, en: enObjectives },
  "season-start": { fr: frSeasonStart, en: enSeasonStart },
  "challenge-screen": { fr: frChallengeScreen, en: enChallengeScreen },
  live: { fr: frLive, en: enLive },
  "half-time": { fr: frHalfTime, en: enHalfTime },
  choices: { fr: frChoices, en: enChoices },
  decisions: { fr: frDecisions, en: enDecisions },
  actions: { fr: frActions, en: enActions },
  admin: { fr: frAdmin, en: enAdmin },
} as const;

const fr = {
  ...frPublic,
  ...frHome,
  ...frLanding,
  ...frSeo,
  ...frWorld,
  ...frCatalogs,
  ...frHeader,
  ...frDashboard,
  ...frDashboardHero,
  ...frDashboardTodo,
  ...frOnboarding,
  ...frChallengeBanner,
  ...frSquad,
  ...frPlayerSheet,
  ...frLineup,
  ...frLineupPlan,
  ...frMarket,
  ...frMarketSell,
  ...frTransfers,
  ...frFixtures,
  ...frStandings,
  ...frCup,
  ...frSeasons,
  ...frClub,
  ...frObjectives,
  ...frSeasonStart,
  ...frChallengeScreen,
  ...frLive,
  ...frHalfTime,
  ...frChoices,
  ...frDecisions,
  ...frActions,
  ...frAdmin,
};

/** The game's messages, typed by the French ones: the English ones must have every key (src/i18n/messages.test.ts). */
export type GameMessages = typeof fr;

export const MESSAGES: Record<Locale, GameMessages> = {
  fr,
  en: {
    ...enPublic,
    ...enHome,
    ...enLanding,
    ...enSeo,
    ...enWorld,
    ...enCatalogs,
    ...enHeader,
    ...enDashboard,
    ...enDashboardHero,
    ...enDashboardTodo,
    ...enOnboarding,
    ...enChallengeBanner,
    ...enSquad,
    ...enPlayerSheet,
    ...enLineup,
    ...enLineupPlan,
    ...enMarket,
    ...enMarketSell,
    ...enTransfers,
    ...enFixtures,
    ...enStandings,
    ...enCup,
    ...enSeasons,
    ...enClub,
    ...enObjectives,
    ...enSeasonStart,
    ...enChallengeScreen,
    ...enLive,
    ...enHalfTime,
    ...enChoices,
    ...enDecisions,
    ...enActions,
    ...enAdmin,
  },
};
