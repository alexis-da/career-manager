import type { Locale } from "../locale";
import enActions from "./en/actions.json";
import enCatalogs from "./en/catalogs.json";
import enChallengeBanner from "./en/challenge-banner.json";
import enDashboard from "./en/dashboard.json";
import enFixtures from "./en/fixtures.json";
import enHeader from "./en/header.json";
import enLineup from "./en/lineup.json";
import enLive from "./en/live.json";
import enPublic from "./en/public.json";
import enSquad from "./en/squad.json";
import enStandings from "./en/standings.json";
import enTransfers from "./en/transfers.json";
import enWorld from "./en/world.json";
import frActions from "./fr/actions.json";
import frCatalogs from "./fr/catalogs.json";
import frChallengeBanner from "./fr/challenge-banner.json";
import frDashboard from "./fr/dashboard.json";
import frFixtures from "./fr/fixtures.json";
import frHeader from "./fr/header.json";
import frLineup from "./fr/lineup.json";
import frLive from "./fr/live.json";
import frPublic from "./fr/public.json";
import frSquad from "./fr/squad.json";
import frStandings from "./fr/standings.json";
import frTransfers from "./fr/transfers.json";
import frWorld from "./fr/world.json";

// The game's messages, one file per zone of the game and per language: src/i18n/messages/<language>/<zone>.json. Each
// file holds namespaces of its own (« positions », « squad »…), never one of another file's.

/** Each zone's messages in both languages: the public pages, the shared catalogs and names, then a save's screens. */
export const ZONES = {
  public: { fr: frPublic, en: enPublic },
  world: { fr: frWorld, en: enWorld },
  catalogs: { fr: frCatalogs, en: enCatalogs },
  header: { fr: frHeader, en: enHeader },
  dashboard: { fr: frDashboard, en: enDashboard },
  "challenge-banner": { fr: frChallengeBanner, en: enChallengeBanner },
  squad: { fr: frSquad, en: enSquad },
  lineup: { fr: frLineup, en: enLineup },
  transfers: { fr: frTransfers, en: enTransfers },
  fixtures: { fr: frFixtures, en: enFixtures },
  standings: { fr: frStandings, en: enStandings },
  live: { fr: frLive, en: enLive },
  actions: { fr: frActions, en: enActions },
} as const;

const fr = {
  ...frPublic,
  ...frWorld,
  ...frCatalogs,
  ...frHeader,
  ...frDashboard,
  ...frChallengeBanner,
  ...frSquad,
  ...frLineup,
  ...frTransfers,
  ...frFixtures,
  ...frStandings,
  ...frLive,
  ...frActions,
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
    ...enChallengeBanner,
    ...enSquad,
    ...enLineup,
    ...enTransfers,
    ...enFixtures,
    ...enStandings,
    ...enLive,
    ...enActions,
  },
};
