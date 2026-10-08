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
