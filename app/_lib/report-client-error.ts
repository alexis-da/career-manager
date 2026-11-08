// A player's browser reports the game's errors to the server (POST /api/client-errors, which cleans and groups them,
// src/db/errors.ts): an uncaught error, an unhandled rejection, a page React could not render. A few a page at most,
// each once, never an extension's nor a cross-origin script's (« Script error. », nothing to learn from), never the
// stack, the cookies or the query string. A beacon: it reaches the server even from a page about to close.

/** The route the browser sends its reports to. */
export const CLIENT_ERRORS_ENDPOINT = "/api/client-errors";
/** The most reports a page sends, however many errors it meets. */
export const MAX_REPORTS_PER_PAGE = 5;
/** The longest message and route sent; the server cuts them shorter still. */
const MAX_SENT_LENGTH = 500;

export type ClientErrorKind = "error" | "rejection" | "react";

/** Errors with nothing to learn from: a cross-origin script's, the browser's own layout loop warning. */
const IGNORED = [/^Script error\.?$/i, /ResizeObserver loop/i];
/** Scripts the game did not write: the browser's extensions. */
const EXTENSION = /^(?:chrome|moz|safari(?:-web)?|ms-browser)-extension:/;

const sent = new Set<string>();

/** An error's name and message, or what a rejection gave; null when nothing says anything. */
function messageOf(error: unknown): string | null {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? null;
  } catch {
    return null;
  }
}

/** Sends a report, once per error and page, MAX_REPORTS_PER_PAGE a page at most; never throws. */
export function reportClientError(kind: ClientErrorKind, error: unknown, source?: string): void {
  if (typeof window === "undefined" || (source !== undefined && EXTENSION.test(source))) {
    return;
  }
  const message = messageOf(error);
  if (message === null || message.trim() === "" || IGNORED.some((pattern) => pattern.test(message))) {
    return;
  }
  const route = window.location.pathname;
  const key = `${kind}\n${route}\n${message}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS_PER_PAGE) {
    return;
  }
  sent.add(key);
  const body = JSON.stringify({ kind, message: message.slice(0, MAX_SENT_LENGTH), route: route.slice(0, MAX_SENT_LENGTH) });
  try {
    if (navigator.sendBeacon?.(CLIENT_ERRORS_ENDPOINT, new Blob([body], { type: "application/json" })) === true) {
      return;
    }
  } catch {
    // A browser that refuses the beacon still has fetch.
  }
  void fetch(CLIENT_ERRORS_ENDPOINT, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => undefined);
}

/** Forgets what was sent: for the tests, a page being a module's life. */
export function resetClientErrorReports(): void {
  sent.clear();
}
