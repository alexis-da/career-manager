/** Query parameter of the home page once an account is deleted: it shows a message (app/page.tsx). */
export const ACCOUNT_DELETED_PARAM = "compte-supprime";

/**
 * Why a Google sign-in came back to the home page without an account, from Auth.js's ?error=<type> (src/auth/auth.ts,
 * pages.error): « refused » when our signIn callback turned the account down (AccessDenied: no verified email), « failed »
 * for any other type. Null without one.
 */
export function signInErrorOf(error: string | string[] | undefined): "refused" | "failed" | null {
  if (typeof error !== "string" || error === "") {
    return null;
  }
  return error === "AccessDenied" ? "refused" : "failed";
}
