// A save's first steps: the list of its first three actions on the dashboard, and short tips on its screens. What the
// player has seen is kept in comfort cookies (app/privacy) on the save's own paths: each save has its own, no other
// request carries them, and they end by themselves. No database: lost, they only show again what the game explains.
// One cookie per item, so that writing one reads nothing: a page reached by a client navigation does not see a cookie of
// its own path in document.cookie, and the items would overwrite each other.

const SEEN_COOKIE_PREFIX = "lw_seen_";

export const SEEN_COOKIE_SECONDS = 30 * 24 * 60 * 60;

/** The short tips of a save's screens, closed one by one. */
const TIPS = ["rating", "secondary", "money", "simulation"] as const;

export type Tip = (typeof TIPS)[number];

/** What is remembered: the screens of the first actions, ticked once opened, and the tips closed. */
const SEEN_ITEMS = ["squad", "lineup", ...TIPS] as const;

export type SeenItem = (typeof SEEN_ITEMS)[number];

/** What a save's first steps are at: its club's matches, up to FIRST_STEPS_MATCHES, and what the player has seen. */
export type FirstSteps = {
  matches: number;
  seen: ReadonlySet<SeenItem>;
};

/** Up to how many matches of its club a save's first steps are counted: nothing is left to show from that one on. */
export const FIRST_STEPS_MATCHES = 5;

/** What the cookies of a request say the player has seen, given how to tell whether one is there. */
export function seenItems(hasCookie: (name: string) => boolean): Set<SeenItem> {
  return new Set(SEEN_ITEMS.filter((item) => hasCookie(`${SEEN_COOKIE_PREFIX}${item}`)));
}

/** The list stays, in its own panel under the dashboard's hero, until the club has played: its last match comes next. */
export const showsFirstActions = ({ matches }: FirstSteps): boolean => matches === 0;

/**
 * Whether a screen shows a tip: until it is closed, and until the club's FIRST_STEPS_MATCHES-th match at most, closed or
 * not. The dashboard shows one at a time, and none before the first match, the first actions' time: the money once it
 * is played, then the simulation, from the second match or as soon as the money's is closed.
 */
export function showsTip(tip: Tip, { matches, seen }: FirstSteps): boolean {
  if (seen.has(tip) || matches >= FIRST_STEPS_MATCHES) {
    return false;
  }
  switch (tip) {
    case "money":
      return matches === 1;
    case "simulation":
      return matches >= 2 || (matches === 1 && seen.has("money"));
    default:
      return true;
  }
}

/** In the browser: remembers an item for this save, on the save's paths, so that it is this save's alone. */
export function rememberSeen(saveId: string, item: SeenItem): void {
  document.cookie = `${SEEN_COOKIE_PREFIX}${item}=1; Max-Age=${SEEN_COOKIE_SECONDS}; Path=/saves/${saveId}; SameSite=Lax`;
}
