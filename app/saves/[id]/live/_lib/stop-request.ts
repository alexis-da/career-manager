/**
 * The stop asked for while the clock runs (« Pause à la 30e », `live-coaching-request`), kept for the tab's session, so
 * that a reload stops the match there too. Only the key of the pause asked for is kept (`pauseKey`, « IN_PLAY:30 »):
 * the pause the match already waits at, played on the server and reached by the clock, never anything of what follows
 * it. One per save and match, removed once the match goes on from that pause or skips it, or has gone past it. Without
 * session storage (private browsing, storage blocked), the page's memory keeps it until a reload, as before.
 */

const remembered = new Map<string, string | null>();
const listeners = new Set<() => void>();

/** Where the stop asked for in a match is kept: one per save and match. */
export const stopRequestKey = (saveId: string, fixtureId: string): string => `lw_live_stop:${saveId}:${fixtureId}`;

/** The pause asked for in this match, if any: the page's memory first, then the tab's session (after a reload). */
export function readStopRequest(key: string): string | null {
  const known = remembered.get(key);
  if (known !== undefined) {
    return known;
  }
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Asks for a stop at that pause, or (null) for none, and tells the page. */
export function writeStopRequest(key: string, pause: string | null): void {
  if (readStopRequest(key) === pause) {
    return;
  }
  remembered.set(key, pause);
  try {
    if (pause === null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, pause);
    }
  } catch {
    // The page's memory keeps it until a reload.
  }
  for (const listener of listeners) {
    listener();
  }
}

/** For useSyncExternalStore: a stop asked for, or cancelled, renders the page again. */
export function subscribeToStopRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
