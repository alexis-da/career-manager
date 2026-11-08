import { createHash } from "node:crypto";

// What the game keeps of an error (src/db/errors.ts, /admin): its route and its message, cleaned of anything personal
// and of what varies from one occurrence to the next, and the fingerprint that groups its occurrences. Pure; the
// server's code only (node:crypto).

/** Where an error comes from: the server (onRequestError, instrumentation.ts) or a player's browser. */
export type ErrorSource = "SERVER" | "CLIENT";

/** The longest message and route kept: an error's first line says what it is. */
export const ERROR_MESSAGE_MAX = 300;
export const ERROR_ROUTE_MAX = 200;
/** The longest kind kept (render, route, action, proxy; error, rejection, react). */
export const ERROR_KIND_MAX = 24;

/** What stands for what a message or a route loses. */
const ID = "[id]";

/** An e-mail address, an id (cuid, uuid, long hexadecimal), a long number: never kept as such. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const CUID = /\bc[a-z0-9]{20,30}\b/g;
const HEX = /\b[0-9a-f]{16,}\b/gi;
const LONG_NUMBER = /\b\d{6,}\b/g;
/** A query string or a fragment: tokens and search words live there. */
const QUERY = /[?#][^\s"'`)]*/g;
/** A path segment the router fills in: an id, a number, a slug with digits. */
const DYNAMIC_SEGMENT = /^(?:c[a-z0-9]{20,30}|[0-9a-f-]{16,}|\d+)$/i;

/** A text cut to `max` characters, an ellipsis marking the cut. */
function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * An error's message as the game keeps it: on one line, its e-mail addresses, ids, long numbers and query strings
 * replaced, cut to ERROR_MESSAGE_MAX characters. A message is the code's, but it may quote a value: nothing personal
 * stays.
 */
export function cleanErrorMessage(message: string): string {
  const cleaned = message
    .replace(EMAIL, "[email]")
    .replace(UUID, ID)
    .replace(CUID, ID)
    .replace(HEX, ID)
    .replace(LONG_NUMBER, "[n]")
    .replace(QUERY, "")
    .replace(/\s+/g, " ")
    .trim();
  return cut(cleaned === "" ? "(no message)" : cleaned, ERROR_MESSAGE_MAX);
}

/**
 * A page's route as the game keeps it: its path without query or fragment, each id or number segment replaced by
 * [id] (« /saves/[id]/live »), cut to ERROR_ROUTE_MAX characters. A route never says whose save it was.
 */
export function routeOfPath(path: string): string {
  const pathname = path.replace(QUERY, "").split("/").map((segment) => (DYNAMIC_SEGMENT.test(segment) ? ID : segment)).join("/");
  return cut(pathname === "" ? "/" : pathname, ERROR_ROUTE_MAX);
}

/** A short kind: the router's (render, route, action, proxy) or the browser's (error, rejection, react). */
export function cleanErrorKind(kind: string): string {
  const cleaned = kind.replace(/[^a-z-]/gi, "").toLowerCase();
  return cut(cleaned === "" ? "unknown" : cleaned, ERROR_KIND_MAX);
}

/**
 * The fingerprint that groups an error's occurrences in a day: its source, kind, route and message with every number
 * erased (« Timeout after 5003 ms » and « after 5120 ms » are one error). A truncated SHA-256: the table's key.
 */
export function errorFingerprint(error: { source: ErrorSource; kind: string; route: string; message: string }): string {
  const message = error.message.replace(/\d+/g, "#");
  return createHash("sha256").update(`${error.source}\n${error.kind}\n${error.route}\n${message}`).digest("hex").slice(0, 32);
}
