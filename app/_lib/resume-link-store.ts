// The resume link of this tab (InAppNotice, ResumeLinkCopy): asked once of the server (createResumeLinkAction) when an
// in-app page with a career opens, then kept 30 minutes in the tab's session, so that the next pages reuse it rather than
// ask again: the copy and « Ouvrir dans Chrome » then happen in the touch itself, as an iPhone's clipboard and an Android
// intent want. Its path only, never its origin. Without session storage, the page's memory keeps it.

import { createResumeLinkAction } from "../actions";

const STORAGE_KEY = "lw_resume_link";

/** How long a tab reuses a link before asking for another: well within its 7 days, and few asked in an hour. */
const KEEP_MS = 30 * 60 * 1000;

let path: string | null = null;
let failed = false;
let asking = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** The link this tab keeps, if it is recent enough. */
function storedPath(now: number): string | null {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof stored === "object" && stored !== null && "path" in stored && "at" in stored) {
      const { path: kept, at } = stored;
      return typeof kept === "string" && typeof at === "number" && now - at < KEEP_MS ? kept : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** For useSyncExternalStore: the link's path, once known. */
export const resumeLinkPathSnapshot = (): string | null => path;

/** For useSyncExternalStore: whether the server gave none (no career, too many asked in the hour, a failure). */
export const resumeLinkFailedSnapshot = (): boolean => failed;

export function subscribeToResumeLink(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Asks the server for a link when this tab has none, one request at a time. */
export function ensureResumeLink(): void {
  if (path !== null || asking) {
    return;
  }
  // Not simulation code: how long a tab keeps a link is real time.
  const kept = storedPath(Date.now());
  if (kept !== null) {
    path = kept;
    notify();
    return;
  }
  asking = true;
  failed = false;
  createResumeLinkAction()
    .then(
      (result) => {
        if (!result.ok) {
          failed = true;
          return;
        }
        path = result.path;
        try {
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path: result.path, at: Date.now() }));
        } catch {
          // The page's memory keeps it.
        }
      },
      () => {
        failed = true;
      },
    )
    .finally(() => {
      asking = false;
      notify();
    });
}
