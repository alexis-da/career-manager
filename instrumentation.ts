import type { Instrumentation } from "next";

/**
 * Runs once when the server starts, before it serves anything: a server without AUTH_SECRET refuses to start, with
 * the command that generates one, instead of failing on the first page that reads the player's cookie.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { readAuthSecret } = await import("./src/auth/identity");
    readAuthSecret(process.env.AUTH_SECRET);
  }
}

/**
 * Every error the server meets while it renders a page, answers a route or runs a Server Action, as Next reports it:
 * recorded for /admin by its route and message, never the request's address, headers or cookies (src/db/errors.ts).
 * On the Node runtime only, where the database is; recording never throws.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { recordServerError } = await import("./src/db/errors");
  await recordServerError(error, { routePath: context.routePath, routeType: context.routeType });
};
