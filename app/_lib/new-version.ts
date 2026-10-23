import { unstable_isUnrecognizedActionError } from "next/navigation";

/** Shown when a Server Action of a page from an earlier deployment no longer exists on the server. */
export const NEW_VERSION_MESSAGE = "Une nouvelle version du jeu est en ligne : recharge la page.";

/**
 * Whether a Server Action failed because the page was loaded from an earlier (or later) deployment: Next's own error
 * class, or its « Failed to find Server Action » message (https://nextjs.org/docs/messages/failed-to-find-server-action).
 * A reload brings the current version.
 */
export function isNewVersionError(error: unknown): boolean {
  return (
    unstable_isUnrecognizedActionError(error) ||
    (error instanceof Error && error.message.includes("Failed to find Server Action"))
  );
}
