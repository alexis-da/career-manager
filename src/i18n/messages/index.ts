import type { Locale } from "../locale";
import enActions from "./en/actions.json";
import enAdmin from "./en/admin.json";
import enCatalogs from "./en/catalogs.json";
import enChallengeBanner from "./en/challenge-banner.json";
import enChallengeScreen from "./en/challenge-screen.json";
import enClub from "./en/club.json";
import enCup from "./en/cup.json";
import enDashboard from "./en/dashboard.json";
import enDashboardHero from "./en/dashboard-hero.json";
import enDashboardTodo from "./en/dashboard-todo.json";
import enFixtures from "./en/fixtures.json";
import enHalfTime from "./en/half-time.json";
import enHeader from "./en/header.json";
import enLineup from "./en/lineup.json";
import enLive from "./en/live.json";
import enMarket from "./en/market.json";
import enMarketSell from "./en/market-sell.json";
import enOnboarding from "./en/onboarding.json";
import enPlayerSheet from "./en/player-sheet.json";
import enPublic from "./en/public.json";
import enSeasons from "./en/seasons.json";
import enSquad from "./en/squad.json";
import enStandings from "./en/standings.json";
import enTransfers from "./en/transfers.json";
import enWorld from "./en/world.json";
import frActions from "./fr/actions.json";
import frAdmin from "./fr/admin.json";
import frCatalogs from "./fr/catalogs.json";
import frChallengeBanner from "./fr/challenge-banner.json";
import frChallengeScreen from "./fr/challenge-screen.json";
import frClub from "./fr/club.json";
import frCup from "./fr/cup.json";
import frDashboard from "./fr/dashboard.json";
import frDashboardHero from "./fr/dashboard-hero.json";
import frDashboardTodo from "./fr/dashboard-todo.json";
import frFixtures from "./fr/fixtures.json";
import frHalfTime from "./fr/half-time.json";
import frHeader from "./fr/header.json";
import frLineup from "./fr/lineup.json";
import frLive from "./fr/live.json";
import frMarket from "./fr/market.json";
import frMarketSell from "./fr/market-sell.json";
import frOnboarding from "./fr/onboarding.json";
import frPlayerSheet from "./fr/player-sheet.json";
import frPublic from "./fr/public.json";
import frSeasons from "./fr/seasons.json";
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
  market: { fr: frMarket, en: enMarket },
  "market-sell": { fr: frMarketSell, en: enMarketSell },
  transfers: { fr: frTransfers, en: enTransfers },
  fixtures: { fr: frFixtures, en: enFixtures },
  standings: { fr: frStandings, en: enStandings },
  cup: { fr: frCup, en: enCup },
  seasons: { fr: frSeasons, en: enSeasons },
  club: { fr: frClub, en: enClub },
  "challenge-screen": { fr: frChallengeScreen, en: enChallengeScreen },
  live: { fr: frLive, en: enLive },
  "half-time": { fr: frHalfTime, en: enHalfTime },
  actions: { fr: frActions, en: enActions },
  admin: { fr: frAdmin, en: enAdmin },
} as const;

const fr = {
  ...frPublic,
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
  ...frMarket,
  ...frMarketSell,
  ...frTransfers,
  ...frFixtures,
  ...frStandings,
  ...frCup,
  ...frSeasons,
  ...frClub,
  ...frChallengeScreen,
  ...frLive,
  ...frHalfTime,
  ...frActions,
  ...frAdmin,
};

/** The game's messages, typed by the French ones: the English ones must have every key (src/i18n/messages.test.ts). */
export type GameMessages = typeof fr;

export const MESSAGES: Record<Locale, GameMessages> = {
  fr,
  en: {
    ...enPublic,
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
    ...enMarket,
    ...enMarketSell,
    ...enTransfers,
    ...enFixtures,
    ...enStandings,
    ...enCup,
    ...enSeasons,
    ...enClub,
    ...enChallengeScreen,
    ...enLive,
    ...enHalfTime,
    ...enActions,
    ...enAdmin,
  },
};
