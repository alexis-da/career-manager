// Resume links, their pure part: the shape of a token, the link's path, and what its page says to the browser that opens
// it (src/db/resume-links.ts for the database, app/resume for the page and its button).

/** How long a link lasts, in days. */
export const RESUME_LINK_DAYS = 7;

/** A token's shape: 32 random bytes in base64url, 43 characters. Anything else is no link. */
export const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The path of a link, without its origin: the browser that copies it adds its own (the game's, or a local server's). */
export const resumeLinkPath = (token: string): string => `/resume?t=${token}`;

/** Where a link stands in the database: unknown, spent, out of date, or good for the careers of its user. */
export type ResumeLinkState =
  | { status: "unknown" }
  | { status: "used"; userId: string }
  | { status: "expired"; userId: string }
  | { status: "valid"; userId: string; expiresAt: Date };

/** The player of the browser that opens a link: none, or a user and how many careers they have. */
export type ResumeViewer = { id: string; kind: "ANONYMOUS" | "REGISTERED"; saves: number } | null;

/**
 * What a link's page shows the browser that opens it: why it cannot (« unknown », « used », « expired »); its careers
 * already here (« here »); a browser it would take from someone else, signed in with Google (« account ») or with a
 * career of its own (« other-career »), where nothing is replaced; or the button that brings them (« ready »).
 */
export type ResumeView = "unknown" | "used" | "expired" | "here" | "account" | "other-career" | "ready";

export function resumeViewOf(link: ResumeLinkState, viewer: ResumeViewer): ResumeView {
  if (link.status === "unknown") {
    return "unknown";
  }
  if (viewer !== null && viewer.id === link.userId) {
    return "here";
  }
  if (link.status !== "valid") {
    return link.status;
  }
  if (viewer === null) {
    return "ready";
  }
  if (viewer.kind === "REGISTERED") {
    return "account";
  }
  return viewer.saves > 0 ? "other-career" : "ready";
}
