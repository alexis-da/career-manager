import { unstable_isUnrecognizedActionError } from "next/navigation";

/**
 * Whether a Server Action failed because the page was loaded from an earlier (or later) deployment: Next's own error
 * class, or its « Failed to find Server Action » message (https://nextjs.org/docs/messages/failed-to-find-server-action).
 * A reload brings the current version: the page then says so (the common.newVersion message).
 */
export function isNewVersionError(error: unknown): boolean {
  return (
    unstable_isUnrecognizedActionError(error) ||
    (error instanceof Error && error.message.includes("Failed to find Server Action"))
  );
}
