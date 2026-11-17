/** A screen of an entry that has several: its tab, named in the nav messages by this key, its path « /<key> ». */
export type SectionTab = "squad" | "lineup" | "fixtures" | "standings" | "cup" | "club" | "challenge" | "seasons" | "rewards";

export type Section = {
  key: "dashboard" | "team" | "match" | "transfers" | "club"; // in the nav messages, and in its data-testid: « nav-team »
  home: string; // the path the entry leads to, within the save
  computerHome?: string; // where it leads to instead from 1024 px, when one of its screens has the others beside it
  tabs: readonly SectionTab[];
};

/** The five entries of a save's navigation: every screen of a save lies under one of them. */
export const SECTIONS: readonly Section[] = [
  { key: "dashboard", home: "", tabs: [] },
  { key: "team", home: "/squad", computerHome: "/lineup", tabs: ["squad", "lineup"] },
  { key: "match", home: "/fixtures", computerHome: "/standings", tabs: ["fixtures", "standings", "cup"] },
  { key: "transfers", home: "/transfers", tabs: [] },
  { key: "club", home: "/club", tabs: ["club", "challenge", "seasons", "rewards"] },
];

const LIVE_PATH = "/live";

/**
 * The screens reached by playing rather than from a menu, each under an entry but without a tab: the match live under
 * Match, the season's start (its budget and its objectives) under Club.
 */
const SCREENS_WITHOUT_TAB: readonly { path: string; entry: Section["key"] }[] = [
  { path: LIVE_PATH, entry: "match" },
  { path: "/season-start", entry: "club" },
];

const isUnder = (path: string, parent: string): boolean => path === parent || path.startsWith(`${parent}/`);

/** Whether a path within a save is the match live. */
export const isLivePath = (path: string): boolean => isUnder(path, LIVE_PATH);

/** The tab of a path within a save, if it has one. */
export function tabAt(path: string): SectionTab | undefined {
  return SECTIONS.flatMap(({ tabs }) => tabs).find((tab) => isUnder(path, `/${tab}`));
}

/**
 * The entry a path within a save lies under: the match live under Match and the season's start under Club, without a
 * tab; « » is the dashboard.
 */
export function sectionAt(path: string): Section {
  const tab = tabAt(path);
  const section = SECTIONS.find(
    ({ key, home, tabs }) =>
      (tab !== undefined && tabs.includes(tab)) ||
      (home !== "" && isUnder(path, home)) ||
      SCREENS_WITHOUT_TAB.some((screen) => screen.entry === key && isUnder(path, screen.path)),
  );
  return section ?? SECTIONS[0];
}

/** A tab's data-testid: « nav-lineup »; the tab named like its entry has its own, the entry keeping « nav-club ». */
export const tabTestId = (tab: SectionTab): string => (tab === "club" ? "nav-club-overview" : `nav-${tab}`);

/** The tabs of an entry in a save: « Coupe » only with a cup. */
export function tabsOf(section: Section, hasCup: boolean): SectionTab[] {
  return section.tabs.filter((tab) => hasCup || tab !== "cup");
}
